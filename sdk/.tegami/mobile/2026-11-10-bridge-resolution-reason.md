---
packages:
  'maven:c15t-android': patch
---

### Omit a null resolution reason from the bridge snapshot

`SnapshotWire` now writes `resolution.reason` only for a failed resolution,
as `@c15t/core` and the Swift core do, instead of an explicit `null`.
