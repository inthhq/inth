---
packages:
  'c15t': minor
  '@c15t/tanstack-start': minor
---

### Load ConsentRoot's consent engine after the page on TanStack Start

`ConsentRoot` in `c15t/tanstack-start` no longer puts the consent engine in
the page's first-load JavaScript. The server still renders the banner, its
styles and the scripts it starts into the first HTML, so the banner shows at
first paint as before.

In the browser the page under `ConsentRoot` hydrates at once. c15t's hooks
return the server's consent state until the engine loads, and their actions
run when it arrives. For a visitor the banner asks to choose, the engine loads
after the page's `fetchpriority="high"` images, or at the first input or
scroll. A visitor the engine must serve at once, such as one with stored
consent, gets it as the first-load chunk runs.

An Accept or Reject tapped before the engine loads takes effect in the tap's
own task, as on Next.js. `ConsentBanner` and `ConsentDialog` load their code
with the engine.

On the CookieBench TanStack Start page the JavaScript and HTML the page loads
first drop from about 82 KB to about 20 KB after Brotli, over the page without
c15t. A prerendered page, the static root's `{}`, `options.experiment`, a
`networkBlocker`, `enabled: false` and IAB still render the engine before
hydration.

With `consentManifest()` in `vite.config.ts`, the browser bundle no longer
carries a second copy of the banner's inline styles.
