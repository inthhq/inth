"""Check that interactive inth c15t creates a project only after local checks pass."""
import fcntl
import json
import os
import pty
import re
import select
import struct
import subprocess
import sys
import tempfile
import termios
import time


def read_until(master, child, output, text, timeout=15):
    deadline = time.monotonic() + timeout
    while text not in output:
        assert time.monotonic() < deadline, bytes(output)
        assert child.poll() is None, bytes(output)
        if select.select([master], [], [], 0.05)[0]:
            output.extend(os.read(master, 65536))


def run(conflict=False, cancel=False):
    with tempfile.TemporaryDirectory(prefix="inth-c15t-ui-") as directory:
        with open(os.path.join(directory, "package.json"), "w") as manifest:
            json.dump({"name": "site", "dependencies": {"react": "19.0.0"}}, manifest)
        target = os.path.join(directory, "src", "consent", "consent-manager.tsx")
        if conflict:
            os.makedirs(os.path.dirname(target))
            with open(target, "w") as existing:
                existing.write("// existing consent code\n")
        master, slave = pty.openpty()
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 24, 100, 0, 0))
        child = subprocess.Popen(
            [sys.argv[1], "c15t", "--organization", "org_acme", "--skip-install"],
            cwd=directory, stdin=slave, stdout=slave, stderr=slave,
            # No coding agents on PATH, so scaffolding is the first setup choice.
            env=dict(os.environ, PATH="/usr/bin:/bin", TERM="xterm-256color",
                     NO_COLOR="1", INTH_TELEMETRY_DISABLED="1",
                     INTH_TEST_C15T_INTERACTIVE="1"),
        )
        output = bytearray()
        try:
            read_until(master, child, output, b'Create a new project named "site"')
            os.write(master, b"\r")
            read_until(master, child, output, b"How do you want to set up c15t")
            os.write(master, b"\r")
            if not conflict:
                # Files are confirmed, and the region chosen, before creation.
                read_until(master, child, output, b"Write these files?")
                os.write(master, b"\x1b[B\r" if cancel else b"\r")
            if not conflict and not cancel:
                read_until(master, child, output, b"Choose a region for the project")
                os.write(master, b"\r")
            child.wait(timeout=30)
            while select.select([master], [], [], 0.05)[0]:
                output.extend(os.read(master, 65536))
            text = re.sub(rb"\x1b\[[0-9;?]*[A-Za-z]", b"", bytes(output)).decode()
            calls = json.loads(re.search(r"CALLS (\[.*\])", text).group(1))
            if conflict or cancel:
                assert child.returncode == 1, text
                expected = "Refusing to overwrite existing file" if conflict else "c15t setup cancelled"
                assert expected in text, text
                assert not any(call.startswith("POST") for call in calls), calls
                assert b"Choose a region" not in output, text
                assert not cancel or not os.path.exists(target), text
            else:
                assert child.returncode == 0, text
                assert any(call.startswith("POST /v1/projects") for call in calls), calls
                assert os.path.exists(target), text
        finally:
            if child.poll() is None:
                child.kill()
                child.wait()
            os.close(master)
            os.close(slave)


run(conflict=True)
run(cancel=True)
run()
print("c15t picker passed: new projects are created only after scaffold checks and confirmation.")
