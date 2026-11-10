---
packages:
  '@c15t/cli': minor
---

### Set up Expo, React Native, Swift and Android apps with `c15t setup`

`c15t setup` now detects mobile projects. In an Expo app it adds the
`@c15t/react-native/expo-plugin` entry to `app.json` and writes a provider
file. In a bare React Native app it writes the provider file and prints the
`Info.plist` and `AndroidManifest.xml` entries. In a Swift or Android app it
prints the exact steps and edits no Xcode or Gradle file. New options:
`--categories`, `--privacy-policy-url` and `--bundle-manifest`.

Before, an Expo or React Native app was treated as a React web app. Web
projects are unaffected.
