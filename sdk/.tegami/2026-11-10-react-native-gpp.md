---
packages:
  '@c15t/react-native': minor
---

### Read the IAB GPP string in React Native and turn it on from Expo

Set `gpp: true` in the Expo plugin, or pass `{ mspaMode, optOutCategories,
tcf }`, to have the native engine write the IAB GPP string and the `IABGPP_*`
keys ad SDKs read. Bare apps set `com.c15t.gpp` in `Info.plist` and
`com.c15t.GPP` Android metadata.

`useGPPString()` returns the string, or `null` while GPP is off or no section
applies. The snapshot has a new `gppString` key. US visitors under a rule that
offers an opt-out get the US National section; an `iab` rule gets the TCF EU
section once a TC String is committed.
