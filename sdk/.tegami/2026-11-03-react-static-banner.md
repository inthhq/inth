---
packages:
  '@c15t/core': patch
  '@c15t/react': patch
---

### Client-rendered React pages show the banner from `index.html`

`vite build` with `consentManifest()` now puts the stock banner in
`index.html`, hidden. The build renders it from the manifest's first choice
policy. The inline `/init` script shows it when the answer names the same
policy, language, branding and banner copy, and the visitor has no stored
choice. The banner then appears as soon as `/init` answers, without waiting
for the app's JavaScript. `<ConsentBanner />` replaces it in the same frame
when it renders, without a second entry animation. A tap on the static banner
before then hides it. The client root records the choice when it mounts and
removes the static banner, so it stays gone even though `<ConsentBanner />`
never shows.

The banner's stylesheets move from the JavaScript bundle into `index.html` on
pages whose entry imports `ConsentBanner`. They no longer ship twice.

On CookieBench's React page with the mobile profile, the banner shows at
about 470 ms instead of about 1,070 ms. The page loads about the same number
of bytes before its hero image (+0.6 KB), and LCP is about 30 ms lower.

Only production builds whose `index.html` gets the `/init` script do this.
Turn it off with `consentManifest({ staticBanner: false })` when the app's
banner differs from the stock one on its first render: custom `i18n`
messages, `legalLinks`, a `theme`, `components` slots, banner props, or a
banner of its own. A failed manifest fetch leaves the banner out with a
warning and never fails the build. `@c15t/react/static-banner` is the
build-time renderer the plugin uses.
