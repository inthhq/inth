---
packages:
  "group:inth": patch
---

### Generate code that the Inth SDK packages run in `inth c15t setup`

Some files `inth c15t setup` wrote used names from c15t that the Inth packages no longer read or export. A SvelteKit app now gets `inthHandle` in `src/hooks.server.ts`, a Vue app `inthVue` in `src/main.ts`, and a Nuxt app its vendor settings under `inth` in `app/app.config.ts`. A Next.js app gets `inth.config.ts`, the file `withConsentManifest` reads, and an Astro app with vendors gets `src/inth.client.ts` typed with `InthClientOptionsExtension`.
