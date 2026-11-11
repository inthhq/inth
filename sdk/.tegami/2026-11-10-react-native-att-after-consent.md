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
active, never while a c15t screen is open, and never once a stored choice
refuses marketing. The native prompt now reports its outcome once its screen has
finished animating away. Apple's answer never changes stored consent. Android
is unaffected.

Set `trackingRequest` to change the order:

- `afterConsent` (default): the prompt first, then Apple's alert.
- `beforeConsent`: Apple's alert first, then the prompt, also for a prompt
  the app opens with `presentConsentPrompt`. Settings are never delayed.
- `manual`: nothing automatic. This is the previous behaviour.

This changes existing apps that set `enableAppTrackingTransparency`: Apple's
alert now appears after consent without a `requestTrackingAuthorization()` call.
Pass `trackingRequest="manual"` to keep asking from your own code.

`beforeConsent` now also asks at a launch that owes no consent prompt, while
Apple's answer is not determined and marketing is not refused.

New `trackingReprompt` prop: `never` (default) or `yearly`. With `yearly` the
provider calls the request once per launch when Apple's answer is `authorized`
or `denied`, marketing is granted, and 365 days have passed since the SDK last
saw an answer. Apple decides whether to show anything: in the EU it may ask again
a year after the previous answer; elsewhere nothing shows.

Under an IAB TCF policy, marketing counts as granted for ATT only while the TC
String also grants the `marketing` purposes, derived as `@c15t/iab` does. Reject
all never leads to Apple's alert, and Additional Information opens the TCF
preferences.

A GPC signal or explicit denial on marketing now counts as a refusal, so
`beforeConsent` no longer asks at launch for someone who opted out that way.
Under IAB TCF, ATT is asked only when at least one consented vendor (or Google
ad tech provider) uses the marketing purposes; with every vendor refused, it is
not. An Additional Information tap before the consent prompt asks again after
the prompt, only if marketing is then granted.

Apple's Additional Information button now shows only when something handles
it. The provider asks for it when the stock native screens can open; pass the
new `onTrackingAdditionalInformation` prop when you draw your own consent UI.
`requestTrackingAuthorization()` shows no button; `useTrackingRequest()` does.
The button needs the new native `requestTrackingAuthorizationWithOptions`
method, so it appears after a native rebuild.

On a yearly re-ask, the stored answer time moves only when Apple's answer
changes, so a silent return does not push the next try a year out.
