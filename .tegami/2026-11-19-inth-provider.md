---
packages:
  "group:inth": patch
---

### Generate `InthProvider` as the root in `inth c15t setup`

The Next.js, React, TanStack Start, Svelte, SvelteKit, Vue and Nuxt files that `inth c15t setup` writes now render `InthProvider` at the top of the app, the root's new name in every Inth web package. A SvelteKit layout imports it from `@inth/svelte/kit`. The setup instructions use the same name.
