---
packages:
  '@c15t/core': minor
---

### Follow a c15t mobile app's consent inside its WebView

Pass `consentSource: webViewConsentSource()` (from `c15t` or `@c15t/core`) and
a page that a c15t Swift, Android or React Native app opens in its WebView
follows the app's consent. It shows no second banner, stores nothing and sends
no consent record; "open preferences" asks the app to show its own screen.

Outside such a WebView, including in a normal browser and during server
rendering, `webViewConsentSource()` returns `undefined`, so nothing changes for
sites that do not use it. See [consent in WebViews](https://c15t.com/docs/guides/mobile-webview).
