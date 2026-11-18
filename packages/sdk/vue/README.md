# @inth/vue

Cookie banner, consent dialog, and preference center for Vue 3, with consent policies you set by location, such as GDPR opt-in or CCPA opt-out. A Vue plugin with composables when you want your own design. Nuxt apps use @inth/nuxt.

```bash
pnpm add @inth/vue
```

## Key Features

- A Vue plugin for Vite apps, with `consentManifest()` to bundle your policy at build time
- Prebuilt cookie banner, consent dialog, and preference center with a theme system
- Composables for a fully custom design
- Analytics, ads, and pixels follow each visitor's choice through @inth/integrations: Google Tag Manager, Google Consent Mode v2, GA4, Meta Pixel, PostHog, and more
- IAB TCF 2.4 banner and dialog components
- Translations for 53 languages through @inth/vue/translations

## Prerequisites

- Vue 3.5 or later
- Node.js 20.19 or later
- An [Inth project](https://inth.com) (free sign-up), a [self-hosted backend](https://c15t.com/docs/self-host/quickstart), or local mode for development and tests

## Installation

```bash
pnpm add @inth/vue
```

## Usage

1. Add `consentManifest()` from `@inth/vue/vite` to `vite.config.ts`
2. Install the plugin with `app.use(inthVue, { mode: hosted() })` from `@inth/vue/vue-plugin`, and render `ConsentRoot` in `App.vue`
3. For the full setup, see the [Vue quickstart](https://c15t.com/docs/frameworks/vue/quickstart)

## Hosting

Inth needs somewhere to keep policies and consent records. Pick one:

- **Hosted on [Inth](https://inth.com?utm_source=npm&utm_medium=readme&utm_campaign=oss_readme&utm_content=%40inth%2Fvue)**: Inth runs the backend for you. You get policy storage, consent records, audit history, and a dashboard, with no database or server to run. Sign-up is free.
- **Self-hosted**: Run [`@c15t/backend`](https://www.npmjs.com/package/@c15t/backend) on your own server with PostgreSQL, MySQL, or SQLite. You own migrations, backups, and uptime. See the [self-hosting guide](https://c15t.com/docs/self-host/quickstart).
- **Offline**: Choices stay in the browser, with no consent records. Use it for local development, previews, and demos, not production.

The frontend code is the same for Inth and a self-hosted backend. Only the backend URL changes.

## Documentation

See the [documentation](https://c15t.com/docs/frameworks/vue/quickstart) for guides, API reference, and examples.

## Docs for AI Agents

This package ships its documentation as Markdown, matched to the installed version. After you install it, point your coding agent at `node_modules/@inth/vue/AGENTS.md`. It indexes every guide in `node_modules/@inth/vue/docs/`.

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

**Built by [Inth](https://inth.com?utm_source=npm&utm_medium=readme&utm_campaign=oss_readme&utm_content=%40inth%2Fvue)**
