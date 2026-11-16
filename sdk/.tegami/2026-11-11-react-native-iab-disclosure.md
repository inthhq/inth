---
packages:
  '@c15t/react-native': minor
---

### Build your own IAB screens with publisher restrictions and Additional Consent providers

Headless IAB screens in React Native now work when the publisher restricts
vendors' purposes or lists Google Additional Consent providers. The snapshot's
`iab` object carries `disclosure`, the native disclosure the stock screens draw:
each vendor's legal bases after publisher restrictions, the purposes a
restriction removed or moved between consent and legitimate interest, the
Additional Consent providers with their privacy policies, partner counts per
purpose, and the first-layer summary. `useAdTechProviderConsent(id)` reads a
provider's staged switch, and `useIAB().setAdTechProviderConsent()` sets it.

The native engine writes the same TC String and Additional Consent string for a
headless selection as for the stock screens. It refuses a selection that grants
a vendor consent or legitimate interest the publisher's restrictions took away,
with `invalid-iab-choices`. `iab.headlessUnsupported` is now always empty; a
binary built before this release still names those configurations there, and
`useIAB()` returns `null` for it.
