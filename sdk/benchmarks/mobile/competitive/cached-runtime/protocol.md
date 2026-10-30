# Cached policy and denial availability

`authoritative-cached-policy-denial-v3` is separate from the historical strict
error-free runner. It measures a configured app with an authoritative persisted
denial while refresh transport fails offline. It does not establish current
server-policy freshness. All exposed applicability, recollection, expiry and
policy gates must pass. Unknown errors and policy or consent failures fail,
including failures whose messages contain transport words.

The cold metric starts at `Application.attachBaseContext`, before `super`, with a
fresh PID and warm OS/file caches. It ends at the first native decor `OnDraw`
after layout of the common validated Ready view. The warm metric starts at
`Activity.onResume`, before `super`, after HOME for two seconds. It ends at decor
`OnDraw` after a new SDK read validates the same saved decision in the same PID.
The clock is `SystemClock.elapsedRealtimeNanos`. Neither endpoint proves a
physically presented frame. Wrapper work and demo policies differ.

c15t must expose a matched policy, future deadline, explicit denial receipt and
denied effective `measurement` permission. Its only accepted non-null error has
code `transport` and a recognized offline connection message. Didomi must expose
a denied required purpose, persisted consent string and update timestamp, with
no collection required. Usercentrics must expose an optional explicit denial,
denial history and no collection required. Its pinned wrapper truncates history
timestamps to signed32, so calibration also checks the action interval modulo
2^32. All three use exact frozen denial identities from this run's stock UI.

Sourcepoint proves cached GDPR decision availability at the last delivered
policy. Public `getUserData` must match the actual read-only `sp.state` cache's
UUID, consent string, creation date and denied vendor/purpose. The cached web
payload must have future expiry and matching grants. Known policy-change dates
must precede the choice. The only accepted exposed refresh error is exactly
`NoInternetConnection` / `No Internet connection.` This depends on the pinned
private cache schema. Offline campaign completion and privacy-manager readiness
are unsupported. It is not a faster replacement for a campaign callback.

## Fresh commands

Python 3.9+ and the parent harness's pinned tools are required. Build the four
`android-release` size hosts with the parent harness first. The external size
config supplies archive, exact 90-file Maven staging, real c15t policy/backend,
toolchain paths and the shared `nativeLockRunner`. Configure published tenants
in its `tenants` field. Didomi needs `apiKey`, `noticeId`, `target`; Usercentrics
needs `settingsId`, `target`; Sourcepoint needs `accountId`, `propertyId`,
`propertyName`, `privacyManagerId`. Demo identifiers are configuration, never
invented successful consent. Leave secrets outside Git and obtain credentials
through the authorized secret tools.

Copy `config.example.json` outside the checkout. Paths resolve relative to their
config files. Choose a new external output directory, a new task AVD name and
a free even emulator port. `producer` points to the clean pinned checkout for
read-only identity checks. The runner builds only copied consumer hosts, never
the producer. Output must be disjoint from the checkout, producer, size output
and frozen input paths. Existing output roots and attempted stages are refused.

From the repository root, with `CACHED_CONFIG` pointing to that external config:

```sh
python3 benchmarks/mobile/competitive/cached-runtime/runner.py prepare --config "$CACHED_CONFIG"
python3 benchmarks/mobile/competitive/cached-runtime/runner.py build --config "$CACHED_CONFIG"
python3 benchmarks/mobile/competitive/cached-runtime/runner.py device --config "$CACHED_CONFIG"
python3 benchmarks/mobile/competitive/cached-runtime/runner.py calibrate --config "$CACHED_CONFIG"
python3 benchmarks/mobile/competitive/cached-runtime/runner.py preflight --config "$CACHED_CONFIG"
python3 benchmarks/mobile/competitive/cached-runtime/runner.py freeze --config "$CACHED_CONFIG"
python3 benchmarks/mobile/competitive/cached-runtime/runner.py sample --config "$CACHED_CONFIG"
python3 benchmarks/mobile/competitive/cached-runtime/runner.py verify --config "$CACHED_CONFIG"
python3 benchmarks/mobile/competitive/cached-runtime/runner.py cleanup --config "$CACHED_CONFIG"
```

