---
packages:
  'swift:c15t-swift': patch
---

### Name the host in the Apple platform header

`C15tAppleConfiguration.platform` sets the host sent as
`x-c15t-platform: <platform>-><version>`. It defaults to `apple`, so Swift apps
send what they sent before. The React Native bridge now sets `rn`, so a React
Native app on iOS is no longer reported as a Swift app.
