"""Check MCP setup in a real terminal without writing client configuration."""
import fcntl
import os
import pty
import select
import struct
import subprocess
import sys
import tempfile
import termios
import time


def check(cancel=False):
    with tempfile.TemporaryDirectory(prefix="inth-mcp-ui-") as directory:
        master, slave = pty.openpty()
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 18, 60, 0, 0))
        original = termios.tcgetattr(slave)
        child = subprocess.Popen(
            [sys.argv[1], "mcp", "--dry-run"],
            cwd=directory, stdin=slave, stdout=subprocess.PIPE, stderr=slave,
            env=dict(os.environ, TERM="xterm-256color", NO_COLOR="1"),
        )
        output = bytearray()

        def until(marker):
            deadline = time.monotonic() + 5
            while marker not in output:
                assert time.monotonic() < deadline, bytes(output)
                assert child.poll() is None, bytes(output)
                if select.select([master], [], [], 0.05)[0]:
                    output.extend(os.read(master, 65536))

        try:
            until(b"Choose an MCP client")
            if cancel:
                os.write(master, b"\x1b")
            else:
                os.write(master, b"\r")
                until(b"Choose where to configure Inth MCP")
                os.write(master, b"\r")
            stdout, _ = child.communicate(timeout=5)
            while select.select([master], [], [], 0)[0]:
                output.extend(os.read(master, 65536))
            restored = termios.tcgetattr(slave)
            restored[3] &= ~getattr(termios, "PENDIN", 0)
            original[3] &= ~getattr(termios, "PENDIN", 0)
            assert restored == original, "Terminal mode was not restored"
            assert b"(codex)" not in output
            assert b"(global)" not in output
            assert "◇".encode() not in output, "Selection left duplicate summaries"
            if cancel:
                assert child.returncode == 130, bytes(output)
                assert b"MCP setup cancelled" in output
                assert b"Organization" not in output
                assert stdout == b""
            else:
                assert child.returncode == 0, bytes(output)
                assert b"Add Inth to Codex" in stdout
                assert b"inth mcp setup --agent codex --scope project" in stdout
                assert directory.encode() not in stdout
                assert "\x1b" not in stdout.decode()
                assert not os.listdir(directory), "Dry run wrote configuration"
        finally:
            if child.poll() is None:
                child.kill()
                child.wait()
            os.close(master)
            os.close(slave)


check()
check(cancel=True)
print("MCP terminal setup passed: client labels, clean summary, next command, dry run, cancellation, and terminal restoration.")
