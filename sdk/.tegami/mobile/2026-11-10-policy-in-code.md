---
packages:
  'swift:c15t-swift': minor
  'maven:c15t-android': minor
---

### Define the consent policy in code for apps with no backend

No-backend mode now takes a typed policy kept in source control, in the
backend's `PolicyRule` names: `id`, `match`, `model`, `prompt`, `categories`,
`scopeMode`, `preselectedCategories`, `actions`, `validity`, `privacySignals`
and `copyRevision`. It is the only policy source in that mode, and it shows the
prompt on the first launch with no network.

- Swift: `ConsentPolicy(rules:)` or `ConsentPolicy(json:)`, passed as
  `CoreConfig.policy` with `OfflineTransport` or no transport.
  `C15tAppleConfiguration.policy` uses it with the offline transport.
- Kotlin: `ConsentPolicy(rules)` or `ConsentPolicy.fromJson`, passed as
  `NativeConfig.policy` with `backendUrl = null`. In offline mode
  `C15tAndroid.configFrom` reads the asset `com.c15t.POLICY_RULES` names.

Rules normalize and match as on the backend. The device has no geolocation
without a backend, so the `fallback` rule applies unless the app sets an
override country and region. The `iab` model is refused, because IAB TCF needs
a backend to serve the Global Vendor List.

Rules are checked with the backend's authoring rules, and validity days may be
fractional. Changing only `validity.noticeDays` keeps category choices, and
changing only `choiceDays` keeps notice acknowledgements. A declared policy the
SDK refuses at launch reports `policy-invalid` in the snapshot `error` and on
the error stream instead of starting silently with no policy.

A location no rule covers now gets the backend's own outcome: `no-match` runs
the safe opt-in fallback. A country that needs a region, given without one,
drops the rule in force and denies optional categories on both platforms until
a region arrives. The saved choice stays and applies again when the policy
matches. An
explicit `no-match` answer from `/init` also replaces the rule in force on
Android, as it already did on iOS and the web.
