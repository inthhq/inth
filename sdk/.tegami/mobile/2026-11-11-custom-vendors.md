---
packages:
  'swift:c15t-swift': minor
  'maven:c15t-android': minor
---

### List custom IAB vendors and store their consent, as the web does

Under an IAB TCF policy, the custom vendors you configure now reach the app
with the vendor list. The stock TCF screens list them on a Custom Partners page,
apart from IAB partners, with their own consent and legitimate-interest
switches. Accept all grants them and Reject all withdraws their consent.

Their choices are stored with the native decision and restored on the next
launch. They never go in the TC String, which only names IAB vendors. Check one
with `isCustomVendorAllowed(id)`, and list them with `iabCustomVendors()`.

Their purposes now count when native works out which TCF purposes decide a
c15t category, as on the web. Read the result with `iabPurposeCategories()`.
On iOS, a consented custom vendor that uses a marketing purpose now counts
for the App Tracking Transparency prompt, and refusing it counts as a refusal.

`IABChoices` (`IabChoices` on Android) has two new lists,
`customVendorConsents` and `customVendorLegitimateInterests`, keyed by the
vendor's id as a string.
