---
packages:
  'swift:c15t-swift': patch
  'maven:c15t-android': patch
---

### Apply a withdrawal at once, even while a grant is still in a vendor call

The Firebase Analytics, PostHog, Mixpanel and Sentry Replay helpers no longer
hold a withdrawal back behind a grant that is still waiting on a vendor call
on another thread. The withdrawal applies on the thread that published it,
and when the held call returns, current consent is applied again, so a grant
that completes late cannot leave the vendor enabled. A later regrant waits
for the withdrawal and applies after it.

When Firebase turns collection off and sends the denied consent types, both
calls now run even if the first one fails, and the failure is reported.
