# c15t for Swift

Native consent management for SwiftUI and UIKit apps. c15t resolves your Inth
project's policy, stores choices on the device, presents consent screens and
provides synchronous gates for optional SDKs. It also powers the Apple side of
`@c15t/react-native`.

Start with the [Swift quickstart](../../docs/frameworks/swift/quickstart.mdx).
It names the files to add to your app, shows the stock consent presenter and
keeps a Privacy settings action available after the first choice.

## Products

The root `Package.swift` names the package `c15t` and exports these products:

| Product | Purpose |
| --- | --- |
| `C15tCore` | Policy evaluation, consent and IAB authority, durable records, queued saves and cached gates |
| `C15tApple` | Protected Keychain installation, HTTP transport, lifecycle/reachability handling and optional ATT orchestration |
| `C15tConsentUI` | Optional SwiftUI prompt, settings, native drafts and disclosure screens |

SwiftUI and UIKit consent UI requires iOS 16.4 or later. The core and platform
products do not depend on React Native, Expo or a JavaScript runtime. Apps with
their own UI can omit `C15tConsentUI`.

These are currently private source artifacts. In Xcode, add the authorized
checkout's root as a local Swift package. A separate Swift repository is not
required. See [mobile availability](../../docs/guides/mobile-status.mdx) for
distribution and release status.

## Guides and examples

- [SwiftUI quickstart](../../docs/frameworks/swift/quickstart.mdx)
- [UIKit integration](../../docs/frameworks/swift/uikit.mdx)
- [Native gates and custom UI](../../docs/frameworks/swift/headless.mdx)
- [Colors, identity and copy](../../docs/frameworks/swift/customize.mdx)
- [IAB and advertising](../../docs/guides/mobile-iab.mdx)
- [Offline startup and persistence](../../docs/guides/mobile-offline.mdx)
- [App verification](../../docs/guides/mobile-verify.mdx)

`Examples/AppleInstallation/Quickstart` contains the quickstart's checked source
files. Select either the SwiftUI or UIKit entry point, not both. The
[runnable SwiftUI example](Examples/swiftui-consent/README.md) also has a custom
category form, unavailable-policy mode and delivery status. The
[custom consent example](Examples/custom-consent/README.md) draws its own
prompt, preferences and IAB TCF screens on the headless blocks. The maintained
[native consent demo](../examples/consent-demo/README.md) includes SwiftUI,
UIKit and IAB review modes.

## Headless blocks

`C15tConsentUI` also has blocks that carry behaviour and no look, for an app
that draws its own consent screens. c15t supplies the state, the actions, the
localized copy and the accessibility. The stock screens run on the same draft.

| Block | What it does |
| --- | --- |
| `ConsentDraft` | Staged category and IAB choices, a save that names the revision it was read at, stale and retry handling, and the copy |
| `ConsentDraft.iab` | The IAB TCF selection with the commands `useIAB()` has on the web, and the disclosure as rows |
| `HeadlessConsentPrompt` | Shows your first layer only while the policy owes one |
| `HeadlessConsentPreferences` | Your preferences screen, with close-after-save and a check before unsaved edits are dropped |
| `ConsentGate`, `ConsentReady` | Show content only while the saved decision allows it, or once a policy is resolved |
| `ConsentActions` | Equal-width actions that stack when a label does not fit or text is large |
| `consentPane(_:)`, `consentInitialFocus()` | VoiceOver hears the screen change and starts on your heading |

```swift
@StateObject private var draft = ConsentDraft(core: core)

HeadlessConsentPrompt(draft: draft, onOpenPreferences: { showPreferences = true }) { prompt in
    VStack {
        Text(prompt.title)
        Text(prompt.description)
        ConsentActions {
            Button(prompt.rejectAllLabel) { prompt.rejectAll() }
            Button(prompt.acceptAllLabel) { prompt.acceptAll() }
        }
        Button(prompt.customizeLabel) { prompt.openPreferences() }
    }
    .consentPane(prompt.title)
}
```

A save reports `true` once the choice is stored on the device. A
`concurrent-change` refusal turns the draft stale and keeps the edits until
`reset()`. A storage failure keeps the edits and sets `errorMessage`. Gate SDKs
on the saved decision, never on a draft.

## Consent before optional SDK startup

Call `C15tApple.install` before starting optional SDKs. It verifies protected
storage and hydrates the process's single core before returning. A fresh
installation remains pending until a usable policy is available.

The mobile SDKs work with the Inth hosted service. The configuration takes one
`backendURL`, the project URL from your Inth dashboard, such as
`https://your-project.inth.app`. Any other host is refused at install with an
error that says what to write. There is no self-hosted or offline mode and no
custom transport. A bundled manifest or an in-code `policy` covers a launch
with no network.

`dryRun: true` is for development and CI. The prompt, storage, gates and
consent signals work as normal, and consent records are dropped instead of
queued or sent. A release build refuses to install with it, so pass it only
inside `#if DEBUG`. In a debug build it also lets `backendURL` be any `https`
URL or `http` on `localhost`.

`isAllowed`, `decision(for:)`, `snapshot` and `isReady` read cached native
state. They do not fetch a policy or wait for storage. Keep a `gate`
subscription for integrations that must stop after withdrawal, and cancel its
handle when the owner goes away. Snapshot and gate callbacks can arrive on any
queue; UI updates belong on the main actor.

Category writes use native `CommitIntent` values. Save with an expected
snapshot revision when editing a draft, and keep refused drafts available for
retry. Local `.committed` success is separate from backend delivery.

## IAB and platform signals

The core owns native IAB drafts, revision-bound commits, TC Strings, vendor and
purpose choices, legitimate-interest objections, publisher restrictions and
Google Additional Consent v2. A committed IAB decision is stored with its
policy and disclosure authority and included in consent-save payloads.

`iabPresentation()` returns retained disclosures with a detached draft and
editing status. New grants require current valid authority; an expired list can
remain readable for partner details. Use native vendor/purpose/provider gates
before advertising work. A category Boolean or a served vendor list is not a
complete IAB decision.

The Apple installer projects vendor-readable `IABTCF_*` values to standard
UserDefaults while the protected native record remains authoritative. Pass
`iab:` to `C15tAppleConfiguration` to turn IAB TCF on. IAB registration,
mobile validation and Google App certification remain separate requirements.

## Build and test

From the repository root:

```sh
swift build
swift test
```

The nested package also exposes the benchmark executable:

```sh
swift run --package-path native/core-swift C15tCoreBench
```

The shared fixtures in `native/protocol` check wire behavior across Swift,
Kotlin and TypeScript. Package tests do not replace the iOS app journeys in the
verification guide.

`Sources/C15tCore/Resources/PrivacyInfo.xcprivacy` ships as a SwiftPM resource.
Review the app's final privacy manifest along with the other SDKs it embeds.
