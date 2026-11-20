---
packages:
  "group:inth": patch
---

### Generate Inth names in `inth c15t setup`

`inth c15t setup` now writes the names the `@inth` packages read: `inth.config.ts`, `inth()` in Astro, `inthVue`, `inthHandle`, `src/inth.client.ts`, `/api/inth`, `inth.js`, `#inth-preferences` and `data-inth-category`. Apps it set up before got the c15t names, which the `@inth` packages don't read.

On a page that still loads `c15t.js` or links to `#c15t-preferences`, setup adds no second copy and asks you to update the old snippet instead. In a Next.js app that already has `inth.config.mts`, `.js` or `.mjs`, setup uses that file instead of adding an `inth.config.ts` that would replace it.
