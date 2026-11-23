# React (Vite)

The smallest Inth setup for a client-rendered React app built with Vite: the
stock consent banner and dialog, a "Privacy settings" link, and PostHog loaded
only after the visitor allows measurement. The browser asks your Inth
project's `/init` for each visitor's policy, and the backend picks it from the
visitor's location.

- `vite.config.ts` adds `consentManifest`, which adds an inline script to
  `index.html` that starts the `/init` request while the app's JavaScript
  downloads.
- `src/consent.tsx` mounts `InthProvider` with the backend URL from
  `VITE_INTH_PROJECT_URL`, PostHog, the banner, the dialog and the link.
- `src/main.tsx` wraps the app in `Consent`.

## Run it

From the repository root:

```sh
pnpm install
pnpm sdk:build
bun run --cwd examples/react dev
```

The app's `.env` points it at the `https://example-inth.inth.app` demo Inth
project. The browser asks it for each visitor's policy on every page load, so
policy edits in the project apply without a rebuild. To use your own project,
set `VITE_INTH_PROJECT_URL` in `.env.local` to its backend URL and add the
app's origin to its trusted origins.

Vite writes the backend URL into the bundle, so rebuild after changing it.

Replace `phc_your_project_key` in `src/consent.tsx` with your PostHog project
key.

The [React quickstart](https://inth.com/docs/frameworks/react/quickstart)
walks through each file.
