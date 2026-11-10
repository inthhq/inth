---
packages:
  '@c15t/react-native': minor
---

### Connect AdMob, AppsFlyer, Adjust and Meta to native consent

`@c15t/react-native/integrations` adds `connectAdMob`, `connectAppsFlyer`,
`connectAdjust` and `connectMetaAppEvents`. Each applies current consent when
it connects and on every change, and calls the vendor's own consent API:

- AdMob gets the Consent Mode advertising types for its request
  configuration.
- AppsFlyer stays stopped until its category is granted, then starts and
  receives DMA consent data.
- Adjust stays disabled until its category is granted, then receives
  third-party sharing with Google's DMA options.
- Meta's automatic App Events and advertiser ID collection follow marketing,
  with Limited Data Use on while it is denied.

`resolveGoogleAdsConsent` and the `GoogleAdsConsent` type give the three
advertising types from the shared Consent Mode mapping. The app passes the
vendor functions in; c15t adds no vendor dependency, and the helpers work in
Expo development builds.

These helpers share the existing helpers' withdrawal rule: a withdrawal
applies at once, even while a grant is still waiting on a vendor call, and
when a helper makes several calls to turn collection off, they all run even
if one fails, and the failure is reported.
