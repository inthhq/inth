# Competitive mobile CMP benchmark

These commands build a no-SDK control and five stock consent integrations in separate Expo consumers. They measure signed Android APK bytes and unsigned iOS `.app` regular-file bytes. Runtime is a separate Android cached-denial profile. The existing `bench:mobile` commands still measure the c15t contract and do not run this study.

The [2026-10-30 snapshot](snapshots/2026-10-30.json) contains all 18 app measurements, artifact hashes, source and toolchain pins, runtime attempts and limitations. The frozen c15t producer was clean commit `256e903bfa542c15126e017c10fdfea70f421521`. This repository checkout is only the benchmark runner. It never supplies SDK code to a measured app.

| SDK | Signed Android APK bytes | Added bytes | iOS local `.app` bytes | Added bytes | iOS postprocessed `.app` bytes | Added bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline | 20,779,838 | 0 | 26,754,643 | 0 | 26,342,011 | 0 |
| c15t | 22,757,384 | 1,977,546 | 31,881,428 | 5,126,785 | 28,495,116 | 2,153,105 |
| OneTrust | 21,803,892 | 1,024,054 | 31,568,416 | 4,813,773 | 31,098,912 | 4,756,901 |
| Didomi | 25,428,214 | 4,648,376 | 34,803,770 | 8,049,127 | 34,256,690 | 7,914,679 |
| Usercentrics | 21,830,808 | 1,050,970 | 34,986,947 | 8,232,304 | 34,400,195 | 8,058,184 |
| Sourcepoint | 21,778,262 | 998,424 | 44,340,545 | 17,585,902 | 37,661,033 | 11,319,022 |

These are local build contributions over each profile's control. Downloaded JAR, AAR, npm or XCFramework lengths are different units. The iOS profiles are not App Store downloads, app thinning, encrypted IPAs or signed installs. They exclude directory blocks, symlink lengths and dSYM. Sourcepoint's stock campaign UI uses WebView on both platforms. This study does not establish feature or certification equivalence.

The historical Android profile is `android-release`. Its actual merged R8
configuration contains `-dontoptimize`, from `proguard-android.txt`. Shrinking,
obfuscation and resource shrinking are enabled. The opt-in `android-optimized`
profile selects `proguard-android-optimize.txt` for every participant and uses a
new matched baseline. Neither profile replaces or relabels the other.

The [dependency attribution](analysis/android-dependencies/report.md) explains
the historical Android cost. c15t adds 1,977,546 signed APK bytes, including
1,655,577 compressed DEX bytes. Compose accounts for 2,425,795 of 3,228,300
APK Analyzer estimated DEX growth bytes. Those estimates are not compressed
savings. The [compact snapshot](analysis/android-dependencies/results.json) and
[analysis commands](analysis/android-dependencies/reproduce.md) keep direct ZIP
costs, DEX estimates and exact instruction bytes separate.

## Pinned inputs

[pins.json](pins.json) records exact wrapper tarball URLs and SHA256, every frozen c15t Maven file, resolved Android artifact coordinates and hashes, and official iOS distribution URLs and hashes. Text lock fixtures pin each host's full npm graph and iOS Pod graph. No vendor binaries, SDK patches, local policy, subjects or credentials belong in git.

| SDK | RN wrapper | Android native | iOS native |
| --- | --- | --- | --- |
| c15t | `@c15t/react-native@3.0.0-alpha.2` | Frozen Maven `3.0.0-alpha.1` | Archive-installed vendored Swift, Pod `3.0.0-alpha.2` |
| OneTrust | `react-native-onetrust-cmp@202609.2.0` | `native-sdk:202609.2.0.0` | `OneTrust-CMP-XCFramework 202609.2.0.0` |
| Didomi | `@didomi/react-native@2.38.1` | `android:2.53.0` | `Didomi-XCFramework 2.53.1` |
| Usercentrics | `@usercentrics/react-native-sdk@2.34.0` | `usercentrics-ui:2.34.0` | `UsercentricsUI 2.34.0` |
| Sourcepoint | `@sourcepoint/react-native-cmp@1.0.13` | `cmplibrary:7.15.10` | `ConsentViewController 7.12.7`, `SPMobileCore 0.1.13` |

