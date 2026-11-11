---
packages:
  '@c15t/react-native': minor
---

### Show and save custom IAB vendors from a headless screen

`useIABSnapshot()?.customVendors` lists the custom vendors in your IAB
policy. Pass a custom vendor's `id` to `useIAB()`'s `setVendorConsent` and
`setVendorLegitimateInterest`, or to `useVendorConsent`, as `@c15t/react`
takes it. The staged choices are in `customVendorConsents` and
`customVendorLegitimateInterests`, and `acceptAll()` and `rejectAll()` cover
them. The stock native screens list them too.

A binary built before this release sends no custom vendors, which reads as an
empty list.
