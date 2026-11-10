---
packages:
  '@c15t/integrations': patch
---

### Share the Google Consent Mode v2 mapping with the mobile SDKs

The `gtag` and `googleTagManager` helpers send the same signals as before.
The Swift, Android and React Native SDKs now use their category-to-signal
mapping too, and tests fail if a mobile copy drifts from it. The bundled
Google Consent Mode docs say which mobile APIs read the mapping.
