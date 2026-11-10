---
packages:
  '@c15t/react-native': minor
---

### Build without the stock native consent screens

An app that draws all of its consent UI with the headless hooks can now leave
the SwiftUI and Compose screens out of the binary. Set `nativeUI: false` in the
Expo plugin options, or `c15t.nativeUI=false` in a bare app's
`gradle.properties` and `Podfile.properties.json` (or `C15T_NATIVE_UI=0 pod
install`). The iOS pod then compiles without the SwiftUI screens and the
Android build drops the `c15t-consent-ui` dependency. The consent engine, IAB
encoding, storage and SDK gates stay.

`useC15tBootstrap().nativeUI` reads `false` in such a build, and
`presentConsentPrompt` and `presentPreferences` reject with
`C15T_NATIVE_UI_EXCLUDED`. The plugin refuses `nativeUI: false` together with
`theme`.
