---
packages:
  '@c15t/react-native': patch
---

### Removing every custom IAB vendor now clears them in the app

When a publisher removed their last custom vendor, the app kept showing it and
kept its stored grant. A live `/init` for a matched IAB policy without
`customVendors` now clears them. iOS gets this with this release. Android gets
it once the app uses a `c15t-android` release that includes the fix, because
the Android bridge takes the core from Maven.
