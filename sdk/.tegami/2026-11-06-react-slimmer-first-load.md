---
packages:
  '@c15t/core': patch
  '@c15t/react': patch
  '@c15t/schema': patch
---

### Client-rendered React pages load less than half as much c15t code before they render

When `consentManifest()` puts the static banner in `index.html`,
`ConsentBanner` from `@c15t/react` (and `c15t/react`) loads the stock
banner's code in a chunk of its own, and the client-rendered
`ConsentProvider` loads the code that reads the `/init` answer on demand.
Nothing more loads until the page's `fetchpriority="high"` images have
loaded, or until the visitor taps, presses a key or scrolls. Then the engine
and the banner's code load together, and the engine reads the answer. The
static banner shows meanwhile. A tap on it still hides it at once; the small chunk that
reads the answer loads first, and the choice is recorded as soon as it
arrives. Without a static banner, the provider loads that code right after
the first render, while `/init` is still in flight.

On CookieBench's React page with the mobile profile, c15t's first-load
JavaScript drops from 39.5 KB to 15.4 KB after Brotli, and LCP over the
control page drops from +232 ms to +116 ms. The page's own bundle, and so
its hero image, no longer wait for the rest.

An Accept or Reject tapped on the banner while the deferred engine
downloads now commits at once instead of waiting for the engine.

Every other build, including server rendering, Next.js and builds with
`staticBanner: false`, keeps `ConsentBanner` in the page's own JavaScript.

`@c15t/core/runtime/deferred-boot` holds the part of
`@c15t/core/runtime/deferred-snapshot` a first render needs (internal).
`@c15t/schema` keeps the policy contract version and header in a module of
their own, so the first `/init` request no longer carries the wire reader.