`prepare` creates logs, inputs, artifacts, runtime and device parents and clones
the verified size hosts and installed dependencies. It adds benchmark fixtures
only. `build` type-checks those fixtures and uses the parent build function. It
generates current build bindings, checks pinned dependencies/effective settings,
R8, actual DEX/Hermes retention and packager source content. No historical build
sentinel or original-evidence manifest is required. No historical identities or
cache archives are imported into a fresh run.

`device` creates and records ownership of a separate rootable API36 arm64 AVD,
1080x2400, density420, animations1, SwiftShader and 3072MB RAM. `calibrate`
installs the new APKs, clears their data, exercises real stock rejection controls,
and retains screenshots, XML, full snapshots and device action-clock brackets.
Changed or missing controls fail calibration; adjust config and use a new output.
`preflight` verifies persistence across process restart and matched warm reopen.
It uses a task TCP listener with same-UID positive and negative controls, disables
network interfaces and installs per-UID IPv4/IPv6 rejection rules on this AVD.
The listener/reverse are cleaned up. Raw state stays in external output.

`freeze` records eligibility, device, APK/build/source/input hashes and the exact
30-round schedule before timing. Participant order rotates and reverses after
each complete participant block. Each slot has cold then warm, a one-second
force-stop cooldown, two-second HOME interval, 30/10-second cold/warm deadlines,
15-second initial settle and 350ms post-endpoint capture. Canonical reconstruction
rejects altered, reordered, shortened or rehashed schedules. Eligible adapters
use the same transport rule, clock, host and endpoint definitions. Ineligible
cells stay explicit. No failed sample is replaced, resumed or selected away.

Every native/device command acquires the configured shared exclusive lock.
Sampling holds it before `ec quiet`, throughout settling and the complete cohort.
Quiet output is retained and printed, including any stopped containers. Other
study builds must use that same lock. Dedicated host idleness is not guaranteed.
Fresh expiry checks use the actual device clock captured during each attempt.
Replay uses the bound capture epoch rather than the reviewer's wall clock.
Raw failures and exposed transport errors remain. Percentiles use nearest rank,
`sorted[ceil(p*n)-1]`, conditional on valid samples, with failure counts retained.
`cleanup` checks ownership and stops only this emulator; it retains the AVD.

## Offline verification

`verify` reads a fresh run without starting devices or building. It revalidates
the canonical schedule, frozen inputs, exact decision identity, raw markers,
PID continuity, device capture epochs, hashes and percentiles.

The historical snapshot contains measured numbers and immutable bindings. To
reparse all 240 completed raw logs with this repository's parser, point
`CACHED_EVIDENCE` at the external completed runtime directory:

```sh
python3 benchmarks/mobile/competitive/cached-runtime/runner.py replay --evidence "$CACHED_EVIDENCE"
python3 benchmarks/mobile/competitive/cached-runtime/tests.py
```

To include source API checks against existing pinned host installations, append
`--typecheck-hosts "$PINNED_HOSTS"` to the test command. That directory contains
the four `<sdk>-host/node_modules` trees. Checks use temporary source copies and
read those installations without building or starting devices. The test command
also accepts `--replay "$CACHED_EVIDENCE"` to run the bound historical audit.

Replay pins the historical artifact index, schedule, sample metadata and raw
hashes. It validates consent deadlines at each immutable `finishedUtc` sample
epoch, without editing historical files or executing their scripts. The fresh
runner is a maintained derivative of the measured fixtures. It has stricter
marker/error checks and config-driven setup. These new sources did not produce
the historical APKs. The snapshot retains measured fixture/APK/source hashes.
No new native build or timing validates this repository derivative yet.

## Coverage and UI observations

Core rerun commands cover Android c15t, Didomi, Usercentrics and Sourcepoint.
OneTrust remains blocked without a verified published mobile App ID and matching
CDN/environment/language. iOS runtime is unmeasured. Physical phones, battery,
remote delivery and full typed RN/Expo IAB remain deferred or incomplete.

There is no maintained UI timing command here. The sanitized snapshot retains
the incomplete stock UI study as segmented descriptive observations: 87 valid
of 90 scheduled, three failures retained. Its continuous-window cohort was
interrupted. `stockUi` remains null. The reported action spans required actual
stock controls, a changed public SDK value and immediate offline new-PID
persistence. Didomi and Usercentrics action latency failed that persistence
condition and is excluded. Their retained cells measure controls readiness only.
Sourcepoint has no offline UI cell. Do not treat these UI observations as a
completed comparative cohort or claim that core calibration reruns UI timing.
