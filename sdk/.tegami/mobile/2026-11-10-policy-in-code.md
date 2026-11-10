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
