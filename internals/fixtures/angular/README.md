# Angular consent example

A runnable Inth setup on Angular 22 with server rendering, PostHog, X Pixel,
a consent-gated YouTube video, a persistent preferences control and DevTools.
Choose **Default** or **Branded** to compare the same consent flow with
different styling, or **Headless** for consent UI built on `HeadlessConsent`.

From the repository root, install and build workspace packages first:

```sh
pnpm install
bun turbo run build --filter='./packages/sdk/*'
```

Set `INTH_PROJECT_URL` to your Inth backend URL, or replace the placeholder in
`src/consent.server.ts`. The server's consent route at `/api/inth` reads the
backend's manifest and forwards saves, so the browser only talks to this app.
Replace the placeholder PostHog project key and X Pixel ID in `src/scripts.ts`.
Then build and run:

```sh
bun run --cwd internals/fixtures/angular build
INTH_PROJECT_URL=https://your-project.inth.app bun run --cwd internals/fixtures/angular start
```

`provideInthServer()` resolves each visitor's consent before the render, so the
banner is in the first HTML for a visitor who owes a choice and absent for one
who made it. A tap on that banner before Angular hydrates is held by a small
inline script and recorded once the banner hydrates.

PostHog uses `loadMode: 'after-consent'`, so its SDK waits for measurement
permission. X Pixel waits for marketing permission. Revoking permission removes
the YouTube iframe. Removing a vendor script cannot undo code it has already
executed.

The shared acceptance suite runs this app with a fixture backend and
intercepted vendor requests:

```sh
EXAMPLE_TARGET=angular bun run --cwd internals/fixtures/acceptance test
```

This is a test app. The docs quote `internals/doc-snippets/angular` instead.
`src/app/example-page.ts` holds the demo content and DevTools.
`src/app/home-page.ts` uses the stock banner and dialog, and
`src/app/headless-page.ts` builds its own at `/headless`. The Branded link sets
`data-design="branded"` on `<html>`, which turns on the token overrides at the
end of `src/style.css`. `angular.json` allows the `127.0.0.1` and `localhost`
hosts for server rendering; add yours to `security.allowedHosts` to serve the
app under another name.

## Banner experiment

Open `/?experiment=1` to run the banner-shape experiment: Inth picks the
`control` arm (the default banner) or the `wall` arm, and the page shows
`banner-shape · <arm> · inth`. Open `/?experiment=1&arm=wall` to set the arm
the way a flag provider would (`assignedBy: host`); any other `arm` value runs
`control`. `provideExperimentFromURL()` in `src/app/experiment.ts` adds
`experiment` and the `onSurfaceShown` and `onChoiceRecorded` callbacks to the
options for these URLs. Each impression and choice under the arm is listed on
the page and pushed to `window.dataLayer` as `inth_surface_shown` and
`inth_choice_recorded` with `experiment_id` and `arm`.
See `packages/sdk/docs/guides/banner-experiments.mdx`.
