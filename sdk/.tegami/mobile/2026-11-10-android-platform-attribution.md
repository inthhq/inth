---
packages:
  'maven:c15t-android': patch
---

### Report the real host platform on Android requests

Android requests now send the unprefixed SDK version in `x-c15t-version`, as
web and Swift do, and name the host in a separate `x-c15t-platform` header.
A Kotlin or Java app reports `android-><version>`. Before, every Android app
reported `rn-><version>`, including apps without React Native.

`NativeConfig.platform` sets the tag and defaults to `android`. Set it to
`null` to send no platform header. `C15tProtocol.VERSION_PREFIX` is removed.
