---
packages:
  "group:inth": patch
---

### Generate code that the Inth SDK packages run in `inth c15t setup`

Some files `inth c15t setup` wrote used names from c15t that the Inth packages no longer read or export. A SvelteKit app now gets `inthHandle` in `src/hooks.server.ts`, a Vue app `inthVue` in `src/main.ts`, and a Nuxt app its vendor settings under `inth` in `app/app.config.ts`. A Next.js app gets `inth.config.ts`, the file `withConsentManifest` reads, and an Astro app with vendors gets `src/inth.client.ts` typed with `InthClientOptionsExtension`.

A Next.js Pages Router app gets its consent route at `pages/api/inth/[...inth].ts`, the name `createPagesConsentRoute()` reads. If an earlier setup wrote `pages/api/c15t/[...c15t].ts`, delete it after running setup again. A JavaScript app's privacy link now points at `#inth-preferences`, the hash the SDK opens. If the page already has a link to `#c15t-preferences`, change it or remove it, because setup adds the new link beside it.
