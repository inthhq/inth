---
packages:
  'maven:c15t-android': patch
---

### Point coding agents at the Android guides

The sources jar of `c15t-core`, `c15t-android` and `c15t-consent-ui` now has an
`AGENTS.md` at its root, and the same notes are the overview page of each
module's API docs. They say where the Android guides are while the SDK is a
private prerelease, and list the rules an integration keeps: one engine,
installed in `Application.onCreate`, SDKs gated on `GRANTED` with a retained
subscription, and a Privacy settings action that stays reachable.
