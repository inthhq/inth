---
packages:
  '@c15t/cli': minor
---

### Set up Expo, React Native, Swift and Android apps with `c15t setup`

`c15t setup` now detects mobile projects. In an Expo app it adds the
`@c15t/react-native/expo-plugin` entry to `app.json` and writes a provider
file. In a bare React Native app it writes the provider file and prints the
`Info.plist` and `AndroidManifest.xml` entries. In a Swift or Android app it
prints the exact steps: the install and the consent-screen entry points for
SwiftUI, UIKit, Compose and Activity apps, including the offline install with
an in-code policy for `c15t setup offline`. It edits no Xcode or Gradle file.
New options: `--categories`, `--privacy-policy-url` and `--bundle-manifest`.
The privacy policy URL is required on every platform and must be https, as
the native consent screens require.

Before, an Expo or React Native app was treated as a React web app. Web
projects are unaffected.
