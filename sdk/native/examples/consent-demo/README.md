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
