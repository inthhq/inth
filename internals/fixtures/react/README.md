# React consent example

A runnable Inth setup with PostHog, X Pixel, a consent-gated YouTube video,
a persistent preferences control and DevTools in development. Choose **Default** or **Branded**
to compare the same consent flow with different styling.

From the repository root, install and build workspace packages first:

```sh
pnpm install
bun turbo run build --filter='./packages/sdk/*'
```

Replace `https://your-project.inth.app` in `src/consent.tsx` and
`src/experiment-consent.tsx` with your Inth backend URL and allow this app's origin in Inth. Replace the PostHog project
key and X Pixel ID placeholders in `src/scripts.ts` with your own. Then run:

```sh
bun run --cwd internals/fixtures/react dev
```

PostHog uses `loadMode: 'after-consent'`, so its SDK waits for measurement
permission. X Pixel waits for marketing permission. Revoking permission removes
the YouTube iframe. Removing a vendor script cannot undo code it has already
executed.

Reject, reload, reopen preferences and allow measurement only. The video and
PostHog should load while X Pixel stays blocked. Then allow marketing. Test
revocation and a failed backend request as well. The shared acceptance suite
runs these examples with a fixture backend and intercepted vendor requests.
It sets `VITE_INTH_PROJECT_URL`, which `src/test-backend.ts` applies over the
placeholder URL:

```sh
EXAMPLE_TARGET=react bun run --cwd internals/fixtures/acceptance test
```

`src/consent.tsx`, `src/main.tsx` and `src/scripts.ts` hold the Inth setup.
`src/app.tsx` is the demo page: status, gated video, design switch and
DevTools in development.

## Banner experiment

`experiment.html` mounts the same page inside `src/experiment-consent.tsx`,
the `Consent` wrapper with the banner-shape experiment added. Open `/experiment.html` and Inth picks the
`control` arm (the default banner) or the `wall` arm; the page shows
`banner-shape · <arm> · inth`. `?arm=wall` or `?arm=control` sets the arm the
way a flag provider would (`assignedBy: host`), and `?arm=off` leaves the
visitor out. The provider's `onSurfaceShown` and `onChoiceRecorded` callbacks
push each impression and choice under the arm to `window.dataLayer` as
`inth_surface_shown` and `inth_choice_recorded`, and the page lists them. See
`packages/sdk/docs/guides/banner-experiments.mdx`.
