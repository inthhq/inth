---
packages:
  'swift:c15t-swift': patch
  'maven:c15t-android': patch
---

### Point coding agents at the Swift and Android guides

The Swift package now ships `native/core-swift/AGENTS.md`. The sources jar of
`c15t-core`, `c15t-android` and `c15t-consent-ui` now has an `AGENTS.md` at its
root, and the same notes are the overview page of each module's API docs.
Both say where the guides are while the SDKs are a private prerelease, and list
the rules an integration keeps: one engine installed at launch, SDKs gated on a
grant with a retained subscription, and a Privacy settings action that stays
reachable.
