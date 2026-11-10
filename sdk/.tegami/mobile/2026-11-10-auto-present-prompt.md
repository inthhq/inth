---
packages:
  'swift:c15t-swift': patch
  'maven:c15t-android': patch
---

### Show the consent prompt with one call on Swift and Android

The stock consent UI now presents an owed prompt by itself, and each platform
reaches it in one call with no copied helper code:

- SwiftUI: `.c15tConsent(configuration, privacyPolicyURL:)` installs the core,
  retries after a locked Keychain, and presents the prompt.
  `.c15tConsent(privacyPolicyURL:)` attaches to a core you installed yourself.
- UIKit: make `ConsentRootViewController(root:configuration:privacyPolicyURL:)`
  the window root.
- Compose: `C15tConsent(privacyPolicyUrl = "https://...")`.
- Activity with views: `attachConsent("https://...")` after `setContentView`.

All of them share one `ConsentPrompt` per core. It waits until the core is
ready, presents once per owed prompt, stays quiet while a stored choice is
valid, and presents again after a policy change or an expired choice. Two
scenes, Activity recreation or a manual `presentPrompt()` never open a second
prompt. `ConsentPrompt.onFinished` reports how each session ended. Pass
`autoPresent: false` (Swift) or `autoPresent = false` (Kotlin) to present it
yourself.

Breaking changes:

- `ConsentPresenter(core:automaticPresentation:)` is now
  `ConsentPresenter(core:autoPresent:)` on both platforms, and `autoPresent` is
  a settable property.
- With `autoPresent` off, an owed notice no longer shows until `presentPrompt()`.
- `C15tConsentUI` now depends on `C15tApple`.

The Swift quickstart drops its `ConsentModel` and `ConsentRoot` files, and the
Android quickstart drops its `ViewModel` factory.
