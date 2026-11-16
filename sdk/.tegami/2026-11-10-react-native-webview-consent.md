---
packages:
  '@c15t/react-native': minor
---

### Pass app consent to your site in a WebView

`useWebViewConsent({ allowedOrigins, onPreferencesRequested })` returns props
for a `react-native-webview` `WebView`. Pages on the listed origins receive the
app's consent before their own scripts run, and follow it as it changes. Web
c15t reads it with `webViewConsentSource()` and shows no second banner. The
subject ID never crosses into the page.

The native module gains `getWebViewConsent()`, so rebuild the app after
updating. With an older native build the hook injects nothing.
