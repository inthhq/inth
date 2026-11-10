---
packages:
  '@c15t/react-native': minor
---

### Build your own IAB screens in React Native

A TCF policy no longer needs the stock native screens. The hooks
`@c15t/react` exports for IAB now exist in React Native: `useIAB()` stages
purpose, vendor, legitimate-interest and special-feature choices,
`usePurposeConsent`, `useVendorConsent` and `useSpecialFeatureOptIn` read the
staged selection, `useTCString()` reads the committed TC String, and
`useIABSnapshot()` and `useIABEnabled()` read the served vendor list and
whether the policy is TCF.

`useIAB().save()`, `useConsentDraft().save()` and `useSaveConsents()()` send
the selection to the native engine as one commit, pinned to the snapshot
revision it was made against. The engine validates it, encodes the TC String
and writes the `IABTCF_*` keys exactly as for the stock screens. The snapshot's
`iab` object now carries `committed`: the TC String, the Additional Consent
string and the committed choices, or `null`.