The c15t archive SHA256 is `4d92e2c3377cf2059a905335c62c037de9a0cc9a46df42d474a3c5b2dc7a65bd`. Its archive, Pod, Maven and hosted-protocol versions are distinct. The expected Maven staging directory has 90 regular files. The original producer verified 1,814 source files. A rerun needs only the archive and Maven inputs, not the producer checkout.

All hosts use Expo 57.0.22, RN 0.86.3, React 19.2.7, Hermes, the new architecture and Expo dev-client. Android uses arm64, min24, compile/target36, build-tools36, minification, resource shrinking, Gradle9.3.1, AGP8.12.0, R8 8.12.14, Java17.0.20, Kotlin2.1.20 and NDK27.1.12297006. Each run copies one development signing key to every host. Usercentrics builds its wrapper library against Android34; the app stays at 36.

iOS needs Xcode27.1 build27A9275, iPhoneOS27.1, CocoaPods1.17.0 and deployment target16.4. Both generic arm64 Release profiles disable signing and enable optimization and dead stripping. `ios-local` explicitly sets `DEPLOYMENT_POSTPROCESSING=NO`; `ios-postprocessed` explicitly sets `YES`. The old experiment included actual Strip tasks. Rebuild/relink hashes changed, so its delta is not proved to be only symbol-table removal.

