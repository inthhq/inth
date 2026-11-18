---
title: Install the Apple platform module
description: Install and hydrate one native consent engine for SwiftUI, UIKit and React Native in the private prerelease.
---

Use the `InthApple` library from `packages/swift` for application installation.
It depends on `InthCore` and Apple frameworks. It has no RN, Expo, JavaScript
runtime or stock UI dependency. These source modules are private prerelease
artifacts. Registry resolution, clean standalone consumers and device acceptance
remain unproven.

The source examples in `packages/swift/Examples/AppleInstallation` show SwiftUI
and UIKit entry points using the same `InstallConsent.install()` function. They
require an Inth project URL and policy configuration. Replace the placeholder URL
before running them. The examples are entry-point compile checks, not launched
apps or a full IAB integration. Do not use them as evidence for ENG-507's clean
consumer or device criteria.

## Install before SDK startup

Call `InthApple.install(InthAppleConfiguration(backendURL: ...))` before starting
optional SDKs or the RN host. `backendURL` is the project URL from the Inth
dashboard. `InthProjectURL` checks it against the cases in
`packages/native-protocol/project-url/cases.json` and installation throws
`invalidBackendURL` for any other host. There is no self-hosted mode and no
`initURL`. `dryRun: true` drops consent records for development and CI, lets a
debug build use any HTTPS URL or HTTP on `localhost`, `127.0.0.1` and `[::1]`,
and is refused in a release build. Keychain is the default storage.

Installation verifies a storage write, read and delete, then hydrates the existing
native engine synchronously. Network resolution and queue delivery use the core's
scheduler. The returned core is also `Inth.current`. Cached `Inth.isAllowed` and
`Inth.decision` reads do no storage or network work. A new or unavailable decision
keeps optional SDKs gated.

Repeated installation returns the same core and retains its original
configuration. Concurrent callers through this installer wait for its first
hydration to finish. A second call does not change the backend, identity or
store. Do not call raw `Inth.bootstrap` concurrently with production installation.
Raw `CoreConfig()` uses memory and no transport, so it is unsuitable as a
production startup recipe.

`InthApple.install(CoreConfig)` is internal API (`@_spi(InthInternal)`) for tests
and first-party fixtures. It validates storage in the same way and skips the
host rule. A custom store must implement `ConsentStore.read(for:)`, returning
`nil` only for a missing item and throwing on operational read failures.
`.memory` and `.file` are explicit development storage options.
File writes are atomic on every platform. iOS-family targets also request complete
file protection; macOS and Mac Catalyst omit that unsupported Data Protection
option. File storage on macOS is not a protected-storage substitute for Keychain.
A launch without network keeps local choices and queues undelivered saves. It
needs a bundled manifest or an in-code policy to show a first prompt. A
`CoreConfig` with no transport is internal test configuration.

## Handle protected storage failure

`InthAppleInstallationError.protectedStorageUnavailable` leaves no new core
installed. Keep optional SDKs off and retry installation after protected data
becomes available. Do not replace Keychain with memory or plaintext storage after
a failure. Invalid hosted URLs and attachment of an unbootstrapped host engine
also fail explicitly.

The SwiftUI example retries on protected-data availability and activation. The
UIKit delegate retries in `applicationProtectedDataDidBecomeAvailable` and
observes `UIApplication.didBecomeActiveNotification`, which also covers scene-based apps. A retry clears the recorded storage error only
after installation succeeds. Reevaluate native gates before starting optional
SDKs after recovery. These are compiled examples, not proof of an OS unlock flow.

The installer checks the stored subject with `read(for:)`. If that read fails,
installation stops without deleting consent or queued saves. Retry after storage
recovers. If the subject is confirmed absent or its bytes are malformed, the
installer reads both the envelope and queue before removing those orphaned items.
A failed read stops cleanup before either item is deleted. A failed deletion also
refuses installation. Consent recorded for an earlier subject cannot become a
grant for a newly minted identity. A fully removed store starts with unknown
consent.
A valid Keychain identity and its records may survive an application reinstall;
this increment does not add a reinstall marker or promise that uninstall deletes
Keychain data.

## Attach RN and own subscription lifetime

