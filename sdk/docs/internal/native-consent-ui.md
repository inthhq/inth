---
title: Native consent UI prototype
description: Run the private SwiftUI and Compose consent screens with the native consent core.
---

The optional `C15tConsentUI` SwiftPM product and `c15t-consent-ui` Android
module provide the first native consent-screen prototype. They use the same
native engine as SDK gates. The core and platform modules remain headless.
This milestone does not establish production support or TCF certification.

## Run the reference apps

Start with an example Inth project. Configure its policy and permitted app
origins, then enter its HTTPS backend URL and your app's privacy-policy URL in
the demo's connection screen. The designated example is `https://example-inth.inth.app/`. Its init response uses
the current policy contract when native contract and version headers are present. Only init has been probed; this prototype has not
verified live hosted receipts. No credential or substitute customer binding is included.

The apps live in `native/examples/consent-demo`. The iOS app also accepts build
settings `C15T_BACKEND_URL` and `C15T_PRIVACY_POLICY_URL`. Android currently takes
both URLs through its connection screen. These public configuration values do
not replace backend policy authoring.

For iOS, install Xcode and XcodeGen, then run `xcodegen generate` from
`native/examples/consent-demo/ios`. Open `C15tConsentDemo.xcodeproj` and run the
`C15tConsentDemo` scheme on an iOS Simulator. The candidate deployment floor is
iOS 16.4. For Android, install JDK 17 and Android SDK 36, then run
`./gradlew :consent-demo:installDebug` from `native/core-android`. Launch the
`com.c15t.prototype.consent` app on an emulator. The candidate floor is API 24.
Current simulator and emulator runs do not validate either minimum OS.

## Attach the optional UI

On Apple platforms, install the engine once with `C15tApple.install`, away from
the main actor because installation verifies durable storage. Keep a
`C15tConsentUI.ConsentPresenter(core:)` in the host's state for its lifetime.
Apply `c15tConsent(presenter:privacyPolicyURL:)` to the SwiftUI root. Call
`presentPreferences()` from the app's standing Privacy settings entry. The
compiled reference is `ios/Sources/consent-demo-app.swift`.

On Android, install with `C15tAndroid.install`, then attach a
`com.c15t.consentui.ConsentPresenter` to that same `C15tKernel`. Keep the presenter
in a `ViewModelStore` so it survives activity recreation. Place
`C15tConsent(presenter, privacyPolicyUrl)` beside the host's content. Call
`presentPreferences()` from Privacy settings. The compiled reference is
`android/src/main/kotlin/com/c15t/demo/consent-demo-activity.kt`.

Both presenters own drafts, search, navigation and native commits. Accept all
and Reject all call core intents. Save choices submits the displayed draft with
its revision. UI callbacks report `saved` only after durable local success;
backend delivery can remain pending. `dismissed` records no decision. Android
Back closes only the SDK presenter and keeps the host activity in the foreground.
The iOS first layer blocks interactive dismissal. Dirty preferences require an
explicit discard. A pending action locks edits and navigation.

A failed write keeps the draft open. A competing decision produces a stale-draft
message and an action to load current settings. Necessary and restricted
categories use status text. LI controls read native draft values and never
start enabled in the presenter. The read-only `iabPresentation()` projection
captures the scoped partner disclosure and draft together; native gates share
the publisher-restriction rules. An unavailable or expired list blocks new
optional IAB grants while Reject all remains available.

The UI uses native SwiftUI and Material 3 controls. It includes category
preferences, IAB purpose and special-feature choices, partner search/details,
Additional Consent partner search and choices, required privacy-policy links,
notice acknowledgement and standing withdrawal. Accept and Reject share the
same style and dimensions. Stock copy is English in this prototype.

## Deterministic app tests

Only debug builds accept `C15T_FIXTURE_SCENARIO`. iOS uses a launch environment
value; Android uses an intent extra. The current scenarios are
`fresh-online`, `fresh-online-iab`, `fresh-online-notice`, `fresh-offline-none`
and `gpc-on`. The in-process fixture supplies `/init` protocol responses to the real
`HostedTransport`; all decisions and durable writes still go through the real
native core. It deliberately refuses save delivery and writes the latest
request body to `last-save.json`. This is a controlled protocol peer, not proof
of a successful hosted receipt.

`C15T_FIXTURE_RESET=1` clears only the selected scenario's test storage.
`C15T_FIXTURE_OFFLINE=1` fails init while retaining that storage.
`C15T_FIXTURE_FAIL_NEXT_WRITE=1` arms a durable decision-write refusal after initial
hydration. On Apple platforms, policy-only startup refreshes do not consume
this test fault. Android uses Boolean extras for these switches. iOS debug fixtures also accept
`C15T_FIXTURE_APPEARANCE=dark` for reproducible native theme captures. Normal app launches
do not select fixtures or reset state.

XCUITest lives in `ios/UITests/consent-journey-tests.swift`. Run it with the
`C15tConsentDemo` scheme and an explicit simulator destination. AndroidJUnitRunner
and Compose tests live in `android/src/androidTest`; build
`:consent-demo:assembleDebugAndroidTest`, install both APKs on a task-owned
emulator, then run `com.c15t.prototype.consent.test/androidx.test.runner.AndroidJUnitRunner`.
Screens expose `c15t.*` accessibility identifiers and Compose resource IDs for
later reuse. These standalone tests do not replace the separate bare RN app
journeys or packed-consumer acceptance.

