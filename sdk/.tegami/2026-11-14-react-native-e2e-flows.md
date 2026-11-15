---
packages:
  '@c15t/react-native': minor
---

### Get through the consent prompt in your E2E tests

`@c15t/react-native` now ships Maestro subflows in `maestro/` that answer the
native consent prompt: `dismiss-if-shown.yaml` for the start of every test,
plus `accept-all.yaml`, `reject-all.yaml`, `open-preferences.yaml`,
`toggle-category.yaml`, `save-preferences.yaml` and `close-preferences.yaml`.
Call them with `runFlow: ../node_modules/@c15t/react-native/maestro/<flow>.yaml`.

The selectors on the stock iOS and Android consent screens are now a
documented contract, listed in `maestro/selectors.json` and on the new
[E2E testing](https://c15t.com/docs/frameworks/react-native/e2e-testing) page,
with an EAS Workflows example. Two iOS IAB first-layer identifiers now match
Android: `c15t.first-layer.iab-description` is `c15t.first-layer.description`,
and `c15t.first-layer.summary.<index>` is `c15t.first-layer.summary.item.<index>`.
Update UI tests that used the old iOS names.
