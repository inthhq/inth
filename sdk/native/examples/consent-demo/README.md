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