For the HTTP receipt journey, start the reviewed
`internals/fixtures/react-native-bare/scripts/e2e-backend.py --out <artifact-folder>`
on free loopback port 3000. Use a fresh backend per platform. Android also needs
`adb -s <owned-serial> reverse tcp:3000 tcp:3000`. The dedicated iOS
`ProtocolReceiptTests` and Android `realControlsDeliverNativeReceipts` test select
`C15T_FIXTURE_BACKEND=http://localhost:3000/api/self-host` explicitly. This override
is accepted only in debug fixture builds and only for exact loopback hosts. Each
host declares the four optional categories before loading the permissive policy.
The tests tap the real Reject all control and compare the core's recorded category
receipts and subject identity with the received `/subjects` body. iOS also checks
process-relaunch persistence; Android instrumentation checks activity relaunch.
A separate Android force-stop and cold launch with the backend stopped also
confirmed cached policy and the recorded rejection from the same receipt journey. The backend exports
`events.jsonl` and `native-state.json`. These tests prove local protocol delivery,
not delivery to the public Inth project. Without the test backend, that dedicated
test skips; the other native app journeys still run.

## React Native hosts

The private RN package includes the same SwiftUI and Compose presenters. The
bare RN and Expo examples use these screens when the native core is installed.
Their explicit fake mode retains the existing JavaScript demo. Headless hooks
and custom UI remain available.

Subscribe with `onConsentPresenterOutcome` before calling
`presentConsentPrompt(privacyPolicyURL)` or `presentPreferences(privacyPolicyURL)`.
The HTTPS privacy-policy URL belongs to your app. A request returns
`{ sessionId, status }`. Status is `presented`, `already-presented`, or
`not-required`; the last has a null session ID. A repeated request preserves
its open draft. `closeConsentPresenter(sessionId)` ignores obsolete IDs,
requires native confirmation for a dirty draft and refuses close while saving.

Each finished session emits one compact `{ sessionId, kind, revision }` event.
`committed` means durable local storage succeeded, `acknowledged` means a
notice was durably dismissed, and `dismissed` records no decision. A definitive
no-match response uses the fallback choice prompt; its saved decisions emit
`committed`. `unavailable` means unresolved settings were closed without a
decision. Backend delivery may still be queued after a successful local commit.
Draft toggles, search and
navigation stay native. Native controls and gates continue while Hermes is
busy; JavaScript receives the final event when it resumes. Runtime teardown
removes its callback without undoing durable native work. A new Android runtime
can attach to an existing session, whose ViewModelStore survives host activity
recreation. If Android finishes the consent Activity while retaining the process,
a repeated request opens that session again with its existing draft. Outcomes are
runtime events, not a persisted event inbox.

Notice hosts leave the app visible and accept touches outside the native notice.
The UIKit adapter uses measured SwiftUI notice bounds; the Android adapter adds
a bottom-sized Compose view to the existing host Activity. Activity recreation
restores that notice and its native session without another presentation request,
including while JavaScript is busy. Saved state from an older session cannot
attach a newer notice to another Activity. Opening settings from the notice uses
the same native session. A notice acknowledgement grants nothing. If bundled
authority expires while settings are open, Reject remains available. A changed
revision still requires an explicit reload before a decision can save; Accept and Save
remain unavailable until policy refresh.

CocoaPods compiles generated copies of `C15tCore`, `C15tApple` and
`C15tConsentUI` from the packed RN package. Regenerate with
`scripts/sync-vendored-core.ts` and `scripts/sync-vendored-apple.ts`; never edit
vendored sources. Android resolves versioned `c15t-core`, `c15t-android` and
`c15t-consent-ui` binaries from the configured Maven repository. The Compose
module publishes Kotlin 2.1 metadata for the Expo 57 consumer. Installing the
RN binding includes UI code; native headless products do not depend on it.
Local staging does not authorize remote publication, and the RN package remains
private.

First-install offline policy uses the same installed core and the validated
build resource described in [mobile policy resources](../../native/docs/mobile-policy-resources.md).
The resource carries no subject or grants, retains disclosure dates, and expires.
Optional gates deny before an explicit choice. The designated hosted example
and advanced transport APIs remain unchanged. Do not renew the demo resource's
source dates to make a test pass.

The Release app runner is
`bun run --cwd internals/fixtures/react-native-bare e2e:ios` or `e2e:android`.
It creates a fresh task-owned device, embeds a controlled policy resource, and
uses real native controls for offline accept/reject/custom save, cancellation,
withdrawal, process-death persistence and exact queued replay. Its IAB step
blocks Hermes deliberately while exercising native purpose, LI, partner search,
details and Additional Consent controls, then checks gates before JavaScript
resumes and one final event afterward. The journey also checks repeated requests,
obsolete close, backgrounding, Android recreation, notice pass-through and durable
notice acknowledgement. The runner preserves XCTest/JUnit
reports, recordings, screenshots and backend/native observations, including
failed runs. Set `C15T_APP_E2E_PORT` to a free host port and
`C15T_APP_E2E_OUT` to a new evidence directory. Android reverses device port
3000 only on the device the runner creates. This proves controlled local
protocol delivery, not hosted receipt acceptance.

Full validation calls the separate mobile app workflow. It does not participate
in publishing. Local app evidence does not establish physical-device,
minimum-OS, screen-reader, RTL, localization or TCF certification coverage.
Packed Expo runtime acceptance and host-specific gaps must be recorded in the
integration handoff alongside exact refs and captures.

## Advanced transport configuration

Self-hosted backends remain compatible through the existing native transport
APIs and the same policy and subject protocol. Custom `CoreConfig` and
`NativeConfig` integrations still own transport, protected storage and lifecycle
setup. Changing transports does not change the consent screens. See
[the mobile support contract](./mobile-support.md) for installation ownership
and the remaining first-release gates.
