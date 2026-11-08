---
packages:
  '@c15t/vue': patch
---

### Nuxt 4.6: no render-blocking link for the banner's legal-links stylesheet

Nuxt 4.6 bundles the banner's legal links into the banner's own chunk. On a
page whose banner renders without legal links, Nuxt inlined nothing for them
and wrote a render-blocking `<link rel="stylesheet">` for their stylesheet
ahead of the first paint. The module now turns that link into a preload, as
it already did for stylesheets in the chunks c15t's components share. A
banner that does render legal links still gets their rules inlined, and Nuxt
writes no hint for an inlined file.
