"""Exercise the real terminal adapters without credentials or network access."""
import fcntl
import os
import pty
import select
import signal
import struct
import subprocess
import sys
import termios
import time


def check(keys, expected, long_list=False, terminate=None, fatal=False, fragment_delay=0.025):
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 12, 48, 0, 0))
    original = termios.tcgetattr(slave)
    environment = dict(os.environ, TERM="xterm-256color", CI="", INTH_TEST_LONG_LIST="1" if long_list else "0")
    child = subprocess.Popen(sys.argv[1:], stdin=slave, stdout=subprocess.PIPE, stderr=slave, env=environment)
    output = b""
    input_times = []
    try:
        deadline = time.monotonic() + 5
        while b"Choose your default organization" not in output:
            assert time.monotonic() < deadline, f"Prompt not shown: {output!r}"
            if select.select([master], [], [], 0.1)[0]:
                output += os.read(master, 65536)
            assert child.poll() is None, f"Exited before prompt: {output!r}"
        assert not select.select([child.stdout], [], [], 0)[0], "Prompt polluted stdout"
        # Let each frame settle and deliberately split one arrow sequence.
        for key in keys:
            os.write(master, key)
            input_times.append((key, time.monotonic()))
            if key == b"\x1b" and expected:
                # Keep this short, deliberate gap independent of sleep timer
                # coalescing, which can outlast the terminal's Escape timeout.
                fragment_at = time.monotonic() + fragment_delay
                while time.monotonic() < fragment_at:
                    pass
            else:
                time.sleep(0.025)
        if terminate:
            child.send_signal(terminate)
        deadline = time.monotonic() + 5
        while child.poll() is None:
            assert time.monotonic() < deadline, f"Prompt hung: {output!r}"
            if select.select([master], [], [], 0.05)[0]:
                output += os.read(master, 65536)
        while select.select([master], [], [], 0)[0]:
            output += os.read(master, 65536)
        stdout = child.stdout.read().decode()
        restored = termios.tcgetattr(slave)
        # macOS sets PENDIN when tcsetattr restores canonical input; it is kernel state.
        restored[3] &= ~getattr(termios, "PENDIN", 0)
        original[3] &= ~getattr(termios, "PENDIN", 0)
        assert restored == original, f"Terminal settings were not restored: {original!r} -> {restored!r}"
        assert b"\x1b[?25h" in output, "Cursor not restored"
        assert b"Organization number" not in output
        if expected:
            input_gaps = [(key, round((at - input_times[0][1]) * 1000, 1)) for key, at in input_times]
            assert child.returncode == 0, (output, {"input_ms": input_gaps})
            assert stdout == f"Selected: {expected}\n", (stdout, output)
        else:
            assert child.returncode == (-terminate if fatal else 130), (child.returncode, output)
            assert stdout == "", stdout
            if not fatal:
                assert b"cancelled" in output.lower(), output
    finally:
        if child.poll() is None:
            child.kill()
            child.wait()
        child.stdout.close()
        os.close(master)
        os.close(slave)


check([b"\x1b", b"[B", b"\r"], "org-two")
check([b"\x1b[A", b"\r"], "org-two")
check([b"\x1b[B", b"\x1b[B", b"\r"], "org-one")
check([b"\x1b"], None)
check([b"\x03"], None)
check([], None, terminate=signal.SIGTERM)
if len(sys.argv) == 2:
    # The native adapter controls its own escape timeout; Clack does not.
    check([b"\x1b", b"[B", b"\r"], "org-two", fragment_delay=0.12)
    check([], None, terminate=signal.SIGHUP, fatal=True)
    check([], None, terminate=signal.SIGQUIT, fatal=True)
check([b"\x1b[B"] * 11 + [b"\r"], "org-12", long_list=True)
print("Terminal selector passed: arrows, wrapping, fragmented input, Escape, Ctrl+C, SIGTERM, long Unicode labels, stderr output, terminal restoration.")
