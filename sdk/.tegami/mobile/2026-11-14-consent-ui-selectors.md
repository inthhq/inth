---
packages:
  'swift:c15t-swift': minor
---

### IAB first-layer identifiers match Android

Two accessibility identifiers on the IAB first layer of `C15tConsentUI` now
use the Android names: `c15t.first-layer.iab-description` is
`c15t.first-layer.description`, and `c15t.first-layer.summary.<index>` is
`c15t.first-layer.summary.item.<index>`. Update UI tests that used the old
names. The other identifiers are unchanged.
