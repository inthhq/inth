---
packages:
  '@c15t/core': patch
  '@c15t/vue': patch
  '@c15t/tanstack-start': patch
---

### The preference dialog opens in fewer files on Vite 8

In a Vite 8 (Rolldown) browser build, `consentManifest()` and the Nuxt module
give the stock preference dialog's on-demand code a few files of their own.
Before, Rolldown split it into one small chunk per set of importers, and a
Customize tap before the consent engine loaded fetched 17 to 24 of them. Over
HTTP/1.1 a browser opens six connections per host, so they arrived in waves,
a round trip each.

Each file holds code that the same loaders need, so the engine and an Accept
or Reject before it fetch none of the dialog. Only modules the page does not
load up front move, so the page's first load is unchanged. Rollup (Vite 7
and earlier), server builds and apps that set `manualChunks`,
`advancedChunks` or turn code splitting off are left alone; groups the app
sets in `codeSplitting` come first.

On the consent gate's mobile profile, Customize before the engine went from
775 ms to 658 ms on Nuxt and from 1,119 ms to 757 ms on TanStack Start, with
the first load, the banner and the accept path unchanged.
