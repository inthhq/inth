---
packages:
  '@c15t/react-native': patch
---

### Apply a withdrawal at once, even while a grant is still pending

`connectFirebaseAnalytics`, `connectPostHog`, `connectMixpanel`,
`connectSentryReplay` and `connectAmplitude` no longer hold a withdrawal back
behind a vendor promise from an earlier grant that has not settled. The
withdrawal's vendor calls are made at once, and when the earlier promise
settles, current consent is applied again, so a grant that settles late
cannot leave the vendor enabled. A later regrant waits for the withdrawal.
`disconnect()` no longer waits behind an unsettled vendor call either.

When Firebase turns collection off and sends the denied consent types, both
calls are now made even if the first one fails, and the failure is reported.
