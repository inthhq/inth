# JavaScript consent example

Pages built with Vite, no framework:

- `/` starts the stock banner and preferences from `@inth/sdk` with
  `init()`. `/branded/` is the same page with theme tokens.
- `/headless/` renders its own HTML on `createConsentRuntime` from
  `@inth/sdk/runtime`. `/headless/?design=branded` restyles it with CSS.
- `/experiment/` is the stock page running a banner experiment. See
  [Banner experiment](#banner-experiment).

All of them register PostHog and X Pixel with `@inth/integrations`, gate a
YouTube video on measurement and keep a Privacy settings control on the page.

From the repository root, install and build workspace packages first:

```sh
pnpm install
bun turbo run build --filter='./packages/sdk/*'
```

Replace `https://your-project.inth.app` in `src/main.ts`, `src/branded.ts`,
`src/experiment.ts` and `src/consent-runtime.ts` with your Inth backend URL, and allow this app's
origin in Inth. Replace the PostHog project key and X Pixel ID in
`src/scripts.ts`. Then run:

```sh
bun run --cwd internals/fixtures/javascript dev
```

PostHog uses `loadMode: 'after-consent'`, so its SDK waits for measurement
permission. X Pixel waits for marketing permission. Revoking a permission
reloads the page, so code that already ran is gone.

Reject, reload, reopen preferences and allow measurement only. The video and
PostHog should load while X Pixel stays blocked. Then allow marketing. Test
revocation and a failed backend request as well. The shared acceptance suite
runs `/` and `/headless/` with a fixture backend and intercepted vendor requests. It
sets `VITE_INTH_PROJECT_URL`, which `src/test-backend.ts` applies over the
placeholder URL:

```sh
EXAMPLE_TARGET=javascript bun run --cwd internals/fixtures/acceptance test
```

DevTools mounts only in development.

## Banner experiment

Open `/experiment/` to run the banner-shape experiment: Inth picks the
`control` arm (the default banner) or the `wall` arm, and the page shows
`banner-shape · <arm> · inth` with a `inth_surface_shown` and
`inth_choice_recorded` line for each impression and choice under the arm.
Open `/experiment/?arm=wall` to set the arm the way a flag provider would
(`assignedBy: host`); any other `arm` value runs `control`.
`src/experiment.ts` passes the experiment to `init()` and logs the
`onSurfaceShown` and `onChoiceRecorded` callbacks to the page and to
`window.dataLayer`. See `packages/sdk/docs/guides/banner-experiments.mdx`.
