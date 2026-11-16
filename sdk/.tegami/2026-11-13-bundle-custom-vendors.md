---
packages:
  '@c15t/cli': patch
  '@c15t/react-native': patch
---

### Bundled mobile manifests carry custom IAB vendors

`c15t mobile-manifest` now copies the manifest's custom (non-IAB) vendors into
the bundled resource, and the iOS and Android cores read them. Before, an app
whose first launch was offline, or served only by the bundle, showed the TCF
screens without its custom vendors. Accept all then stored no grant for them,
and they stayed denied after the network came back, without a new prompt.

In `@c15t/react-native`, iOS reads them with this release. Android reads them
once the app uses a `c15t-android` release that includes the fix, because the
Android bridge takes the core from Maven.

Re-export the resource after you update the CLI. A resource from an older CLI
still loads and keeps the list the device already holds. On a first launch
that list is empty until a live `/init` answers.
