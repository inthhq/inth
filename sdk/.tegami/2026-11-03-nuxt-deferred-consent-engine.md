---
packages:
  'c15t': minor
  '@c15t/core': minor
  '@c15t/vue': minor
---

### Nuxt: load the consent engine after the page

The Nuxt module no longer puts the consent engine in the page's first-load
JavaScript for a visitor the server render asks to choose. The server still
renders the banner, its styles and the early-tap script into the first HTML,
so the banner shows at first paint as before.

In the browser the app hydrates from the consent state the server rendered
with. Composables return it at once. The engine, which brings the stock
banner's code, loads after the page's `fetchpriority="high"` images, at the
first pointer press, key press or scroll outside the banner, when page code
needs it, or after 10 seconds. On the CookieBench Nuxt article page this
removed about 65 KB of compressed JavaScript and CSS preloads that loaded
before the page's largest image.

An Accept all or Reject all tapped before the engine loads takes effect in the
tap's own task: the consent state changes and script loaders on the provided
kernel start the scripts the choice allows. c15t then stores the record,
queues the save and calls `onChoiceRecorded` and `onPermissionsChanged`. The
engine loads next, starts from the record and sends the save without
recording it again. Customize opens the dialog without the engine, and a save
from the dialog takes the same path.

Returning visitors, notice prompts, privacy signals, IAB, experiments,
`consentSource`, `gpp`, `networkBlocker` and `scripts` entries that may run at
once load the engine as the app starts, and the server render preloads it.
The stock banner's chunks, which the app hydrates without, are preloaded at low
priority, so they download behind the page's own images. Prerendered, cached
and `ssr: false` routes also load the engine as the app starts.

`@c15t/core/surface-actions/instant-commit` is a new internal entry that
computes the snapshot a banner or dialog save commits, without the kernel.

The c15t code that the first load still runs now goes into one chunk. Before,
the page loaded one small chunk for each module it shared with the engine.
On a Rolldown build (Vite 8), the module adds this chunk group to the client
build. An app that sets its own `codeSplitting`, `advancedChunks` or
`manualChunks` keeps its own chunking. The first load also no longer carries
the theme-slot and experiment code, and it no longer prefetches the policy
actions. A page that hydrates server HTML keeps the server's
`c15t-css-vars` tag. The browser rewrites the tag only when the config changes
at runtime. On the CookieBench Nuxt article page, the page now loads 13
requests before its largest image instead of 26, and 14 KB less.
