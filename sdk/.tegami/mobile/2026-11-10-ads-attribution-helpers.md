---
packages:
  'swift:c15t-swift': minor
  'maven:c15t-android': minor
---

### Connect AdMob, AppsFlyer, Adjust and Meta to native consent

`AdMobIntegration`, `AppsFlyerIntegration`, `AdjustIntegration` and
`MetaAppEventsIntegration` keep each SDK in step with consent, in `C15tApple`
and `com.c15t.android.integrations`. Each applies current consent when it is
created and on every change, and calls the vendor's own consent API:

- AdMob gets the Consent Mode advertising types, for limited ads,
  personalization and restricted data processing.
- AppsFlyer stays stopped until its category is granted, then starts and
  receives DMA consent data.
- Adjust stays disabled until its category is granted, then receives
  third-party sharing with Google's DMA options.
- Meta's automatic App Events and advertiser ID collection follow marketing,
  with Limited Data Use on while it is denied.

The Google signals come from the shared Consent Mode mapping through the new
`GoogleAdsConsent`. The app passes the vendor calls in; c15t still adds no
vendor dependency.

These helpers share the existing helpers' withdrawal rule: a withdrawal
applies at once, even while a grant is still waiting on a vendor call, and
when a helper makes several calls to turn collection off, they all run even
if one fails, and the failure is reported.
