# Inth × TanStack Start example

A TanStack Start app wired to Inth through `@inth/tanstack-start`. The files that set it up:

- `src/start.ts` registers `consentRequestMiddleware()`, so every server
  request reads one normalized set of geo, language and GPC headers.
- `src/routes/__root.tsx` declares `getConsentState` with
  `createServerFn().handler(createConsentStateHandler({ projectUrl }))`. The
  root loader awaits it on the server, so the banner is in the first HTML.
  `InthProvider` reads the result, which carries the backend URL, with
  `Route.useLoaderData()` and calls the backend directly from the browser.
- `src/scripts.ts` registers PostHog and X Pixel.
- `src/routes/api/inth/$.ts` mounts
  `createConsentRoute({ projectUrl, proxy: true })` for the same-origin
  rendering variant.

```bash
pnpm install
bun turbo run build --filter='./packages/sdk/*'
cd internals/fixtures/tanstack-start
bun run dev        # http://localhost:3010
```

The app uses the `https://your-project.inth.app` placeholder written in the
root routes and the consent server route. Point it at your project as
described in [Pointing at a hosted backend](#pointing-at-a-hosted-backend).

## Rendering variants

`src/rendering` holds alternative root routes. `INTH_TANSTACK_RENDERING`
selects one at build time; the pages stay the same.

| Value | Root route | What changes |
| --- | --- | --- |
| unset | `src/routes/__root.tsx` | The loader awaits consent; the banner is in the server HTML |
| `streamed` | `src/rendering/streamed-root.tsx` | The loader returns the pending consent state; the banner mounts after hydration |
| `same-origin` | `src/rendering/same-origin-root.tsx` | The browser sends init and saves to `/api/inth` on this origin |
| `static` | `src/rendering/static-root.tsx` | Every page is prerendered; the browser resolves consent |

```bash
INTH_TANSTACK_RENDERING=static bun run build
bun run start:static   # serves dist/client only, like a static host
```

## Banner experiment

`INTH_EXPERIMENT=1` swaps in `src/experiment-root.tsx`, the default root plus
the banner-shape experiment. It cannot be combined with
`INTH_TANSTACK_RENDERING`.

```bash
INTH_EXPERIMENT=1 bun run dev
```

Open `/consent-example?experiment=1`: Inth picks the `control` arm (the
default banner) or the `wall` arm in the browser, and the page shows
`banner-shape · <arm> · inth`. `/consent-example?experiment=1&arm=wall`
resolves the arm in the root loader, on the server, where a flag provider's
answer would go. The server function passes it to
`resolveConsent({ experiment })`, which counts the arm through `/init` and
returns the experiment in the state, so `InthProvider` needs no `experiment`
option. Any other `arm` value runs `control`. The root's `onSurfaceShown` and
`onChoiceRecorded` callbacks list each impression and choice under the arm and
push them to `window.dataLayer` as `inth_surface_shown` and
`inth_choice_recorded`. See `packages/sdk/docs/guides/banner-experiments.mdx`.

## Demo files

`src/demo` holds the demo pages' components and CSS, and the IAB banner the
home page shows for visitors the backend resolves to an IAB policy. Try the
region preview from the home page, or by hand: on a backend with matching
policies, `?country=DE` resolves an IAB policy and `?country=US&region=CA` an
opt-out policy with no banner.
`scripts/region-preview.mjs` turns the query into geo headers in the dev
server and in `scripts/serve.mjs`, outside the app. Never ship it.

## Pointing at a hosted backend

Replace `https://your-project.inth.app` in the root routes and
`src/routes/api/inth/$.ts` with the backend URL from your
[Inth](https://inth.com) project, and add this app's origin to the project's
trusted origins.

`VITE_INTH_PROJECT_URL` overrides that URL without editing the files.
`src/test-backend.ts` applies it. Set it when you run `bun run dev` by hand;
the acceptance suite sets it for its builds.

## Production build

```bash
bun run build
bun run start
```

`vite build` emits `dist/server/server.js` as a bare `{ fetch }` handler with
no listener, so `bun run start` hosts it with `scripts/serve.mjs`: srvx on
`node:http` serving `dist/client` as static files in front of the handler,
which is the Node hosting shape TanStack Start documents for that output.
`PORT` and `HOST` override the defaults (`3010`, `127.0.0.1`).

## Consent example

Open `/consent-example` for the shared integration scenario. Replace the
vendor placeholders in `src/scripts.ts`:

- `phc_your_project_key`: PostHog browser project key. The example selects the
  EU region; change `region` for a US project.
- `your-pixel-id`: X Pixel ID, not a conversion event ID.

PostHog uses
`loadMode: 'after-consent'` and `cookieless_mode: 'never'`. X Pixel waits for
marketing permission. The YouTube iframe only mounts with measurement
permission and is removed on revocation. The Default theme and Branded theme
buttons override CSS tokens without replacing the consent runtime.

The shared acceptance suite builds each rendering variant against a fixture
backend:

```sh
EXAMPLE_TARGET=tanstack-start,tanstack-start-streamed,tanstack-start-same-origin,tanstack-start-static bun run --cwd internals/fixtures/acceptance test
```
