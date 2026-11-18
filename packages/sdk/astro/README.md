# @inth/astro

Cookie banner, preference dialog, and consent-gated scripts for Astro 5, 6, and 7. Middleware resolves each request's consent policy, such as GDPR opt-in in the EU. The banner is plain `.astro` markup with no framework JavaScript. The preference dialog loads as a Svelte, React, or Vue island only when a visitor opens it.

```bash
pnpm add @inth/astro
```

## Key Features

- Visitors download no UI framework for the banner. The dialog's framework loads only when a visitor opens it
- Write the dialog island in Svelte, React, or Vue, so it uses the framework your site already ships
- Static output works on any static host with `hosted()`. Server output resolves each visitor's policy, so the banner is in the first HTML
- Geo-aware middleware reads location and language headers from your host
- Analytics, ads, and pixels follow each visitor's choice through @inth/integrations: Google Tag Manager, Google Consent Mode v2, GA4, Meta Pixel, PostHog, and more
- IAB TCF 2.4 banner and dialog components

## Prerequisites

- Astro 5, 6, or 7
- One of `@astrojs/svelte`, `@astrojs/react`, or `@astrojs/vue` for the preference dialog
- A server adapter for server output, or none for static output
- An [Inth project](https://inth.com) (free sign-up), a [self-hosted backend](https://c15t.com/docs/self-host/quickstart), or local mode for development and tests

## Installation

```bash
pnpm add @inth/astro @astrojs/svelte svelte @astrojs/node
```

For React or Vue dialogs, install `@astrojs/react react react-dom` or `@astrojs/vue vue` instead of Svelte. `@astrojs/node` is the server adapter in the example below. Use your host's adapter instead, or leave it out for static output.

## Usage

1. Set `PUBLIC_INTH_PROJECT_URL` to your Inth backend URL in `.env`
2. Register your UI framework, then `inth()`, in `astro.config.mjs`

```js
// astro.config.mjs
import node from '@astrojs/node'
import svelte from '@astrojs/svelte'
import { defineConfig } from 'astro/config'
import inth from '@inth/astro'

export default defineConfig({
  adapter: node({ mode: 'standalone' }),
  integrations: [svelte(), inth()],
  output: 'server',
})
```

3. Add `ConsentScript` to `<head>`, and `ConsentBanner`, `ConsentDialog`, and `ConsentDialogLink` to your layout, from `@inth/astro/components`
4. For static output, the full layout, and island options, see the [Astro quickstart](https://c15t.com/docs/frameworks/astro/quickstart)

## Hosting

Inth needs somewhere to keep policies and consent records. Pick one:

- **Hosted on [Inth](https://inth.com?utm_source=npm&utm_medium=readme&utm_campaign=oss_readme&utm_content=%40inth%2Fastro)**: Inth runs the backend for you. You get policy storage, consent records, audit history, and a dashboard, with no database or server to run. Sign-up is free.
- **Self-hosted**: Run [`@c15t/backend`](https://www.npmjs.com/package/@c15t/backend) on your own server with PostgreSQL, MySQL, or SQLite. You own migrations, backups, and uptime. See the [self-hosting guide](https://c15t.com/docs/self-host/quickstart).
- **Offline**: Choices stay in the browser, with no consent records. Use it for local development, previews, and demos, not production.

The frontend code is the same for Inth and a self-hosted backend. Only the backend URL changes.

## Documentation

See the [documentation](https://c15t.com/docs/frameworks/astro/quickstart) for guides, API reference, and examples.

## Docs for AI Agents

This package ships its documentation as Markdown, matched to the installed version. After you install it, point your coding agent at `node_modules/@inth/astro/AGENTS.md`. It indexes every guide in `node_modules/@inth/astro/docs/`.

On the web, every page of the [Inth docs](https://c15t.com/docs) has a Markdown version, and [llms.txt](https://c15t.com/docs/llms.txt) lists them all. Install the Inth agent skills with `npx skills add inth/skills`.

## Support

- Join our [Discord community](https://inth.link/discord)
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

**Built by [Inth](https://inth.com?utm_source=npm&utm_medium=readme&utm_campaign=oss_readme&utm_content=%40inth%2Fastro)**
