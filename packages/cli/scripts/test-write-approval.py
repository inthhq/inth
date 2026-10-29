"""Check that the native picker leaves the complete billing review visible."""
import fcntl
import json
import os
import pty
import select
import struct
import subprocess
import sys
import termios
import time


def check(confirm):
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 24, 80, 0, 0))
    child = subprocess.Popen(
        [sys.argv[1], "http://127.0.0.1:1", "/unused", "interactive"],
        stdin=slave, stdout=subprocess.PIPE, stderr=slave,
        env=dict(os.environ, TERM="xterm-256color", NO_COLOR="1", INTH_TELEMETRY_DISABLED="1"),
    )
    output = b""
    try:
        deadline = time.monotonic() + 10
        while b"Enter Select" not in output:
            assert time.monotonic() < deadline, f"Prompt not shown: {output!r}"
            if select.select([master], [], [], 0.1)[0]:
                output += os.read(master, 65536)
            assert child.poll() is None, f"Exited before prompt: {output!r}"
        review, picker = output.split(b"\xe2\x97\x86", 1)
        for field in [b'"currency":"usd"', b'"total":1200', b'"startsAt":"2026-11-29T15:45:00Z"', b'"plan":"starter"', b'"organizationId":"org_123"']:
            assert field in review, f"Review hides {field!r}: {output!r}"
        assert b"Confirm reviewed action" in picker, picker
        if confirm:
            os.write(master, b"\x1b[B")
            time.sleep(0.05)
        os.write(master, b"\r")
        child.wait(timeout=10)
        assert child.returncode == (0 if confirm else 130), (child.returncode, output)
        result = json.loads(child.stdout.readline())
        assert result["mutations"] == (1 if confirm else 0), result
    finally:
        if child.poll() is None:
            child.kill()
            child.wait()
        child.stdout.close()
        os.close(master)
        os.close(slave)


check(False)
check(True)
print("Native billing approval passed at 80 columns: complete review, default cancellation and one confirmed mutation.")
