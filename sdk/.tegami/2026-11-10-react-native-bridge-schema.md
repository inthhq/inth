---
packages:
  '@c15t/react-native': patch
---

### Check every bridge payload against one key table

`BRIDGE_PAYLOADS` lists the keys of every JSON payload that crosses the native
module, and `describeBridgePayloadDrift(name, value)` names the keys a payload
got wrong. In development, the consent client now warns when the bootstrap or a
commit result from the native build is missing a declared key.

The protocol types now declare what the native builds already send:
`CommitResult.detail` on an unreadable intent, `SnapshotResolution.reason` on a
failed resolution, and `NativeSnapshotEvent` and `NativeInitializedEvent` for
the event bodies. The iOS commit result no longer sends an undeclared `status`
key, and Android no longer sends `resolution.reason: null` when the resolution
did not fail.

`CommitFailureReason` and the new `COMMIT_FAILURE_REASONS` include the IAB and
bundled-policy refusals the native cores return, such as
`bundled-policy-expired` and `iab-list-stale`.

Breaking: `CommitIntent` no longer has `categories`. Neither native core ever
honoured it, so `all` or `necessary` with a category list recorded the whole
choice scope. Both native decoders now refuse, as `invalid-intent`, any key
the action does not take: `explicit` takes `action` and `consents`, and `all`
and `necessary` take `action` alone. Use `explicit` to decide a
subset. `ConsentSnapshot.subject` is now `NativeConsentSubject`, without
`identityProvider`, which no native snapshot carries.
