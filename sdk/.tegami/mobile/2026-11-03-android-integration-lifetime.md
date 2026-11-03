---
packages:
  'maven:c15t-android': patch
---

### Keep Android analytics withdrawal connected

Keep applying consent to Firebase Analytics, PostHog, Mixpanel and Sentry Replay
until the integration is closed, even if the app drops its handle. Failed
construction still detaches and disables the vendor.
