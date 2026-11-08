---
packages:
  '@c15t/ui': patch
  '@c15t/react': patch
  '@c15t/nextjs': patch
---

### Inline only the banner's styles on a first visit

A server-rendered `ConsentBanner` now puts only the tokens, button and banner
rules in the HTML, instead of the whole first-paint sheet with the trigger,
ConsentGate and dialog-only variables. On the CookieBench Next.js page the
HTML is about 2.3 KB smaller after Brotli and the hero image starts about
17 KB earlier in the document. The banner looks the same.

The React surfaces render new sheet ids: `c15t-tokens`, `c15t-button`,
`c15t-banner`, `c15t-trigger` and `c15t-consent-gate`. The dialog sheet now
carries the variables it reads. IAB banners, Svelte and Astro keep the
`c15t-first-paint` sheet.
