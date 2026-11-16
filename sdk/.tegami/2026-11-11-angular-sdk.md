---
packages:
  '@c15t/angular': minor
---

### Add the Angular SDK

`@c15t/angular` adds c15t to Angular 20, 21 and 22 apps. Run
`ng add @c15t/angular`, or add `provideC15t()` to `app.config.ts` yourself,
then use the standalone components:
`<c15t-consent-banner>`, `<c15t-consent-dialog>`, `<c15t-consent-widget>`,
`<c15t-consent-dialog-trigger>`, `<c15t-consent-gate>` and the IAB TCF banner
and dialog. They render the same markup and styles as the React, Vue and
Svelte surfaces.

State comes from the injectable `ConsentManager` as signals, so `has()` and
`activeUI()` work in templates and `computed()`. `*c15tIfConsent` shows
content once a category is allowed. `ng-template` slots customize the banner
and gate. The headless primitives are attribute directives, and the switch
works with `ngModel` and reactive forms.

What every page needs (`provideC15t()`, `ConsentManager`, the banner,
`ConsentDialogLink`, `*c15tIfConsent` and the mode factories) comes from
`@c15t/angular`. The rest has an entry point of its own, as in
`@c15t/react`: `@c15t/angular/consent-dialog`, `/consent-widget`,
`/consent-dialog-trigger`, `/consent-root`, `/consent-gate`, `/primitives`
and `/iab`. The dialog's body loads with its `@defer` block, and the consent
engine loads in a chunk of its own after the page's largest image, so the
first load carries the banner and little else.

`@c15t/angular/ssr` resolves consent on the server, hands it to the browser
through `TransferState`, and serves the consent route for `@angular/ssr`.
`@c15t/angular/devtools` adds the DevTools panel. `@c15t/angular/testing`
has Angular CDK component harnesses for each consent surface, for TestBed
tests. Scripts, the network
blocker, persistence, GPP and Content Security Policy nonces work through
`provideC15t()` options. With an `ngCspNonce` attribute, no nonce option is
needed.
