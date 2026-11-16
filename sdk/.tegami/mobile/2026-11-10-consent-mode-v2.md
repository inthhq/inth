---
packages:
  'swift:c15t-swift': minor
  'maven:c15t-android': minor
---

### Send every Consent Mode v2 signal from Firebase Analytics

`FirebaseAnalyticsIntegration` now sets all four Firebase consent types from
consent, with the same mapping as the web. Measurement grants analytics
storage. Marketing grants ad storage, ad user data and ad personalization.
Before, the three advertising types were always denied. Collection is still
on only while analytics storage is granted.

This is a breaking change. The helper no longer takes a `category`, and
`FirebaseAnalyticsConsent` has a field for each advertising type instead of
constants. Construct it with all four values, or from a Consent Mode state.

`GoogleConsentType` and `GoogleConsentMode` give all seven Consent Mode v2
types from c15t consent, in `C15tApple` and in
`com.c15t.android.integrations`. Tests on both platforms read a fixture
generated from the web mapping, so a change on the web fails them until the
native copy follows.
