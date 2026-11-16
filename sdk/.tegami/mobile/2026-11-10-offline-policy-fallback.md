---
packages:
  'swift:c15t-swift': minor
  'maven:c15t-android': minor
---

### Keep prompting from an expired bundled manifest, and add Android offline mode

In backend mode the SDK now picks policy from the live `/init` response, then
the last good cached response, then the manifest bundled at build time. A newer
bundled manifest replaces an older bundled one cached by an earlier build.

An expired bundled manifest now keeps working offline: the prompt shows,
choices save, and optional categories stay off until the person chooses. The
core emits `policyStale` once per manifest and reports `isPolicyStale`.

- Swift: `CoreEvent.policyStale(BundledPolicyAuthority)` and
  `ConsentCore.isPolicyStale`.
- Kotlin: `ConsentCore.onPolicyStale { authority -> }` and
  `ConsentCore.isPolicyStale`. A new observer hears a stale manifest already in
  force.
- A retained manifest bound to another backend URL reports
  `bundled-policy-unusable`, which replaces `bundled-policy-expired`.

Android gets no-backend mode. `NativeConfig.backendUrl` is now nullable; `null`
starts a core that sends nothing through the new `OfflineTransport`, and
refuses a `bundledPolicy`. The manifest key `com.c15t.MODE=offline` selects it
for automatic startup.
