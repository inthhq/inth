---
packages:
  '@c15t/react-native': minor
---

### Fetch and bundle the policy manifest at prebuild

The Expo plugin's `bundleManifest` option runs `c15t mobile-manifest` from the
app's `@c15t/cli` dev dependency during prebuild and embeds the result in both
native projects, so a first launch with no network still shows the prompt. A
failed fetch fails a release build and warns in a debug build. Only `expo run:*`
with no variant or configuration, or one whose name contains `debug`, counts as
debug; `--configuration Production` and `--variant production` are release.
`allowStaleManifest` reuses the last fetched copy. Prebuild now embeds an
expired `policyResource` with a warning instead of failing, because devices
keep prompting from it and report `policyStale`.

A debug prebuild that cannot reach the backend removes a manifest an earlier
prebuild embedded, unless `allowStaleManifest` is on. Top-level `vendors` now
narrows the bundled GVL, and a `policyResource` that expires before it was
issued is refused.

Prebuild now refuses a `policyResource` the native SDKs would discard, such as
one without a manifest revision or policy packs, or with a vendor list devices
cannot use, including one with an entry of the wrong type.
