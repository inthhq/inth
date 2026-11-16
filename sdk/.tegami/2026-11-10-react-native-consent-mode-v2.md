---
packages:
  '@c15t/react-native': minor
---

### Send every Consent Mode v2 signal from Firebase Analytics

`connectFirebaseAnalytics` now sets all four Firebase consent types from
consent, with the same mapping as the web's Google helpers. Measurement
grants `analytics_storage`. Marketing grants `ad_storage`, `ad_user_data` and
`ad_personalization`. Before, the three advertising types were always
`false`, so an app that runs ads could not use the helper.

This is a breaking change. `connectFirebaseAnalytics` no longer takes a
`category` option, and `FirebaseAnalyticsConsent` types the advertising
fields as `boolean`. Collection is still on only while `analytics_storage` is
granted.

`@c15t/react-native/integrations` also exports `GOOGLE_CONSENT_TYPES`,
`GOOGLE_CONSENT_MODE_CATEGORIES` and `resolveGoogleConsentMode`, which give
all seven Consent Mode v2 types from c15t consent.

The Expo config plugin now writes Firebase's four
`GOOGLE_ANALYTICS_DEFAULT_ALLOW_*` keys as `false` in `Info.plist` and the
matching `google_analytics_default_allow_*` metadata in `AndroidManifest.xml`,
so Firebase grants nothing before c15t's consent is read. The Android entries
replace React Native Firebase's library values.
