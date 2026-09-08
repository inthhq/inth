"""Measure observed terminal latency. Never persist prompt contents or credentials."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import platform
import pty
import select
import statistics
import struct
import subprocess
import termios
import time

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--live", action="store_true", help="Measure native switch against the live API, cancelling the picker")
parser.add_argument("--node", default="node")
args = parser.parse_args()


def sample(command, live=False, iteration=0):
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 24, 100, 0, 0))
    original = termios.tcgetattr(slave)
    environment = dict(os.environ, INTH_TELEMETRY_DISABLED="1", TERM="xterm-256color", CI="", NO_COLOR="1", INTH_TEST_LONG_LIST="0")
    environment.pop("INTH_TOKEN", None)
    started = time.perf_counter_ns()
    child = subprocess.Popen(command, stdin=slave, stdout=subprocess.PIPE, stderr=slave, env=environment)
    captured = b""
    try:
        deadline = time.monotonic() + 30

        def until(predicate):
            nonlocal captured
            while not predicate(captured):
                if time.monotonic() > deadline:
                    raise RuntimeError("Timed out waiting for terminal output")
                if select.select([master], [], [], 0.001)[0]:
                    captured += os.read(master, 65536)
                if child.poll() is not None and not predicate(captured):
                    # Do not include captured output: live labels may contain private data.
                    raise RuntimeError(f"Exited before the selector milestone, status {child.returncode}")
            return time.perf_counter_ns()

        # The second label is emitted after the initial radio row; for live mode
        # wait for an instruction/footer emitted after the choices.
        ready = until(lambda data: b"Choose your default organization" in data and
                      ((b"2/" in data or b"1/" in data or b"Enter" in data) if live else b"Two" in data))
        if live:
            os.write(master, b"\x03")
            confirmed = time.perf_counter_ns()
            redraw_ms = None
        else:
            # Vary input timing so native polling is not always sampled at the
            # same phase. Delays are outside the measured keyboard intervals.
            time.sleep((7 + (iteration % 5) * 11) / 1000)
            captured = b""
            pressed = time.perf_counter_ns()
            os.write(master, b"\x1b[B")
            changed = until(lambda data: "● Two".encode() in data or b"(*) Two" in data)
            redraw_ms = (changed - pressed) / 1e6
            time.sleep((3 + (iteration % 5) * 13) / 1000)
            confirmed = time.perf_counter_ns()
            os.write(master, b"\r")
        # Drain the PTY while waiting: restoring raw mode can wait for terminal
        # output to drain, so communicate() alone would stall the Node adapter.
        completed = until(lambda _data: child.poll() is not None)
        stdout = child.stdout.read()
        expected_status = 130 if live else 0
        if child.returncode != expected_status:
            raise RuntimeError(f"Unexpected selector exit: {child.returncode}")
        if stdout != (b"" if live else b"Selected: org-two\n"):
            raise RuntimeError("Unexpected selector result")
        restored = termios.tcgetattr(slave)
        restored[3] &= ~getattr(termios, "PENDIN", 0)
        original[3] &= ~getattr(termios, "PENDIN", 0)
        if restored != original:
            raise RuntimeError("Terminal settings were not restored")
        return {"launch_to_picker_ms": (ready - started) / 1e6,
                "arrow_to_redraw_ms": redraw_ms,
                "confirm_or_cancel_to_exit_ms": (completed - confirmed) / 1e6}
    finally:
        if child.poll() is None:
            child.kill()
            child.wait()
        child.stdout.close()
        os.close(master)
        os.close(slave)


def summarize(samples):
    result = {}
    for key in samples[0]:
        values = sorted(s[key] for s in samples if s[key] is not None)
        if values:
            result[key] = {"median": statistics.median(values),
                           "p95": values[max(0, (95 * len(values) + 99) // 100 - 1)],
                           "min": min(values), "max": max(values)}
    return result


if args.live:
    targets = [("Scriptc live switch", [str(ROOT / "dist/inth"), "switch"])]
    warmups, iterations = 1, 10
    scope = "Native production switch against api.inth.com, fresh processes with warm filesystem caches; real saved sign-in, production Keychain/locking/HTTP/membership parsing and terminal rendering. Cancel at the picker, no default organization writes. Includes network latency and any automatic token refresh. Warmup is recorded separately. No prompt contents or credentials saved. p95 of ten samples is their maximum."
else:
    targets = [("Scriptc selector", [str(ROOT / "build/native/ui-test")]),
               ("yao-pkg selector", [str(ROOT / "dist-bin/yao/inth-selector-bench")]),
               ("Node bundled selector", [args.node, str(ROOT / "build/yao/dist/inth.js")])]
    warmups, iterations = 3, 30
    scope = "Interleaved fresh processes with warm filesystem caches. Identical two-organization fixture using production selection policy and terminal adapters, in a 100x24 PTY. Parent measures first complete choices, sends Down, observes redraw, sends Enter and waits for exit. Input delays vary across five phases and are excluded from keyboard intervals. Includes spawn, imports and terminal I/O; excludes API, credential lookup, token refresh, configuration writes and human think time. Node runs the same bundled JavaScript packaged by yao. Implementation comparison, not isolated compiler throughput."
results = [{"target": name, "samples": [], "warmup_samples": []} for name, _ in targets]
for iteration in range(warmups + iterations):
    for offset in range(len(targets)):
        index = (iteration + offset) % len(targets)
        value = sample(targets[index][1], args.live, iteration)
        results[index]["warmup_samples" if iteration < warmups else "samples"].append(value)
for result in results:
    result["summary"] = summarize(result["samples"])
report = {"measured_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
          "platform": platform.platform(), "iterations": iterations, "warmups": warmups,
          "cpu": subprocess.check_output(["sysctl", "-n", "machdep.cpu.brand_string"], text=True).strip(),
          "node": subprocess.check_output([args.node, "--version"], text=True).strip(),
          "scope": scope, "results": results}
filename = ROOT / "bench" / ("switch-live-results.json" if args.live else "switch-selector-results.json")
filename.write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps([{ "target": r["target"], "summary": r["summary"], "warmup_samples": r["warmup_samples"] } for r in results], indent=2))
