"""Check c15t's recommended agent route and explicit scaffold confirmation."""
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
        if select.select([master], [], [], 0.05)[0]:
            output.extend(os.read(master, 65536))
        else:
            assert child.poll() is None, bytes(output)


def run(conflict=False, cancel=False):
    with tempfile.TemporaryDirectory(prefix="inth-c15t-ui-") as directory:
        with open(os.path.join(directory, "package.json"), "w") as manifest:
            json.dump({"name": "site", "dependencies": {"react": "19.0.0"}}, manifest)
        target = os.path.join(directory, "src", "consent.tsx")
        if conflict:
            os.makedirs(os.path.dirname(target))
            with open(target, "w") as existing:
                existing.write("// existing consent code\n")
        master, slave = pty.openpty()
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 24, 100, 0, 0))
        child = subprocess.Popen(
            [sys.argv[1], "c15t", "--organization", "org_acme", "--skip-install"],
            cwd=directory, stdin=slave, stdout=slave, stderr=slave,
            # No coding agents on PATH, so the setup prompt is recommended first.
            env=dict(os.environ, PATH="/usr/bin:/bin", TERM="xterm-256color",
                     NO_COLOR="1", INTH_TELEMETRY_DISABLED="1",
                     INTH_TEST_C15T_INTERACTIVE="1"),
        )
        output = bytearray()
        try:
            read_until(master, child, output, b'Create a new project named "site"')
            os.write(master, b"\r")
            read_until(master, child, output, b"How do you want to set up c15t")
            os.write(master, b"\x1b[B\r")
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


def run_default(installed_agent):
    with tempfile.TemporaryDirectory(prefix="inth-c15t-default-") as directory:
        with open(os.path.join(directory, "package.json"), "w") as manifest:
            json.dump({"name": "site", "dependencies": {"react": "19.0.0"}}, manifest)
        # Keep the fake agent outside the app so we can check for app writes.
        with tempfile.TemporaryDirectory(prefix="inth-c15t-agent-") as bin_directory:
            prompt_file = os.path.join(bin_directory, "prompt.txt")
            if installed_agent:
                executable = os.path.join(bin_directory, "codex")
                with open(executable, "w") as agent:
                    agent.write('#!/bin/sh\nprintf "%s" "$1" > "' + prompt_file + '"\n')
                os.chmod(executable, 0o755)
            master, slave = pty.openpty()
            fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 24, 100, 0, 0))
            child = subprocess.Popen(
                [sys.argv[1], "c15t", "--project", "Website", "--organization", "org_acme"],
                cwd=directory, stdin=slave, stdout=slave, stderr=slave,
                env=dict(os.environ, PATH=bin_directory + ":/usr/bin:/bin",
                         TERM="xterm-256color", NO_COLOR="1", INTH_TELEMETRY_DISABLED="1",
                         INTH_TEST_C15T_INTERACTIVE="1"),
            )
            output = bytearray()
            try:
                recommended = (b"Use a coding agent (recommended)" if installed_agent
                               else b"Show the setup prompt for your agent (recommended)")
                read_until(master, child, output, recommended)
                os.write(master, b"\r")
                if installed_agent:
                    read_until(master, child, output, b"Pick an agent")
                    os.write(master, b"\r")
                read_until(master, child, output, b"CALLS ")
                child.wait(timeout=15)
                while select.select([master], [], [], 0.05)[0]:
                    output.extend(os.read(master, 65536))
                text = re.sub(rb"\x1b\[[0-9;?]*[A-Za-z]", b"", bytes(output)).decode()
                assert child.returncode == 0, text
                if installed_agent:
                    with open(prompt_file) as prompt:
                        setup_prompt = prompt.read()
                    assert "Starting Codex" in text, text
                else:
                    setup_prompt = text
                assert "Set up c15t v3" in setup_prompt, setup_prompt
                assert '"mode": "hosted"' in setup_prompt, setup_prompt
                assert "https://acme-website.c15t.dev" in setup_prompt, setup_prompt
                calls = json.loads(re.search(r"CALLS (\[.*\])", text).group(1))
                assert not any(call.startswith("POST") for call in calls), calls
                assert os.listdir(directory) == ["package.json"], os.listdir(directory)
            finally:
                if child.poll() is None:
                    child.kill()
                    child.wait()
                os.close(master)
                os.close(slave)


run_default(installed_agent=True)
run_default(installed_agent=False)
run(conflict=True)
run(cancel=True)
run()
print("c15t picker passed: agent setup is recommended; scaffold creation waits for checks and confirmation.")