OneTrust alone adds the [official targeted R8 rules](https://developer.onetrust.com/onetrust/docs/download-and-import-sdk-to-app-android-next-gen) in [fixtures/onetrust.pro](fixtures/onetrust.pro). They suppress optional ZXing/Ad ID warnings and retain a narrow Retrofit generic-signature relationship. No SDK keep-all rule, dependency override or vendor patch is added. Existing Expo host rules remain.

## Configure a fresh run

Use Python3.9+, Bun1.3.11, Node and the platform toolchain. There are no new repository dependencies. Run commands from the repository root. Copy [config.example.json](config.example.json) outside the repository, then edit it. All relative paths resolve against the config file, including spaces. Output must be outside the repository and each host/build/collection stage refuses to overwrite earlier output.

Supply `archive`, `maven`, `policy` and `backendUrl` from your own frozen c15t inputs. A policy is required to build c15t; the runner never fabricates one. Configure `androidSdk`, `javaHome` and optional `gradleHome`, `downloadCache` and `deviceRoot`. Existing environment roots work too. Public competitor distributions download into the configured cache and must match their pinned hashes. Public access does not grant redistribution rights.

Set `nativeLockRunner` to a command array for the coordinator's shared exclusive lock wrapper. The runner passes it a label followed by the complete command. Every prepare/build and runtime sampling stage uses that wrapper. All agents on the host must use the same wrapper and lock. A standalone run can use `competitive/with-native-lock.py`; `CMP_NATIVE_LOCK` selects its global lock file. Runtime keeps the lock across `ec quiet`, settling and the entire schedule. Do not run uncoordinated native builds beside timed samples.

```sh
bun run --cwd benchmarks/mobile competitive:plan --config /path/to/run.json
bun run --cwd benchmarks/mobile competitive:preflight --config /path/to/run.json --platform android
bun run --cwd benchmarks/mobile competitive:preflight --config /path/to/run.json --platform ios
```

Plan validates the supplied archive and all Maven file hashes without building, downloading or using a device. Platform preflight additionally checks the tools. No command edits the c15t producer or this checkout's SDK packages.

Tenant values live in the external config's `tenants` object. Set `c15t.privacyUrl`, `onetrust.cdn/appId/category`, `didomi.apiKey/noticeId/target`, `usercentrics.settingsId/target`, and `sourcepoint.accountId/propertyId/propertyName/privacyManagerId` as needed. Defaults are compile-only missing configurations. They call real SDK entrypoints but cannot qualify for timing. Keep private values outside git and use the credential tools available to your coordinator.

## Build all size apps

For each of `baseline c15t onetrust didomi usercentrics sourcepoint`, run:

```sh
bun run --cwd benchmarks/mobile competitive:prepare --config /path/to/run.json --platform android --vendor baseline
bun run --cwd benchmarks/mobile competitive:build --config /path/to/run.json --profile android-release --vendor baseline
bun run --cwd benchmarks/mobile competitive:prepare --config /path/to/run.json --platform ios --vendor baseline
bun run --cwd benchmarks/mobile competitive:build --config /path/to/run.json --profile ios-local --vendor baseline
bun run --cwd benchmarks/mobile competitive:build --config /path/to/run.json --profile ios-postprocessed --vendor baseline
```

Replace `baseline` with each SDK name. The two iOS builds use separate DerivedData and output paths. Hosts are constructed fresh with frozen npm locks, Expo prebuild, mounted initialize/status/stock-preferences adapters, and exact archive-installed c15t sources. iOS uses `pod install --deployment` and checks its full lock. ExpoModulesCore's local archive URL and extraction command contain the host path, so only that Pod checksum is relocated from a pinned canonical Podspec. The installed spec must match the canonical spec after that path substitution. Dependency versions and all other checksums stay frozen. Official vendor distributions are downloaded and every installed vendor Pod regular file is compared to its distribution. Android records effective settings, compiler identity, complete resolved dependency hashes, R8 mapping, signature verification and actual APK badging. The build command records its arguments, timestamps, log hash, host inputs and completion manifest.

Prepare/build failures keep their logs and never become zero-byte measurements. Fix a configuration in a new output root. Do not modify SDK behavior, vendor sources, dependency versions or shrinker rules to improve scores. Fresh generation and local paths can change app bytes. Compare a complete new matched cohort, not one rebuilt app against the historical baseline.

```sh
bun run --cwd benchmarks/mobile competitive:collect --config /path/to/run.json
bun run --cwd benchmarks/mobile competitive:verify --config /path/to/run.json
bun run --cwd benchmarks/mobile competitive:report --config /path/to/run.json
```

Collect requires all 18 apps. An explicit `--partial` permits a smoke cohort, which still needs a baseline for every selected profile and remains marked incomplete. It checks native host parity, settings, matched signing, exact Android native dependency hashes, actual retained R8 destinations in DEX, iOS native symbol/link-map evidence and stock-action identifiers in Hermes. iOS bundle metadata and executable/framework Mach-O platform commands must identify device binaries, since arm64 alone also describes Simulator builds. Baselines must contain no SDK native classes/symbols. Verify hashes the real files and reruns the readers and arithmetic. Editing a result number or copying a cohort label cannot bypass those checks. Manifests bind evidence against accidental changes; they are not signed attestations against a malicious machine owner.

By default the selected profiles remain `android-release`, `ios-local` and
`ios-postprocessed`, exactly 18 apps. To measure only the optimizing experiment,
set `"sizeProfiles": ["android-optimized"]` in a fresh external config. Collect
then requires exactly six apps. Explicitly selecting all four profiles requires
24 apps. Prepare Android with the same explicit profile as its build:

```sh
bun run --cwd benchmarks/mobile competitive:prepare --config /path/to/optimized.json --platform android --profile android-optimized --vendor baseline
bun run --cwd benchmarks/mobile competitive:build --config /path/to/optimized.json --profile android-optimized --vendor baseline
```

Repeat for all five SDKs, then collect, verify and report using that config.
The optimized hosts live in a separate directory and are generated from the
same frozen locks. The only native host profile change is the default ProGuard
file. The c15t size adapter logs a compact native snapshot for untimed
acceptance. That fixture change also applies to fresh `android-release` builds.

Both Android profiles retain R8's actual merged `configuration.txt`, mapping,
usage and seeds. Collection reads the directives, checks the selected default
file and actual R8 compiler version, and rejects disabled shrinking,
obfuscation or the wrong optimizer state. A copied profile label or matching
`minifyEnabled` setting cannot substitute for that output. Family destination
counts come from actual DEX plus mapping; R8 may merge or inline original
classes, so those counts are not original source-class counts.

For untimed acceptance, run the entire command under the shared lock. It
creates its own API36 arm64 AVD, checks the port is unused, retains UI XML,
screenshots, logcat, native consent states and command results, then stops only
that emulator before returning. It needs the installed
`system-images;android-36;google_apis;arm64-v8a` image. The local config must
supply the official vendor sample configurations or verified tenant values.

```sh
python3 /path/to/shared/with-native-lock.py optimized-stock-ui \
  python3 benchmarks/mobile/competitive/acceptance/android.py \
  --config /path/to/optimized.json --port 5592
```

c15t starts offline with IPv4/IPv6 UID rejection rules, opens its native
preferences, records a real Reject All choice and repeats a fresh process
launch with that denial. Any offline backend error remains in the captured
state. This acceptance is not runtime-timing eligibility. Other configured
vendors retain stock-UI observations; OneTrust stays compile-only without a
verified App ID. No phone or speed result follows from this check.

Outputs are `evidence.json`, `report.json` and `report.md` under the configured output root. Logs, APKs, `.app`, downloads, keys, caches and tenant config remain external. `extensions` can map names to external schemaVersion1 JSON files, such as Android dependency attribution or separately verified runtime results. Report records their paths and hashes without adding archive bytes to app contribution.

## Recollect retained artifacts

`competitive:collect --retained /path/to/artifacts.json` reads actual existing artifacts without rebuilding or writing into them. It still needs the c15t archive/Maven config and Android build-tools. It does not import reported byte totals. The descriptor has `schemaVersion: 1`, `origin: "retained-artifacts"` and an `apps` array with one row per app/profile:

- Common fields are `profile`, `vendor`, `host`, `artifact`, `settings`, `expectedArtifactSha256` and, for competitors, `wrapperArchive`. Paths identify actual retained files and host trees, never a producer checkout.
- Android adds `mapping`, `r8Configuration`, `dependencies`, `signing` and `badging`. `r8Configuration` must point to the actual merged R8 output, including for historical recollection. An optional `compiler` points to the recorded Kotlin compiler identity. Fresh builds always record it. `artifact` is the signed APK and its expected hash is the APK SHA256.
- iOS adds `symbols` and `maps` arrays, `appFileManifest` and its `expectedAppManifestSha256`. The frozen manifest must list every actual regular app file with `kind: "file"`, `path`, `bytes` and `sha256`. `symbols` includes retained `nm` and executable `strings` output. `artifact` is the `.app` directory and its expected hash is the executable SHA256.

All paths in a retained descriptor are absolute. They can point at any mounted evidence store; no historical home-directory location is required. Every wrapper archive-installed file is compared to its exact archive before collection. The resulting report contains fresh reads and hashes of the retained app files. Keep this local descriptor outside git.

## Runtime

The endpoint is `Application.attachBaseContext` to the first decor `OnDraw` after a validated cached-denial Ready layout. It includes RN startup, SDK reads and fixture validation. It excludes pre-attach/zygote work, physical presentation and stock-preferences rendering. Policies and validation work differ, so it does not rank pure consent engines. OS and file caches are warm, but each attempt starts a fresh process.

Only c15t, Didomi and Usercentrics currently have runtime adapters. OneTrust and Sourcepoint are explicitly blocked for this profile. Sourcepoint still has the full size integration. iOS runtime and physical phones are deferred.

Prepare/build the separate Android runtime host with `--runtime-build`, `--platform android` for prepare and `--profile android-release` for build. Its application ID is `com.c15t.expodev.benchmark.<vendor>`. Install only on an explicitly task-owned API36 arm64 emulator. The runner does not create, clear, stop or delete devices. Never point it at a pre-existing personal emulator or phone.

Provision each configured app through its real stock UI, save an explicit optional rejection, and retain the full logcat, UI screenshot/XML, app-cache archive and device-clock interval around the rejection. Calibration is outside the schedule. Repeat a launch offline and retain its full log. Didomi uses its current-user-status API. Usercentrics' unchanged wrapper returns a signed32 history timestamp; preserve it and match modulo 2^32 to the rejection interval. c15t requires `ready=true`, `policyPending=false`, `error=null`, a saved explicit denial and an effective false gate.

Network isolation must include IPv4 and IPv6 OUTPUT REJECT rules scoped to each task app's actual UID. Retain successful same-UID loopback controls before the rules and failed controls after them, using a task-owned listener and adb reverse. Remove the listener/reverse afterward. Disable Wi-Fi/data and bring the task emulator's network interface down. A silent or incomplete packet capture does not prove isolation. Do not change networking on other devices or other app UIDs.

Set `runtimeInputs` to an external JSON file with `schemaVersion: 1`, `device` containing `serial`, `avdName` and `fingerprint`, `ownershipFile`, `networkProof`, and `participants`. Ownership JSON must state `taskOwned: true` and the exact serial/AVD name. Each participant supplies:

- `configured: true`, `apk`, `apkSha256`, `buildRecord`, `mapping`, `dependencies`, `settings` from its completed runtime build.
- `calibrationLog`, `offlineLog`, `stockUiScreenshot`, `stockUiXml`, `cacheArchive`, `rejectionStartedEpochMs` and `rejectionEndedEpochMs` from its own fresh stock rejection.

Paths resolve against that input file. `networkProof` is JSON with `uids` keyed by SDK and `taskOwnedTcpProbe` containing `positiveOnlineExitCodes`, `negativeOfflineExitCodes`, `listenerClosed: true` and `adbReverseRemoved: true`. These records are local evidence and must never contain exported Keystore keys. The runner rechecks actual installed APK hashes, emulator identity, app UIDs and live IPv4/IPv6 owner rules before scheduling and sampling.

```sh
bun run --cwd benchmarks/mobile competitive:runtime --config /path/to/run.json --action preflight
bun run --cwd benchmarks/mobile competitive:runtime --config /path/to/run.json --action schedule
bun run --cwd benchmarks/mobile competitive:runtime --config /path/to/run.json --action sample
bun run --cwd benchmarks/mobile competitive:runtime --config /path/to/run.json --action verify
```

Preflight reports unavailable/error configurations as blocked. Schedule freezes input hashes and 30 attempts per eligible SDK, rotating order each round. Sample holds the shared native lock, runs and records `ec quiet`, waits ten seconds, then force-stops all participating task apps before each attempt. It retains every attempt, including failures and timeouts, with no replacement or timing-based exclusion. A complete accepted sample needs a fresh PID, ordered matching native attach/layout/draw markers, exact nanosecond arithmetic and one complete post-draw payload matching the frozen denial. Verify reparses raw logs and rejects invented elapsed values, missing chunks, stale PIDs and incomplete schedules. Both percentiles use nearest rank, `ceil(p*n)-1`, over valid samples, with scheduled/valid/failed counts alongside. No valid samples means null latency.

The historical run scheduled Didomi and Usercentrics 30 times each, all valid. Their p50/p95 were 336.079/450.258ms and 378.532/502.281ms. c15t's denial survived offline, but its configured backend produced a DNS transport error. That violated eligibility, so it had zero scheduled attempts and no latency. OneTrust lacked verified App ID/CDN configuration. No iOS, phone, battery, idle-memory, network-startup or first displayed SDK-preferences-frame result follows from these measurements.

## Checks and scope

```sh
bun run --cwd benchmarks/mobile competitive:test
bun run --cwd benchmarks/mobile test src/__tests__/competitive.test.ts
bun x oxlint benchmarks/mobile/competitive/fixtures benchmarks/mobile/src/__tests__/competitive.test.ts
bun x oxfmt benchmarks/mobile/competitive benchmarks/mobile/src/__tests__/competitive.test.ts benchmarks/mobile/package.json --check
```

The standard-library Python tests run through the existing Vitest suite too. They protect size arithmetic, missing/error rows, profiles, portable config paths, artifact mutation, denied-state eligibility, raw timing validation, fixed schedules and nearest-rank statistics. The harness only changes package-local commands and new benchmark files. It does not publish packages, change production SDK behavior, launch dev servers or modify the existing mobile budgets.
