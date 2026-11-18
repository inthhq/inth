# @inth/tanstack-start

Cookie banner, consent dialog, and preference center for TanStack Start. A server function in the root loader resolves each visitor's consent policy, such as GDPR opt-in in the EU, so the banner is in the first HTML.

```bash
pnpm add @inth/tanstack-start
```

## Key Features

- Works with `@tanstack/react-start` 1.168.60 or a later 1.x release, including TanStack Start 1.0, on React 18 or 19
- The root route loader resolves each visitor's policy on the server, so the banner is in the first HTML and does not appear late
- Your policy downloads at build time with `consentManifest()` and stays on the server
- Request middleware reads CDN location, language, and Global Privacy Control headers
- Prerendered pages and static hosts work too, with `createConsentRoute()` for same-origin consent requests
- Prebuilt cookie banner, consent dialog, and preference center with a theme system
- Headless hooks for a fully custom design
- Analytics, ads, and pixels follow each visitor's choice through @inth/integrations: Google Tag Manager, Google Consent Mode v2, GA4, Meta Pixel, PostHog, and more
- IAB TCF 2.4 banner, dialog, and hooks through the @inth/react/iab subpath
- Translations for 53 languages through @inth/sdk/translations

## Prerequisites

- `@tanstack/react-start` 1.168.60 or a later 1.x release, including TanStack Start 1.0
- `@tanstack/react-router` 1.170.41 or a later 1.x release, at the version your `@tanstack/react-start` release depends on. TanStack Start 1.0 needs at least 1.170.43
- Vite 7 or later, or Vite 8 or later for TanStack Start 1.0
- React 18 or 19
- Node.js 20.19 or later, or Node.js 22.12 or later for TanStack Start 1.0
- An [Inth project](https://inth.com) (free sign-up), a [self-hosted backend](https://c15t.com/docs/self-host/quickstart), or local mode for development and tests

## Installation

```bash
pnpm add @inth/tanstack-start
```

Then add the prebuilt stylesheet to your app-level CSS entry point:

```css
/* src/styles.css */
@import "@inth/tanstack-start/styles.css";
```

## Usage

1. Set `VITE_INTH_PROJECT_URL` to your Inth backend URL in `.env`
2. Add `consentManifest()` from `@inth/tanstack-start/build` to `vite.config.ts`, before `tanstackStart()`. It downloads your policy at build time and keeps it on the server

```ts
// vite.config.ts
import { consentManifest } from '@inth/tanstack-start/build';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [consentManifest(), tanstackStart(), viteReact()],
});
```

3. Resolve the consent state in the root route loader with `createConsentStateHandler()` in a server function, and pass it to `ConsentRoot`

```tsx
// src/routes/__root.tsx
import { createRootRoute, Outlet } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import {
  ConsentBanner,
  ConsentDialog,
  ConsentDialogLink,
  ConsentRoot,
} from '@inth/tanstack-start';
import {
  consentLoaderOptions,
  createConsentStateHandler,
} from '@inth/tanstack-start/server';

const getConsentState = createServerFn({ method: 'GET' }).handler(
  createConsentStateHandler()
);

export const Route = createRootRoute({
  ...consentLoaderOptions,
  loader: async () => ({ consent: await getConsentState() }),
  component: RootComponent,
});

function RootComponent() {
  const { consent } = Route.useLoaderData();
  return (
    <ConsentRoot state={consent}>
      <Outlet />
      <ConsentBanner />
      <ConsentDialog />
      <ConsentDialogLink>Privacy settings</ConsentDialogLink>
    </ConsentRoot>
  );
}
```

4. For the full setup, see the [TanStack Start quickstart](https://c15t.com/docs/frameworks/tanstack-start/quickstart)

## Hosting

Inth needs somewhere to keep policies and consent records. Pick one:

- **Hosted on [Inth](https://inth.com?utm_source=npm&utm_medium=readme&utm_campaign=oss_readme&utm_content=%40inth%2Ftanstack-start)**: Inth runs the backend for you. You get policy storage, consent records, audit history, and a dashboard, with no database or server to run. Sign-up is free.
- **Self-hosted**: Run [`@c15t/backend`](https://www.npmjs.com/package/@c15t/backend) on your own server with PostgreSQL, MySQL, or SQLite. You own migrations, backups, and uptime. See the [self-hosting guide](https://c15t.com/docs/self-host/quickstart).
- **Offline**: Choices stay in the browser, with no consent records. Use it for local development, previews, and demos, not production.

The frontend code is the same for Inth and a self-hosted backend. Only the backend URL changes.

## Documentation

See the [documentation](https://c15t.com/docs/frameworks/tanstack-start/quickstart) for guides, API reference, and examples.

## Docs for AI Agents

This package ships its documentation as Markdown, matched to the installed version. After you install it, point your coding agent at `node_modules/@inth/tanstack-start/AGENTS.md`. It indexes every guide in `node_modules/@inth/tanstack-start/docs/`.

On the web, every page of the [Inth docs](https://c15t.com/docs) has a Markdown version, and [llms.txt](https://c15t.com/docs/llms.txt) lists them all. Install the Inth agent skills with `npx skills add inth/skills`.

## Support

- Join our [Discord community](https://c15t.link/discord)
- Open an issue on our [GitHub repository](https://github.com/c15t/c15t/issues)
- Visit [inth.com](https://inth.com) and use the chat widget
- Contact our support team via email [support@inth.com](mailto:support@inth.com)

## Contributing

- Read the [contribution guidelines](https://c15t.com/docs/oss/contributing) before you open a pull request
- Follow the [code of conduct](https://c15t.com/docs/oss/code-of-conduct)

## Security

Do not open a public issue for a security vulnerability. Report it privately through [GitHub's vulnerability reporting](https://github.com/c15t/c15t/security/advisories/new). We examine every valid report.

- Do not share the vulnerability in public forums, issues, or pull requests
- Give the steps to reproduce it and the versions it affects
- Give us time to release a fix before you disclose it

## License

[Apache License 2.0](https://github.com/c15t/c15t/blob/main/LICENSE.md)

---

**Built by [Inth](https://inth.com?utm_source=npm&utm_medium=readme&utm_campaign=oss_readme&utm_content=%40inth%2Ftanstack-start)**
