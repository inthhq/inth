---
packages:
  'swift:c15t-swift': minor
  'maven:c15t-android': minor
---

### Connect mobile analytics and replay to native consent

Use bundled helpers in the Apple and Android platform modules to keep Firebase
Analytics, PostHog, Mixpanel or Sentry Session Replay in sync with consent.
Helpers apply current native permission, handle withdrawal and reapply permission
after a vendor reset.
Firebase advertising permissions remain denied. Vendor SDKs stay optional and
are configured by the app.

Native Swift and Kotlin Amplitude integration is deferred pending a thread-safe
vendor opt-out contract. Errors in an Android integration's error reporter no
longer prevent other integrations from receiving withdrawal.
