#!/bin/sh
set -eu
# Run inside a disposable Debian container with the checkout mounted at /source.
apt-get update -qq
apt-get install -y -qq clang zlib1g-dev libsecret-1-0 gnome-keyring dbus-x11 >/dev/null
mkdir -p /workspace
(cd /source && tar --exclude=node_modules --exclude=.git --exclude=build --exclude=dist --exclude=dist-bin --exclude=artifacts --exclude=.turbo -cf - .) | tar -xf - -C /workspace
cd /workspace
npm install -g pnpm@11.25.0 >/dev/null
pnpm install --frozen-lockfile
# Supply only an isolated test keyring; production credentials are never mounted.
dbus-run-session -- sh -c 'printf "test-only\n" | gnome-keyring-daemon --unlock --components=secrets >/dev/null; pnpm --filter @inth/cli test && pnpm --filter @inth/cli test:package'
