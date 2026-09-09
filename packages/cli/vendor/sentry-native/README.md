# Sentry native

The build downloads Sentry native 0.16.2 at commit `724479b549a299ea8363994306b36a00c754fcba` and checks that the source tree is unmodified. CMake builds a static library with crash handlers and SDK networking disabled. Linux also builds the upstream vendored libunwind. Source and build output stay under the ignored `build` directory.

This directory contains the licenses shipped with the CLI package. See `scripts/build-sentry.ts` for the build and `src/native/native-sentry.c` for the adapter and payload filtering.

Upstream: https://github.com/getsentry/sentry-native/tree/724479b549a299ea8363994306b36a00c754fcba
