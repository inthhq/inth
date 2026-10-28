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
Both require an absolute HTTPS URL. `initURL` overrides init only; consent saves
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
policy. `.memory`, `.file` and `.disabled` are explicit development options.
Offline mode retains local choices and undelivered saves but cannot resolve a
missing policy or deliver remote records. It is not recommended for production
environments as the only launch transport.

## Handle protected storage failure

`C15tAppleInstallationError.protectedStorageUnavailable` leaves no new core
installed. Keep optional SDKs off and retry installation after protected data
becomes available. Do not replace Keychain with memory or plaintext storage after
a failure. Invalid hosted URLs and attachment of an unbootstrapped host engine
also fail explicitly.

If the stored subject is absent or unreadable while an envelope or queue survives,
the installer removes those orphaned items before hydration. It refuses to install
if removal fails. Consent recorded for an earlier subject cannot become a grant
for a newly minted identity. A fully removed store starts with unknown consent.
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

Core requests report `x-c15t-version: swift-><C15tSDK.version>`. Platform-created
hosted transports also report `x-c15t-platform: apple-><C15tApple.version>` on
init, save and identity requests. These native source versions are independent
of the RN npm version. None is the internal 12-bit IAB CMP version or a claim of
CMP registration or certification.

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
See `docs/internal/mobile-support.md` for remaining first-release gates. Full TCF
2.4 and Additional Consent v2 remain required.
