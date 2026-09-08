"""Check compiled whoami formatting in real terminal widths using fake API data."""
import errno
import fcntl
import json
import os
import pty
import re
import select
import struct
import subprocess
import sys
import termios
import time
import unicodedata


def render(columns, scenario="layout", no_color=None, term="xterm-256color", machine=False):
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 24, columns, 0, 0))
    env = dict(os.environ, TERM=term)
    env.pop("NO_COLOR", None)
    if no_color is not None:
        env["NO_COLOR"] = no_color
    args = [sys.argv[1], scenario, "--selected"]
    if machine:
        args.append("--json")
    child = subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=slave, stderr=subprocess.PIPE, env=env)
    os.close(slave)
    output = b""
    try:
        deadline = time.monotonic() + 5
        while True:
            assert time.monotonic() < deadline, "Identity output hung"
            if select.select([master], [], [], 0.05)[0]:
                try:
                    chunk = os.read(master, 65536)
                except OSError as error:
                    if error.errno == errno.EIO:
                        break
                    raise
                if not chunk:
                    break
                output += chunk
        child.wait(timeout=1)
        assert child.returncode == 0, (output, child.stderr.read())
        assert child.stderr.read() == b""
        return output.decode().replace("\r\n", "\n")
    finally:
        if child.poll() is None:
            child.kill()
            child.wait()
        child.stderr.close()
        os.close(master)


def plain(output):
    return re.sub(r"\x1b\[[0-9;]*m", "", output)


def width(text):
    return sum(0 if unicodedata.combining(c) else 2 if unicodedata.east_asian_width(c) in ("W", "F") else 1 for c in text)


wide = render(80)
assert "\x1b[1;36mInth" in wide, wide
assert re.search(r"Organization\s+Role", plain(wide)), wide
assert "Selected:" not in plain(wide)
assert re.search(r"● Inth \(inth\)\s+owner", plain(wide)), wide
assert "Slug" not in plain(wide)
assert "user-fixture-abcd" not in wide
for columns in (24, 40, 80):
    output = render(columns)
    text = plain(output)
    assert all(width(line) < columns for line in text.splitlines()), (columns, text)
    joined = re.sub(r"\s", "", text)
    for slug in ("inth-old", "primitive", "documentation-team"):
        assert slug in joined, (slug, text)
    assert "● Inth" in text, text
    if columns == 24:
        assert not re.search(r"Organization\s+Role", text), text

unicode_output = plain(render(28, scenario="unicode"))
assert all(width(line) < 28 for line in unicode_output.splitlines()), unicode_output
assert "東京開発チーム🌱" * 4 in re.sub(r"\s", "", unicode_output), unicode_output
assert "a-very-long-organization-slug-that-must-stay-readable" in re.sub(r"\s", "", unicode_output)

assert "\x1b" in render(80, no_color="")
for no_color in ("1", "0"):
    output = render(80, no_color=no_color)
    assert "\x1b" not in output, output
    assert "● Inth" in output, output
assert "\x1b" not in render(80, term="dumb")

machine = render(24, machine=True)
assert "\x1b" not in machine
value = json.loads(machine)
assert value["data"]["data"]["principal"]["userId"] == "user-fixture-abcd"
assert value["data"]["data"]["organizations"][0]["id"] == "org-one"

piped = subprocess.run([sys.argv[1], "layout", "--selected"], capture_output=True, text=True, timeout=5, check=True)
assert "\x1b" not in piped.stdout
assert piped.stderr == ""
print("Identity display passed: terminal colours, NO_COLOR, pipes, narrow layouts, Unicode, selected organization and full JSON IDs.")
