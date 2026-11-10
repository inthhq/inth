---
packages:
  '@c15t/react-native': patch
---

### Send React Native platform attribution in its own header on Android

On Android, a core the binding installs now sends `x-c15t-platform: rn-><version>`
and an unprefixed `x-c15t-version`, matching how iOS reports its platform.
