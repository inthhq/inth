---
packages:
  'swift:c15t-swift': patch
  'maven:c15t-android': patch
---

### Show category-mode screens in the policy's language

The stock consent screens no longer hard-code English outside IAB mode. Every
button, heading, category name and explanation, status note, accessibility
label and save error now comes from `@c15t/translations`, in the policy's
translation language. A German policy shows German buttons.

Buttons, headings and category names reuse the web banner's keys, so the
wording matches the web: "Accept all" is now "Accept All", "Save choices" is
now "Save Settings", "Got it" is now "OK", and the `measurement` category is
called "Analytics". Sentences that only fit an app come from native-only keys.

`ConsentTheme.Copy` now takes optional fields on both platforms. Leave
`headline` or `introduction` unset to show the translated stock copy; a string
you set is shown as given. The stock headline is now the web's "We value your
privacy". On Android, `ProviderBranding` and `HeaderIdentity.resolve` take the
translated label as a parameter.
