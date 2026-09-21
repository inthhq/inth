#!/bin/sh
set -eu

if [ "$#" -ne 2 ]; then
  echo "Usage: test-linux-baseline.sh <native-package.tgz> <native-fixture-directory>" >&2
  exit 1
fi

archive="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
fixtures="$(cd "$2" && pwd)"
test -f "$archive"
test -x "$fixtures/keychain-test"
test -x "$fixtures/auth-test"

# Run the shipped archive on glibc 2.36, not just the build runner's libc.
# Only test artifacts are mounted. The container owns its disposable keyring.
docker run --rm \
  -e INTH_TELEMETRY_DISABLED=1 \
  -v "$archive:/archive.tgz:ro" \
  -v "$fixtures:/fixtures:ro" \
  debian:12-slim sh -eu -c '
    mkdir /package-test
    tar -xzf /archive.tgz -C /package-test
    binary=/package-test/package/bin/inth
    "$binary" --version
    env PATH= "$binary" --help >/dev/null
    "$binary" --version --json

    apt-get update -qq
    apt-get install -y -qq --no-install-recommends libsecret-1-0 gnome-keyring dbus-x11 >/dev/null
    dbus-run-session -- sh -eu -c '\''
      printf "test-only\n" | gnome-keyring-daemon --unlock --components=secrets >/dev/null
      /fixtures/keychain-test
      /fixtures/auth-test
    '\''
    echo "Linux package and credential fixtures passed on Debian 12 / glibc 2.36."
  '
