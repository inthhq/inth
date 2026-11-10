---
packages:
  'swift:c15t-swift': patch
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
