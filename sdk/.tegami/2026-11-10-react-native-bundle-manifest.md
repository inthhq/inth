---
packages:
  '@c15t/react-native': minor
---

### Fetch and bundle the policy manifest at prebuild

The Expo plugin's `bundleManifest` option runs `c15t mobile-manifest` from the
app's `@c15t/cli` dev dependency during prebuild and embeds the result in both
native projects, so a first launch with no network still shows the prompt. A
failed fetch fails a release build and warns in a debug build;
`allowStaleManifest` reuses the last fetched copy. Prebuild now embeds an
expired `policyResource` with a warning instead of failing, because devices
keep prompting from it and report `policyStale`.
