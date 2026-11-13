---
packages:
  'swift:c15t-swift': patch
  'maven:c15t-android': patch
---

### Removing every custom IAB vendor now clears them on the device

When a publisher removed their last custom vendor, the app kept showing it,
kept its stored grant, and counted its purposes, because `/init` then leaves
`customVendors` out and the core read a missing key as "keep the list you
hold". A live `/init` for a matched IAB policy without the key now clears the
list and the grants that go with it. Answers for other policies still keep the
list, and a bundled manifest without the key keeps it too.
