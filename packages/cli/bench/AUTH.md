# Auth benchmarks

Measured on 5 September 2026 on Apple M5 Pro, macOS arm64, with Node 24.20.0. Runs alternate between targets to reduce ordering effects. Filesystem caches are warm. Raw samples are in [auth-results.json](auth-results.json) and [vercel-login-results.json](vercel-login-results.json).

## inth login, refresh, and logout

This benchmark executes the shared production `AuthFlow` with real, isolated macOS Keychain entries and production credential locks. Every run checks discovery, the device grant, `authorization_pending`, `slow_down`, token rotation, revocation of the rotated refresh token, and local credential deletion. All tokens are fake. The simulated server returns seven responses in memory, and the fake clock skips 20 seconds of required polling waits. No network, browser, or human approval time is included.

Twenty measured fresh processes per target follow three warmups. All numbers below are medians. Phase medians do not add up to the median whole cycle.

| Target | Login | Refresh | Logout | Auth cycle | Whole process |
| --- | --: | --: | --: | --: | --: |
| Scriptc 0.0.36 | 19.44 ms | 9.81 ms | 7.97 ms | 35.74 ms | 43.73 ms |
| yao-pkg 6.22.0 / Node 24.20.0 | 42.92 ms | 13.09 ms | 8.71 ms | 64.99 ms | 158.98 ms |
| Node v24.20.0 bundled JS | 63.67 ms | 15.18 ms | 14.73 ms | 92.44 ms | 176.25 ms |

Scriptc completed the auth cycle about 1.8 times faster than yao-pkg, and the whole process about 3.6 times faster. Whole-process timing includes startup, assertions, and cleanup. Phase timing starts after imports and store construction. The Node reference runs the same bundled JavaScript used by yao-pkg.

These are implementation comparisons. Node and yao-pkg use the production HttpClient, Response handling, Zod validation, and NAPI Keychain adapter. Scriptc uses the native parser and Keychain adapter with a simulated OAuthTransport. The benchmark does not execute Scriptc HTTP transport or isolate compiler speed from adapter differences. The compiled transport tests separately exercise real HTTP.

Reproduce on macOS arm64 with an unlocked Keychain:

```sh
pnpm --filter @inth/cli bench:auth
```

The command builds both benchmark executables before timing. It does not time the larger, unequal auth test suites. Each sample uses a random account under `com.inth.cli.auth-benchmark`, then removes its credentials and temporary lock directory.

## Vercel live login prompt

Both official packages are version 59.11.7. This measures process launch until `vercel login` prints the live device approval URL, including discovery, DNS, TLS, and device authorization. Five measured runs per target follow one warmup.

| Target                                 |  Median | Minimum | Maximum |
| -------------------------------------- | ------: | ------: | ------: |
| vercel@59.11.7 published Node          | 1.404 s | 1.372 s | 1.474 s |
| @vercel/vc-native-darwin-arm64@59.11.7 | 1.521 s | 1.433 s | 1.583 s |

The experimental binary was about 8% slower at reaching the prompt in this run. Five network-sensitive samples cannot establish a general performance ranking. The native warmup took 5.03 seconds and is retained separately in the results. No full sign-in, refresh, or logout was completed. These live timings cannot be compared directly with the simulated inth auth cycle.

Vercel ships the [experimental binary as @vercel/vc-native](https://vercel.com/changelog/experimental-native-binaries-for-vercel-cli). Its [build script](https://github.com/vercel/vercel/blob/main/packages/cli/scripts/build-binary.mjs) packages an embedded Node runtime with yao-pkg. It does not provide a Scriptc comparison.

Install matching packages in an isolated directory and run:

```sh
npm install --prefix /tmp/inth-vercel-benchmark --ignore-scripts --no-audit --no-fund vercel@59.11.7 @vercel/vc-native-darwin-arm64@59.11.7
pnpm --filter @inth/cli bench:vercel /tmp/inth-vercel-benchmark
```

The runner invokes the published `vc.js` shim with native delegation disabled and the official platform binary directly. It creates a fresh `--global-config` and working directory per sample, which also isolates the Keychain account. CI mode suppresses browser opening; telemetry and terminal hyperlinks are disabled. The process is killed at the approval prompt before anyone approves it. The twelve device grants, including warmups, remain unapproved and expire. No codes or verification URLs are written to result files.

Three earlier diagnostic attempts were discarded while fixing approval-prompt detection for terminal hyperlinks. They are not timing samples. The recorded run uses the same prompt detection and environment for both targets.
