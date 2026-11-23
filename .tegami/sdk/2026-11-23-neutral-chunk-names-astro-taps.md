---
packages:
  "group:sdk": patch
---

### Neutral file names for the parts that load on demand, and Astro early taps

- **Content blockers no longer stop the Banner container from loading.** The consent prompt loads its Card, Banner or Drawer on demand, and your bundler names each file after the module it loads. The Banner's module was named `banner`, so its file was `banner-<hash>.js`, which content blockers drop. It is now named `strip` in React, Next.js, TanStack Start, Vue, Angular, the `@inth/sdk` ES module build and Astro. The stylesheets that load on demand (`@inth/sdk/ui/styles/sheets/banner-deferred` and `consent-gate-deferred`) now load files named `strip` and `gate`. Rebuild your app to get the new names.
- **Angular:** the flat bundles of `@inth/angular/consent-dialog` and `@inth/angular/consent-dialog-trigger` are now `inth-angular-dialog-host.mjs` and `inth-angular-dialog-trigger.mjs`, because the files they load on demand take their names. The import paths stay the same.
- **Astro: a tap before the prompt is ready is kept.** The server-rendered prompt now holds an accept, reject, OK or Customize tap until its code loads, then replays it through the prompt: a choice commits through the prompt, and Customize opens the options in place. A tap made under a policy that no longer applies is dropped, and the prompt shows again. If the code fails to load, the prompt shows again.
- **Astro: the consent engine waits for the page again** for a visitor who still has to choose, when nothing needs it at once. It loads after the page's priority images, on the first input or scroll, when the visitor presses one of the prompt's buttons, or after 10 seconds.
- **Astro: the Svelte and Vue dialog islands link no stylesheet for the preferences dialog.** They render with the sheets the client puts in, and each confirmation brings its own. The IAB dialog still links its rules when it opens.
- **Astro: the Svelte dialog island loads with the dialog's code**, so opening the dialog takes one download instead of two.
