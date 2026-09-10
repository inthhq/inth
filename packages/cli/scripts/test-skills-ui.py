"""Check the native skill picker before any installer or network access."""
import fcntl
import json
import os
import pty
import select
import signal
import struct
import subprocess
import sys
import tempfile
import termios
import time


def check(cancel=None):
    with tempfile.TemporaryDirectory(prefix="inth-skills-ui-") as directory:
        installer = os.path.join(directory, "npx")
        marker = os.path.join(directory, "started")
        with open(installer, "w") as target:
            target.write(
                "#!" + sys.executable + "\n"
                "import json, os, sys\n"
                "open('started', 'w').close()\n"
                "print(json.dumps(sys.argv[1:]))\n"
            )
        os.chmod(installer, 0o755)
        master, slave = pty.openpty()
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 18, 90, 0, 0))
        original = termios.tcgetattr(slave)
        started = time.perf_counter()
        child = subprocess.Popen(
            [sys.argv[1], "skills", "--global", "--agent", "claude-code"],
            cwd=directory, stdin=slave, stdout=subprocess.PIPE, stderr=slave,
            env=dict(os.environ, PATH="" if cancel else directory,
                     TERM="xterm-256color", NO_COLOR="1", INTH_TELEMETRY_DISABLED="1"),
        )
        output = bytearray()
        try:
            deadline = time.monotonic() + 5
            while b"Consent management" not in output:
                assert time.monotonic() < deadline, bytes(output)
                assert child.poll() is None, bytes(output)
                if select.select([master], [], [], 0.05)[0]:
                    output.extend(os.read(master, 65536))
            prompt_ms = (time.perf_counter() - started) * 1000
            assert b"Choose an Inth skill" in output
            assert b"c15t" in output
            assert not os.path.exists(marker), "Installer started before selection"
            assert not select.select([child.stdout], [], [], 0)[0], "Picker polluted stdout"
            if cancel == "sigterm":
                child.send_signal(signal.SIGTERM)
            elif cancel:
                os.write(master, b"\x1b" if cancel == "escape" else b"\x03")
            else:
                os.write(master, b"\x1b[B\r")
            stdout, _ = child.communicate(timeout=5)
            while select.select([master], [], [], 0)[0]:
                output.extend(os.read(master, 65536))
            restored = termios.tcgetattr(slave)
            restored[3] &= ~getattr(termios, "PENDIN", 0)
            original[3] &= ~getattr(termios, "PENDIN", 0)
            assert restored == original, "Terminal mode was not restored"
            if cancel:
                assert child.returncode == 130, bytes(output)
                assert b"cancelled" in output.lower()
                assert b"MCP" not in output and b"Organization" not in output
                assert not os.path.exists(marker)
                assert stdout == b""
            else:
                assert child.returncode == 0, bytes(output)
                assert json.loads(stdout) == [
                    "--yes", "skills", "add", "c15t/skills", "--skill", "c15t",
                    "--global", "--agent", "claude-code",
                ]
            return prompt_ms
        finally:
            if child.poll() is None:
                child.kill()
                child.wait()
            os.close(master)
            os.close(slave)


timings = [check(), check("escape"), check("ctrl-c"), check("sigterm")]
print("Skills picker passed: offline startup, selection, deferred installer, cancellation, and terminal restoration.")
print("Time to picker in ms:", ", ".join(f"{value:.1f}" for value in timings))
