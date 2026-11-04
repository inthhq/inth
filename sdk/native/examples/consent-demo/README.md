# Native consent demo

Start with the [mobile demo index](../../../docs/frameworks/react-native/examples.mdx).
It lists setup and run commands for UIKit, the Swift native harness, Android,
bare React Native and Expo, and separates local fixture coverage from hosted
acceptance.

The iOS XcodeGen project has `C15tUIKitDemo` and `C15tConsentDemo` schemes.
UIKit owns its window and hosts the same stock SwiftUI consent screens. Android
is the existing `:consent-demo` Gradle app. Debug builds offer Category, Notice,
and IAB TCF and Additional Consent modes on the setup screen. Release builds
require hosted setup and exclude the fixture picker.

Keep simulator code signing enabled. The project uses ad-hoc simulator signing
without a developer account. Hosted setup checks Keychain access during
installation; the local file-backed fixtures do not exercise that check.

The JSON fixtures under `fixtures/` are local protocol inputs with a test CMP
identity. They are not production policy or live hosted acceptance.

For IAB mobile validation, use the hosted IAB review mode with the identity
authorized for the review and a real IAB policy. Its diagnostics read the actual
platform `IABTCF_*` values separately from core authority. See the
[mobile TCF validation guide](../../../docs/internal/mobile-tcf-validation.md)
for setup, evidence journeys and submission questions. Neither the fixtures nor
the review app establish certification.

For Google publisher App certification, the same hosts export diagnostic JSON
with actual platform storage, loaded Google vendor 755 and Additional Consent
disclosures. Follow the [Google mobile certification guide](../../../docs/internal/mobile-google-certification.md)
for exports, local checks and submission preparation. The shared web-demo
project currently serves category policies and needs an IAB policy before it
can supply hosted certification evidence.

## Real vendor SDKs

The iOS demo links PostHog, Mixpanel, Sentry and Firebase Analytics, pinned in
`ios/project.yml`. They start only in a Debug fixture launch that sets
`C15T_VENDOR_BASE`, so the demo behaves as before for everyone else.
`ios/VendorSDKs/vendor-sdk-harness.swift` configures each SDK with collection
off, binds it to the measurement category through the c15t Swift helpers, and
adds Probe vendors and Flush buttons above the consent screens.

```sh
bash native/examples/consent-demo/ios/run-vendor-e2e.sh
```

The runner starts `scripts/vendor_capture.py`, points PostHog, Mixpanel and
Sentry at it, and runs `VendorSDKTests` in both schemes on its own
`c15t-ios-vendors` simulator, which it erases first. The test probes before any
decision, after Reject all, after granting measurement, after withdrawing it
in Privacy settings, and after a relaunch. It expects capture traffic only
after the grant. Firebase cannot be redirected, so it runs against the fake
project in `ios/VendorSDKs/GoogleService-Info.plist`, and
`scripts/vendor-firebase-log.py` checks collection, `analytics_storage` and
the probe event in its debug log. Network errors to Google are expected.

After a withdrawal, PostHog still sends events it queued while consent was
granted, such as the `$screen` event from opening Privacy settings. The test
flushes those and records them as in-flight evidence before it probes.
Evidence lands in `ios/.artifacts/vendor-e2e/`: `vendor-requests.json`,
`firebase-evidence.json`, the device log and an `.xcresult` per scheme.
