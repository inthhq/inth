# Native Sentry probe

This experiment links Sentry's C SDK into a static Scriptc executable through typed FFI declarations. It does not enable Sentry in the production CLI.

Run on macOS with Xcode command line tools, CMake, and the repository dependencies installed:

```sh
pnpm --filter @inth/cli assess:sentry:native
```

The script downloads `sentry-native@0.16.2` into the ignored build directory and verifies commit `724479b549a299ea8363994306b36a00c754fcba` and a clean source tree. This C dependency uses its upstream CMake build, separately from the TypeScript inrepo experiment. No upstream patches or submodules are needed for this macOS configuration.

The SDK builds as a static archive with the `inproc` crash backend and the system curl transport. Scriptc 0.0.36 links it without `--dynamic`. The resulting executable depends on macOS's libcurl and libSystem, with no Sentry shared library or separate crash-handler process.

## Verified locally

The test receiver listens on loopback. No events go to a Sentry project. A synthetic user, fixed command name, and fixed exception message keep test events independent of real CLI inputs.

- A caught TypeScript exception produces a native exception envelope with the configured release, user ID, command tag, and native stack frames. The stack includes `inth_sentry_probe_capture`.
- A deliberately aborted child process exits with `SIGABRT`. Its report includes `inth_sentry_probe_crash` and is recovered and delivered on the next launch. The tested crash was not delivered before restart.
- `INTH_TELEMETRY_DISABLED=1` skips SDK initialization, creates no SDK database, and sends nothing. A disabled restart also leaves a pending crash report unsent.
- A stalled HTTP receiver does not hang the CLI. Transfer, flush, and close have 500 ms bounds individually. The observed process exit was about 0.5 seconds; the test allows 2.5 seconds for scheduling overhead.
- Synthetic raw argument and environment-secret markers do not appear in received envelopes.

The first macOS arm64 build was 302,104 bytes for the entire standalone probe. A successful local capture and exit took about 25 ms. These are probe measurements, not the size increase or startup overhead of the full CLI. `assessment.json` records the latest results. Raw local envelopes remain in the ignored build directory.

## Work before production integration

Caught-error frames describe the stack at capture time, after the catch. They do not recover the original TypeScript throw site. The local reports resolve native function names, but TypeScript filenames and line numbers, debug-symbol upload, and grouping in Sentry are not verified.

SDK-generated module metadata includes absolute executable and library paths. The two input-marker checks are not a general privacy guarantee. Production integration needs to scrub these paths, control error messages, and review the full payload.

The real CLI's persistent telemetry setting and CI suppression are not connected to this probe. Production integration must share that policy and decide how disabling telemetry clears pending SDK reports. The probe leaves a crash database available for its recovery test.

Linux and Windows builds, packaging and signing, debug artifacts, a real project DSN, and end-to-end Sentry delivery remain to be tested. The `inproc` test covers a synthetic abort; it does not establish reliability during memory corruption or stack exhaustion. Sentry also offers out-of-process crash handlers with different packaging requirements.

Upstream source and backend descriptions: [sentry-native 0.16.2](https://github.com/getsentry/sentry-native/tree/724479b549a299ea8363994306b36a00c754fcba).