RN's existing launch hook parses legacy Info.plist configuration and calls the
same Apple installer. If the native app installed first, RN attaches to that
instance. Set `com.inth.reactnative.AutoBootstrap` to `false` when the application
owns startup. `InthReactNativeBootstrap.install(core)` remains an attachment path
for an already bootstrapped engine. It refuses a different installed engine.
No adapter creates a second authoritative consent engine.
Startup returns `false` and logs configuration or installation failures. The
optional configuration and transport factories return `nil` for refused settings.

In a CocoaPods RN application, host Swift code must `import InthReactNative` and
call that module's public `InthApple.install`, `InthApple.tracking`, `Inth.current`
and `InthReactNativeBootstrap.install` APIs. The pod compiles the generated core,
Apple services and bridge into that same module. Do not also link a `InthCore`
pod or a separate SwiftPM `InthCore`/`InthApple` product into that process. A second
compiled copy has its own installation singleton and can compete for the same
Keychain service. Changing the service does not make two consent authorities safe.
Set the auto-bootstrap opt-out in Info.plist before native host installation.
`packages/swift/Examples/AppleInstallation/cocoapods-host.swift` shows the
module imports and attachment ordering for this path.

SwiftPM source consumers import `InthCore`, `InthApple` and
`InthReactNativeBridge` from the same resolved source package. The RN SwiftPM
manifest currently supports a local source checkout only, through its default
path or `C15T_CORE_PATH`. It explicitly refuses `C15T_CORE_VERSION` and
`C15T_CORE_URL` until a remote native package containing both products exists.
The npm tarball does not include that workspace SwiftPM manifest. Remote native
distribution and clean SwiftPM consumers remain release gates.

The Apple module owns foreground and reachability subscriptions. Foreground hands
queue replay and policy refresh to the core. A newly regained network requests
queue replay. Installation registers once. `InthApple.shutdown()` removes those
subscriptions without clearing consent or replacing the core. A later install or
attach registers them again. Hosts that own their own lifecycle can shut down the
automatic registrations and call the core directly.

`InthTrackingController` provides the existing optional ATT orchestration without
RN. Use `InthApple.tracking` so native hosts and RN share one prompt flight. It reads current OS authorization on every request and requires
the app's usage string before asking Apple. RN delegates to this same controller
implementation. ATT results never modify Inth consent. Apps that require both
permissions must check Inth consent and OS authorization separately. OS prompt
presentation and Settings changes still need on-device verification.

## Versions and validation limits

Core requests report `x-c15t-version: <Inth.version>`. Platform-created
hosted transports also report `x-c15t-platform: <platform>-><InthApple.version>`,
where `InthAppleConfiguration.platform` is `apple` by default and `rn` for a core
the React Native bridge configures, on
init, save and identity requests. These native source versions are independent
of the RN npm version. None is the internal 12-bit IAB CMP version or a claim of
CMP registration or certification. `Inth.version` in `Transports.swift` is the
source of truth for the Swift native package. `InthApple.version` aliases it and
the local `InthCore.podspec` reads it directly. The pod no longer accepts an
independent `C15T_CORE_POD_VERSION`. Tests compare the native module versions;
request tests verify both header values.

The CocoaPods RN package compiles generated copies of both native modules into
its existing pod target. SwiftPM keeps `InthCore`, `InthApple` and the RN bridge as
separate modules. Run `bun scripts/sync-vendored-core.ts` and
`bun scripts/sync-vendored-apple.ts` after source changes. Artifact checks reject
drift or sources omitted from the packed package. Never edit the copies by hand.

Native tests cover real file-backed cold hydration, cached reads, concurrent
installation, injected storage failures, orphaned identity/queue recovery,
foreground teardown and reattachment, and request headers. Bridge tests cover
RN attachment and the existing ATT outcomes. None proves iOS protected-data
behavior on a locked device, reinstall semantics, minimum-OS operation,
reachability delivery by the OS, an Apple permission sheet, or performance.
Simulator tests exercise the iOS file-write branch and cold hydration. The
simulator filesystem does not expose file protection attributes; that assertion
is a separate physical-device check and is skipped on simulators. Successful
simulator file I/O does not verify Data Protection or locked-device behavior.
See `docs/internal/mobile-support.md` for remaining first-release gates. Full TCF
2.4 and Additional Consent v2 remain required.
