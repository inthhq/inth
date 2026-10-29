---
title: Mobile support contract
description: Module ownership, candidate versions, transport modes and OTA compatibility for the private c15t mobile SDK.
---

The mobile SDK is a private prerelease. No mobile version is supported for
production until the clean-consumer, device and first-release IAB gates pass.
A successful unit test or native build does not establish those gates.

## Module ownership

| Module | Owns | May depend on |
| --- | --- | --- |
| Swift `C15tCore` and Kotlin `c15t-core` | Consent and IAB authority, durable records, hydration, immutable save queue and cached gates before JavaScript | OS and native libraries, no RN, Expo, JavaScript runtime or stock UI |
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
install without another c15t JavaScript package, a backend runtime or a JS TCF
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
| React Native | 0.86.x and 0.87.x, New Architecture | Clean packed bare and Expo builds and launches on both platforms |
| React | `>=19.2.3 <19.3.0` | Packed consumer type-check plus device integration |
| Expo | SDK 57 with its prescribed RN and React versions, custom native build | Clean prebuild, EAS build and device launch; Expo Go cannot load this SDK |
| Apple | iOS 16.4 or later; Swift 5.9 language mode or later | Minimum-OS and current-OS device lifecycle, storage and ATT checks |
| Android | API 24 or later | Minimum/current device checks and compatible Gradle, AGP and Kotlin consumer builds |

The former open-ended RN `>=0.81` declaration did not have matrix evidence.
The peer range now limits candidates to the two RN minor versions above. Native
core tests run without RN or Expo. macOS SwiftPM tests do not prove an iOS
minimum deployment target or an on-device permission flow. Android artifact
publication and toolchain compatibility remain release blockers.

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

ATT authorization is separate from consent. An Apple grant cannot grant a c15t
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
