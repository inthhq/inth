---
packages:
  'swift:c15t-swift': patch
  'maven:c15t-android': patch
---

### Ask for App Tracking Transparency after the consent prompt on Swift

When `Info.plist` carries `NSUserTrackingUsageDescription`, the stock consent
prompt now asks for ATT after it closes, and only if the person granted
marketing. It waits until the prompt has finished animating away and the app
is active, and asks only while Apple's answer is not determined. A later launch
with a stored marketing grant, or a change from denied to granted in privacy
settings, asks then. Apple's answer never changes stored consent.

Pass `trackingRequest:` to `.c15tConsent(...)` or `ConsentRootViewController`
to change the order: `.afterConsent` (default), `.beforeConsent` or `.manual`,
which is the previous behaviour. `.beforeConsent` also covers
`ConsentPrompt.presentPrompt()`, but not settings. No order asks once a stored
choice refuses marketing, while a notice card shows, or while no scene is
attached. Android has no ATT and no option.

Breaking change on Swift and Android: `ConsentPrompt.presenter` is no longer
public. Opening the prompt through it skipped the host rules and, on Swift, the
tracking order. Call `presentPrompt()` and `presentPreferences()` on
`ConsentPrompt` instead.

`.beforeConsent` now also asks at a launch that owes no consent prompt, while
Apple's answer is not determined and marketing is not refused.

New `trackingReprompt:` parameter on `.c15tConsent(...)` and
`ConsentRootViewController`: `.never` (default) or `.yearly`, which calls the
request once per launch when Apple's answer is `authorized` or `denied`,
marketing is granted, and 365 days have passed since the SDK last saw an answer.
Apple decides whether to show anything. `C15tTrackingController` records that
time in a `C15tTrackingAnswerLog` and takes an injectable clock.

Under an IAB TCF policy, marketing counts as granted for ATT only while the TC
String also grants the `marketing` purposes, as the web IAB module derives them.
