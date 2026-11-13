---
packages:
  '@c15t/iab': patch
  '@c15t/react': patch
  '@c15t/vue': patch
  '@c15t/svelte': patch
  '@c15t/browser': patch
  '@c15t/dev-tools': patch
  '@c15t/schema': patch
---

### Never signal legitimate interest for consent-only purposes

TCF allows purposes 1, 3, 4, 5 and 6 only with consent. A custom vendor that
listed one of them in `legIntPurposes` used to turn it into a legitimate
interest signal. After Accept All, `__tcfapi` reported legitimate interest for
those purposes until c15t's state next changed, for example when the preference
center opened, or until a reload. The IAB CMP Validator's check 9 reads that
report, so it failed. The TC string never carried those bits.

Accept All and `setPurposeLegitimateInterest` now skip those purposes. The
preference center no longer offers an objection for them. For a custom vendor
whose only legitimate interest purposes are consent-only, Accept All and
`setVendorLegitimateInterest` set no vendor legitimate interest signal, and a
saved choice from an earlier release loses it on restore. Declare those
purposes in `purposes` instead.

The `NonIABVendor.legIntPurposes` description in `@c15t/schema` now states
this rule.
