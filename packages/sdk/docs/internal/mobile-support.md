---
title: Mobile support contract
description: Module ownership, candidate versions, transport modes and OTA compatibility for the private Inth mobile SDK.
---

The mobile SDK is a private prerelease. No mobile version is supported for
production until the clean-consumer, device and first-release IAB gates pass.
A successful unit test or native build does not establish those gates.

## Module ownership

| Module | Owns | May depend on |
| --- | --- | --- |
| Swift `InthCore` and Kotlin `inth-core` | Consent and IAB authority, durable records, hydration, immutable save queue and cached gates before JavaScript | OS and native libraries, no RN, Expo, JavaScript runtime or stock UI |
| Apple and Android platform services | Protected storage selection, transport installation, foreground and reachability subscriptions, optional platform permission orchestration | Native core and OS APIs, no RN or stock UI |
| Optional SwiftUI and Compose UI | Native drafts, search, navigation and commits | Platform services and core |
| RN adapter | Typed commands, hooks, React wrappers and native host adapters | Native installation and React Native |
| Expo config plugin | Build-time native configuration | Expo config tools, never the Metro runtime entry |

SwiftUI and Compose are the selected shared stock UIs. Their RN hosts exchange
compact outcomes and events. Headless selectors remain available for app-owned
React UI. The existing React stock components are prerelease code awaiting that
migration, not a third selected stock implementation.

Each process has one native engine. RN attaches to the installed engine. Consent
and IAB decisions, hydration and SDK gates cannot wait for JavaScript startup.
Synchronous gates read cached state and perform no storage or network work.
Unknown or denied permission keeps optional SDKs off.

The RN runtime, its declarations and its transitive runtime dependencies must
install without another Inth JavaScript package, a backend runtime or a JS TCF
codec. Keep `@c15t/core`, `@c15t/iab` and `@iabtechlabtcf/core` as development
conformance oracles. Build, test, docs and Codegen dependencies are allowed.

The packed-consumer boundary test installs the tarball outside the workspace and
type-checks that consumer. It needs registry access and copies the repository's
`bunfig.toml`, including `minimumReleaseAge`, into its temporary project. Direct
consumer versions are pinned; transitive registry resolution can change after
the release-age delay. This check does not launch Metro or a native app.

## Candidate versions and release evidence

| Component | Candidate contract | Evidence still required |
| --- | --- | --- |
| React Native | 0.83.x through 0.88.x, New Architecture | Clean packed bare and Expo builds and launches on both platforms |
| React | `>=19.2.0 <19.4.0`, paired with the host's RN or Expo release | Packed consumer type-check plus device integration |
| Expo | SDK 55 through 58 with their prescribed RN and React versions, custom native build | Clean prebuild, EAS build and device launch; Expo Go cannot load this SDK |
| Apple | iOS 16.4 or later; Swift 5.9 language mode or later | Minimum-OS and current-OS device lifecycle, storage and ATT checks |
| Android | API 24 or later | Minimum/current device checks and compatible Gradle, AGP and Kotlin consumer builds |

The former open-ended RN `>=0.81` declaration did not have matrix evidence.
The current peer range is bounded at `>=0.83.0 <0.89.0`. Exact RN, React and
Expo versions are pinned in `scripts/mobile-compatibility.json`; each admitted
RN minor has a matrix cell. The check installs a packed SDK outside the
workspace, checks its consumer and maintained source types, runs the host's
Android and iOS Codegen, and runs Expo Continuous Native Generation where
applicable. Passing those checks does not prove a full native app build or a
device journey for that cell.

Android consumers keep API 24 and JDK 17. Compile SDK 36 is the native minimum;
RN 0.87, RN 0.88 and Expo 58 need 37. The host owns compatible Gradle, Android
Gradle Plugin and Kotlin versions. The native producer build must not select
those versions for an app. The Expo plugin sets the iOS app and CocoaPods
deployment targets to at least 16.4, including Expo 55 templates whose default
is 15.1, and preserves higher host targets. Bare RN apps set that minimum
themselves.

Native core tests run without RN or Expo. macOS SwiftPM tests do not prove an
iOS minimum deployment target or an on-device permission flow. Android artifact
publication and toolchain compatibility remain release blockers.

## Upstream maintenance and compatibility policy

For new apps, target RN 0.88 with React 19.3, or Expo 58, and complete native
build and device acceptance before shipping. Keep older matrix versions usable
for existing apps. As of November 3, 2026, RN 0.87 and 0.88 are active upstream,
RN 0.86 is at End of Cycle, and RN 0.83 through 0.85 are unsupported upstream.
Expo 55 and 56 are not listed as deprecated by Expo. Their compatibility work
does not imply that upstream RN maintains those versions. Review the official
[RN status](https://reactnative.dev/releases/overview) and
[Expo upgrade guide](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/)
when changing the matrix.

Review the matrix with every stable RN and Expo release. Pin and exercise a
new pairing before widening peers. Announce framework removals and OS minimum
increases before making them, and ship them in an Inth major release. An upstream
End of Cycle or unsupported label prompts a review; it does not silently remove
Inth compatibility from an existing release. Retain New Architecture only.

## Launch transport modes

Hosted uses an Inth project URL. Self-hosted uses the same `/init`, `/subjects`
and subject-identity protocol against an application-owned backend. Both require
an explicit HTTPS URL and protected durable storage for production installation.
An init URL override moves only init; saves remain on the backend URL.

Offline transport applies durable local choices and retains undelivered saves.
It does not resolve a missing policy or provide remote audit delivery. It is not
recommended for production environments as the only launch transport.
The legacy `none` transport and memory/file storage options are development
facilities. Raw `CoreConfig()` is not a production installer.

ATT authorization is separate from consent. An Apple grant cannot grant an Inth
category. Asking for ATT is optional, explicit and subject to the app's usage
strings and OS capabilities. A native SDK that requires both permissions must
check both answers.

## Version, protocol and OTA rules

The RN package, Swift core and platform modules have explicit release versions.
Backend request metadata names the native module and version that made the
request. A standalone Apple request must not claim an RN version. RN's installed
package version is distinct from the native core version. SDK semver is also
separate from the internal 12-bit IAB CMP version. No version string establishes
registration or certification.

The current RN/native protocol is 1, with a supported range of 1 through 1.
`getBootstrap()` reports the embedded native protocol before the provider accepts
snapshots. An unsupported protocol requires an actionable error and optional
SDKs remain gated. Backend policy-contract negotiation is a separate boundary.
Stored-envelope versions describe readability, not consent grants.

An OTA bundle may change compatible JavaScript only. Changes to native APIs,
storage migrations, SwiftUI/Compose screens, native themes, permissions or
Codegen require a new binary. A protocol change must update the declared range,
fixtures and compatibility tests. Release an OTA update only against binaries
whose embedded protocol and capabilities it supports. Do not raise the supported
range based on a package version alone.

## First-release gates

TCF 2.4 and Google Additional Consent v2 are required in the first supported
mobile release. Native choices, durable TC commits, GVL lifecycle, platform keys,
RN integration, required disclosures and UI remain required. A codec fixture
passing does not prove a certified CMP or a complete consent implementation.

Clean packed Expo and bare consumers, standalone native consumers, launched-app
checks, permission failures, storage/key loss, offline recovery, accessibility
and release-device performance remain acceptance gates. Track each result with
its actual package, native, OS and device versions. Do not substitute unit tests,
compilation or stub benchmarks for device, certification or registry evidence.
