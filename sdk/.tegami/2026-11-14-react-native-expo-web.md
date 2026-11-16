---
packages:
  '@c15t/react-native': minor
---

### `@c15t/react-native` runs on Expo web

A universal Expo app now uses one import on iOS, Android and web. On web,
`ConsentProvider`, the hooks, `ConsentGate`, `ConsentReady`, `ConsentPrompt`,
`ConsentBanner`, `ConsentDialog` and `ConsentPreferences` run on `@c15t/core`,
the engine the c15t web SDKs use, and talk to the same Inth project. Before
this, any web render of `ConsentProvider` threw `NativeC15tUnavailableError`.

- Install `@c15t/core` for web. It is an optional peer dependency. Metro picks
  the web files by their `.web.js` platform extension, so iOS and Android
  bundles contain none of it.
- The Expo config plugin also writes `consentCategories` and `forceGPC` to
  `extra.c15t`, and the web build reads its options from there. There is no
  web-only configuration.
- Web has no native screens: mount `ConsentBanner` or your own UI.
  `presentConsentPrompt()` and `presentPreferences()` reject with
  `C15T_NATIVE_UI_EXCLUDED`. App Tracking Transparency reports `unsupported`.
  IAB TCF, GPP and WebView consent sync stay native-only.
- A production web bundle refuses `dryRun`, as a native release build does.
- The plugin's Expo Go check now accepts `expo start --web` and `expo serve`.
  It also no longer fails web bundling when Metro's workers read the app
  config.
- The drawn components no longer throw on React Native for Web.

See [Expo web](https://c15t.com/docs/frameworks/react-native/web).
