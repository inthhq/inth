---
packages:
  '@c15t/react-native': minor
---

### Turn on IAB TCF from the Expo plugin and app config

Set `iab.cmpId`, `iab.cmpVersion` and `iab.publisherCountryCode` in the Expo
plugin, or the matching Info.plist and AndroidManifest keys in a bare app, to
start the native core with IAB TCF. The core then writes `IABTCF_*` values to
standard UserDefaults and default SharedPreferences. The Expo plugin stops
prebuild on an out-of-range value, and on Android when `iab` is combined with
`mode: 'offline'`, even with a `backendURL`, because Android has no offline mode. At launch, an incomplete or invalid IAB
configuration logs an error and starts without IAB. Apps without IAB keys are
unchanged.

The TC String's consent language, and the language of the native IAB
screens, follow the language the app resolves: `com.c15t.language` if set,
otherwise the device language, which is also the language the backend serves
disclosures in. Codes without a two-letter form keep `EN`. A saved IAB decision
records its language, so changing the device language asks again.
