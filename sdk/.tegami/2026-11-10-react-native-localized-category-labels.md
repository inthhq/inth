---
packages:
  '@c15t/react-native': patch
---

### Show the native category screens in the policy's language

The iOS presenter that `@c15t/react-native` bundles now reads every
category-mode label from `@c15t/translations`, in the policy's translation
language, instead of English literals. The wording follows the web banner, so
"Accept all" reads "Accept All". Leave `headline` and `introduction` unset to
keep the translated stock first-layer copy.
