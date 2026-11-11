---
packages:
  '@c15t/backend': patch
---

### Pass the native platform header to session sinks

`sessions.onReport` now receives `x-c15t-platform` in its request headers. The
iOS and Android SDKs send it as `apple->`, `android->` or `rn->` and their
version, and their `x-c15t-version` carries no platform prefix, so this header
is how a sink tells a Swift, Kotlin or React Native app apart.
