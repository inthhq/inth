---
title: Install the Apple platform module
description: Install and hydrate one native consent engine for SwiftUI, UIKit and React Native in the private prerelease.
---

Use the `C15tApple` library from `native/core-swift` for application installation.
It depends on `C15tCore` and Apple frameworks. It has no RN, Expo, JavaScript
runtime or stock UI dependency. These source modules are private prerelease
artifacts. Registry resolution, clean standalone consumers and device acceptance
remain unproven.

The source examples in `native/core-swift/Examples/AppleInstallation` show SwiftUI
and UIKit entry points using the same `InstallConsent.install()` function. They
require an Inth project URL and policy configuration. Replace the placeholder URL
before running them. The examples are entry-point compile checks, not launched
apps or a full IAB integration. Do not use them as evidence for ENG-507's clean
consumer or device criteria.

## Install before SDK startup

Call `C15tApple.install(C15tAppleConfiguration(...))` before starting optional SDKs
or the RN host. Choose `.hosted(projectURL)` or `.selfHosted(backendURL)`.
Both require an absolute HTTPS URL in production. Development HTTP is accepted
only for `localhost`, `127.0.0.1` and `[::1]`, matching the Expo plugin. Lookalike
hosts and other HTTP addresses are refused before installation. `initURL` follows
the same rule and overrides init only; consent saves
and identity requests stay on the backend URL. Keychain is the default storage.
The platform module selects the existing native storage and transport types.

Installation verifies a storage write, read and delete, then hydrates the existing
native engine synchronously. Network resolution and queue delivery use the core's
scheduler. The returned core is also `C15t.current`. Cached `C15t.isAllowed` and
`C15t.decision` reads do no storage or network work. A new or unavailable decision
keeps optional SDKs gated.

Repeated installation returns the same core and retains its original
configuration. Concurrent callers through this installer wait for its first
hydration to finish. A second call does not change the backend, identity or
store. Do not call raw `C15t.bootstrap` concurrently with production installation.
Raw `CoreConfig()` uses memory and no transport, so it is unsuitable as a
production startup recipe.

`C15tApple.install(CoreConfig)` supports custom native services and validates their
storage in the same way. The host owns a custom store's protection and its retry
policy. Custom stores must implement `ConsentStore.read(for:)`, returning `nil`
only for a missing item and throwing on operational read failures. The default
implementation accepts readable bytes from `data(for:)` but throws on its
ambiguous `nil`; it cannot establish absence for a fresh custom store.
`.memory`, `.file` and `.disabled` are explicit development options.
File writes are atomic on every platform. iOS-family targets also request complete
file protection; macOS and Mac Catalyst omit that unsupported Data Protection
option. File storage on macOS is not a protected-storage substitute for Keychain.
Offline mode retains local choices and undelivered saves but cannot resolve a
missing policy or deliver remote records. It is not recommended for production
environments as the only launch transport.

## Handle protected storage failure

`C15tAppleInstallationError.protectedStorageUnavailable` leaves no new core
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
instance. Set `com.c15t.reactnative.AutoBootstrap` to `false` when the application
owns startup. `C15tReactNativeBootstrap.install(core)` remains an attachment path
for an already bootstrapped engine. It refuses a different installed engine.
No adapter creates a second authoritative consent engine.
Startup returns `false` and logs configuration or installation failures. The
optional configuration and transport factories return `nil` for refused settings.

In a CocoaPods RN application, host Swift code must `import C15tReactNative` and
call that module's public `C15tApple.install`, `C15tApple.tracking`, `C15t.current`
and `C15tReactNativeBootstrap.install` APIs. The pod compiles the generated core,
Apple services and bridge into that same module. Do not also link a `C15tCore`
pod or a separate SwiftPM `C15tCore`/`C15tApple` product into that process. A second
compiled copy has its own installation singleton and can compete for the same
Keychain service. Changing the service does not make two consent authorities safe.
Set the auto-bootstrap opt-out in Info.plist before native host installation.
`native/core-swift/Examples/AppleInstallation/cocoapods-host.swift` shows the
module imports and attachment ordering for this path.

SwiftPM source consumers import `C15tCore`, `C15tApple` and
`C15tReactNativeBridge` from the same resolved source package. The RN SwiftPM
manifest currently supports a local source checkout only, through its default
path or `C15T_CORE_PATH`. It explicitly refuses `C15T_CORE_VERSION` and
`C15T_CORE_URL` until a remote native package containing both products exists.
The npm tarball does not include that workspace SwiftPM manifest. Remote native
distribution and clean SwiftPM consumers remain release gates.

The Apple module owns foreground and reachability subscriptions. Foreground hands
queue replay and policy refresh to the core. A newly regained network requests
queue replay. Installation registers once. `C15tApple.shutdown()` removes those
subscriptions without clearing consent or replacing the core. A later install or
attach registers them again. Hosts that own their own lifecycle can shut down the
automatic registrations and call the core directly.

`C15tTrackingController` provides the existing optional ATT orchestration without
RN. Use `C15tApple.tracking` so native hosts and RN share one prompt flight. It reads current OS authorization on every request and requires
the app's usage string before asking Apple. RN delegates to this same controller
implementation. ATT results never modify c15t consent. Apps that require both
permissions must check c15t consent and OS authorization separately. OS prompt
presentation and Settings changes still need on-device verification.

## Versions and validation limits

Core requests report `x-c15t-version: <C15t.version>`. Platform-created
hosted transports also report `x-c15t-platform: apple-><C15tApple.version>` on
init, save and identity requests. These native source versions are independent
of the RN npm version. None is the internal 12-bit IAB CMP version or a claim of
CMP registration or certification. `C15t.version` in `Transports.swift` is the
source of truth for the Swift native package. `C15tApple.version` aliases it and
the local `C15tCore.podspec` reads it directly. The pod no longer accepts an
independent `C15T_CORE_POD_VERSION`. Tests compare the native module versions;
request tests verify both header values.

The CocoaPods RN package compiles generated copies of both native modules into
its existing pod target. SwiftPM keeps `C15tCore`, `C15tApple` and the RN bridge as
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
