# Inth × Nuxt example

Inth Nuxt integration through the `@inth/nuxt` module. The consent setup is a module entry in a Nuxt layer under
`config/`, `InthProvider` and `ConsentDialogLink` in `app/app.vue`, and
`scripts` in `app/app.config.ts`. Without a backend URL the demo uses the
`https://your-project.inth.app` placeholder; set `NUXT_PUBLIC_INTH_PROJECT_URL`
to your Inth backend URL to run it by hand.

```bash
pnpm install
bun turbo run build --filter='./packages/sdk/*'
bun run --cwd internals/fixtures/nuxt dev
```

`manifest()` enables same-origin, CDN-cacheable consent resolution — the
module's consent route fetches the backend's manifest once, caches it,
and resolves `/api/inth/v1/consent/init` locally from geo/language/GPC headers with no
consent-backend round trip on the request path. The banner is server-rendered into
the first HTML with zero CLS; live state is read via auto-imported
composables (`useConsentActiveUI`, `useHasConsent`, `useConsentInit`).

Try the region preview from the page itself, or by hand — `?country=DE`
resolves GDPR/opt-in with a banner, `?country=US&region=CA` resolves
CCPA/opt-out with no banner at all. The resolved jurisdiction, policy pack and
surface are shown on the page so you can see the manifest re-resolve.

## Backend

The demo shell in `nuxt.config.ts` sets `projectUrl` from
`NUXT_PUBLIC_INTH_PROJECT_URL`, or the placeholder when it is unset,
overriding the placeholder in the `config/` layers. The acceptance suite sets
`NUXT_PUBLIC_INTH_PROJECT_URL` to point the demo at its mock backend.

## Consent example

Open `/consent-example` for the shared integration scenario. The existing home
and showcase routes remain available.

`/prerendered/consent-example` is the same page prerendered at build time, and
`/cached/consent-example` is the same page cached by Nitro (`swr`). Every
visitor gets the same HTML there, so it renders without the banner and the
browser resolves the visitor's policy and stored choice after hydration. Set
`INTH_NUXT_MANIFEST=client` at build time to run the demo in client manifest
mode.

For hosted operation, create an [Inth](https://inth.com) project, configure an
opt-in policy covering `measurement` and `marketing`, and allow this app's
origin. Set `NUXT_PUBLIC_INTH_PROJECT_URL` to the backend URL supplied by Inth,
or copy the layer config into your own app and replace
`https://your-project.inth.app` there. Then run from the repository root:

```sh
bun run --cwd internals/fixtures/nuxt dev
```

Replace the vendor placeholders in `app/consent-scripts.ts`:

- `phc_your_project_key`: PostHog browser project key. The example selects the
  EU region; change `region` for a US project.
- `your-pixel-id`: X Pixel ID, not a conversion event ID.

PostHog uses `loadMode: 'after-consent'` and `cookieless_mode: 'never'`. X Pixel waits for marketing permission. Remove
other initializers for these vendors before reusing the example.

The YouTube nocookie iframe in `app/components/video-embed.vue` only mounts with
measurement permission and is removed on revocation. The placeholder opens
preferences. Use the footer's Privacy settings control to reopen the dialog.
Default theme and Branded theme buttons demonstrate CSS token overrides
without replacing the consent runtime.

Test a fresh rejection, grant, reload and withdrawal. Confirm PostHog and X
requests are absent before their respective permissions, and the iframe is
absent before measurement permission. Script removal cannot undo SDK code that
already ran; application event calls must also stop after withdrawal.

## Banner experiment

Module config is static, so the banner-shape experiment is switched on at
build time. Run `INTH_NUXT_EXPERIMENT=1 bun run --cwd internals/fixtures/nuxt dev` and
open `/consent-example`: Inth picks the `control` arm (the default banner) or
the `wall` arm, and the page shows `banner-shape · <arm> · inth` with a
`inth_surface_shown` and `inth_choice_recorded` line for each impression and
choice under the arm. `app/components/experiment-readout.vue` reads them from the
kernel's `surface:shown` and `choice:recorded` events and pushes the same
events to `window.dataLayer`. Add `INTH_NUXT_EXPERIMENT_ARM=wall` to set the
arm the way a flag provider would; any other value runs `control`. Both
variables work with `bun run build` and `bun run generate` too. They are not
`NUXT_PUBLIC_*` names because Nitro applies those at runtime over
`runtimeConfig.public.inth`. See
`packages/sdk/docs/guides/banner-experiments.mdx`.

## Layout

- `config/server/nuxt.config.ts`: the module with `manifest()`, read at
  runtime.
- `config/static/nuxt.config.ts`: `ssr: false` with
  `manifest({ resolve: 'browser' })` and no consent route,
  used when `INTH_NUXT_OUTPUT=static`. Build it with `bun run generate` and
  serve it with `bun run preview:static`.
- `app/app.config.ts` and `app/consent-scripts.ts`: vendor scripts.
- `nuxt.config.ts`, `app/pages/`, `app/components/consent-debug-tools.vue` and
  `app/components/experiment-readout.vue`: demo shell, region preview,
  development DevTools and the banner experiment.

`EXAMPLE_TARGET=nuxt,nuxt-static bun run --cwd internals/fixtures/acceptance test` runs both
builds through the acceptance journeys.
