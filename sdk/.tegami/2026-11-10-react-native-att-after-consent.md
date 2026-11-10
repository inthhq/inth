---
packages:
  '@c15t/react-native': minor
---

### Ask for App Tracking Transparency after the consent prompt

When your app enables ATT, `ConsentProvider` now asks for it after the consent
prompt closes, and only if the person granted marketing. Someone who refused
marketing never sees Apple's alert. A later launch with a stored marketing
grant, or a change from denied to granted in privacy settings, asks then.

The provider asks only while Apple's answer is not determined and the app is
active, and the native prompt now reports its outcome once its screen has
finished animating away. Apple's answer never changes stored consent. Android
is unaffected.

Set `trackingRequest` to change the order:

- `afterConsent` (default): the prompt first, then Apple's alert.
- `beforeConsent`: Apple's alert first, then the prompt.
- `manual`: nothing automatic. This is the previous behaviour.

This changes existing apps that set `enableAppTrackingTransparency`: Apple's
alert now appears after consent without a `requestTrackingAuthorization()` call.
Pass `trackingRequest="manual"` to keep asking from your own code.
