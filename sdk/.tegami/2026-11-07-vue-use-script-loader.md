---
packages:
  'c15t': minor
  '@c15t/vue': minor
---

## `useScriptLoader()` for Vue and Nuxt

Vue and Nuxt apps can now register vendor scripts from a component, for a
script the app decides at runtime, such as a tenant's tag or one a route
needs. `useScriptLoader(scripts)` adds them to the app's one script loader,
next to the plugin's `scripts` option, so they never load twice, and removes
them when the component unmounts. It takes a ref or getter and reconciles on
change, and returns `updateScripts()` and `dispose()`. The Nuxt module
auto-imports it; Vue apps import it from `c15t/vue/vue-plugin`. React,
Next.js and TanStack Start already had the hook of the same name.

Under the Nuxt module's deferred first load, a registered script that may
run now loads the consent engine at once, and an Accept tapped before the
engine starts the plain entries it allows without waiting for it, as
`app.config.ts` scripts do.
