---
packages:
  "group:sdk": patch
---

### Vue and Nuxt: the dialog is `ConsentDialog`, and the IAB surfaces read `scrollLock`

Vue and Nuxt now use the same names for the "Your Privacy Choices" dialog as React, Svelte and the kernel.

| Removed | Use instead |
| --- | --- |
| `activeUI` value `'manager'` (`useConsentActiveUI()`, the `ConsentActiveUI` type) | `'dialog'` |
| `ConsentManager` from `@inth/vue` and `@inth/vue/vue-plugin` | `ConsentDialog` |
| `@inth/vue/runtime/components/consent-manager.vue` | `@inth/vue/runtime/components/consent-dialog.vue` |
| `@inth/nuxt/components/consent-manager` | `@inth/nuxt/components/consent-dialog` |

`null` still means no surface is open. The docs pages moved from `components/consent-manager` to `components/consent-dialog`.

`IABConsentBanner` and `IABConsentDialog` take `scrollLock` and `trapFocus` props, and the plugin and module options take `scrollLock` next to `trapFocus`. They used to read only the options' `trapFocus` and the presentation, so `scrollLock` did nothing. They now resolve blocking as React does: an explicit `presentation.prompt.blockUntilChoice` or `presentation.preferences.blocking` wins, then the component's own props, then the options. `false` in either `scrollLock` or `trapFocus` turns blocking off.
