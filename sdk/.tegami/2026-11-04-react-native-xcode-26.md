---
packages:
  '@c15t/react-native': patch
---

### Build the iOS app with Xcode 26

An iOS app that installed `@c15t/react-native` through CocoaPods failed to
compile with Xcode 26 and stopped with "circular reference" in
`ConsentCore.swift`. Xcode 27 built it unchanged. The app now builds with both.
