---
packages:
  '@c15t/react-native': patch
---

### Report React Native as the platform on iOS and Android

A core the binding installs now sends `x-c15t-platform: rn-><version>` on both
platforms, with an unprefixed `x-c15t-version`. Before, Android sent
`x-c15t-version: rn-><version>`, and iOS reported React Native apps as `apple`.
