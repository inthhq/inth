---
packages:
  'swift:c15t-swift': patch
  'maven:c15t-android': patch
---

### Use the web API's names on Swift and Android

Mobile names now match `@c15t/react` and `@c15t/core`, and both platforms use
the same words for the same concept. The old names are gone, with no aliases.

- Kotlin: `C15tKernel` is now `ConsentCore`, as on Swift. `portalUrl` is now
  `backendUrl`. `CommitIntent.Explicit` is now `CommitIntent.Custom`; the wire
  value stays `explicit`. `C15t.reset()`, which only dropped the singleton, is
  now `C15t.uninstall()`, so `reset()` always means "wipe consent".
  `C15tAndroid.install(...)` and `C15t.bootstrap(...)` return the installed
  `ConsentCore`.
- Android manifest keys: `com.c15t.PORTAL_URL` is now `com.c15t.BACKEND_URL`,
  `com.c15t.DOMAIN` is now `com.c15t.BACKEND_DOMAIN`, and `com.c15t.INIT_URL`
  is now `com.c15t.BACKEND_INIT_URL`.
- iOS `Info.plist`: `com.c15t.gpc` is now `com.c15t.forceGPC`.
- Swift: the `c15t` enum is gone. Read the version and header names from
  `C15t`, such as `C15t.version`.
