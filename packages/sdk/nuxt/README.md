# @inth/nuxt

Cookie banner, consent dialog, and preference center for Nuxt 3 and 4, with consent policies you set by location, such as GDPR opt-in or CCPA opt-out. The server resolves each visitor's policy, so the banner is in the first HTML.

```bash
pnpm add @inth/nuxt
```

## Key Features

- A Nuxt module: add `@inth/nuxt` to `modules` and the server resolves each visitor's policy
- Prebuilt cookie banner, consent dialog, and preference center with a theme system
- Auto-imported composables for a fully custom design
- Analytics, ads, and pixels follow each visitor's choice through @inth/integrations: Google Tag Manager, Google Consent Mode v2, GA4, Meta Pixel, PostHog, and more
- IAB TCF 2.4 banner and dialog components
- Static hosting with a policy bundled at build time

## Prerequisites

- Nuxt 3 or 4
- Node.js 20.19 or later
- An [Inth project](https://inth.com) (free sign-up), a [self-hosted backend](https://c15t.com/docs/self-host/quickstart), or local mode for development and tests

## Installation

```bash
pnpm add @inth/nuxt
```

## Usage

1. Register the module and set `NUXT_PUBLIC_C15T_BACKEND_URL` to your Inth backend URL

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@inth/nuxt'],
})
```

2. Add `ConsentRoot` and a link that opens the preference dialog to `app.vue`

```vue
<!-- app/app.vue -->
<template>
  <ConsentRoot />
  <NuxtPage />
  <footer>
    <ConsentDialogLink>Privacy settings</ConsentDialogLink>
  </footer>
</template>
```

3. For the full setup, see the [Nuxt quickstart](https://c15t.com/docs/frameworks/nuxt/quickstart)

## Hosting

c15t needs somewhere to keep policies and consent records. Pick one:

- **Hosted on [Inth](https://inth.com?utm_source=npm&utm_medium=readme&utm_campaign=oss_readme&utm_content=%40inth%2Fnuxt)**: Inth runs the backend for you. You get policy storage, consent records, audit history, and a dashboard, with no database or server to run. Sign-up is free.
- **Self-hosted**: Run [`@c15t/backend`](https://www.npmjs.com/package/@c15t/backend) on your own server with PostgreSQL, MySQL, or SQLite. You own migrations, backups, and uptime. See the [self-hosting guide](https://c15t.com/docs/self-host/quickstart).
- **Offline**: Choices stay in the browser, with no consent records. Use it for local development, previews, and demos, not production.

The frontend code is the same for Inth and a self-hosted backend. Only the backend URL changes.

## Documentation

See the [documentation](https://c15t.com/docs/frameworks/nuxt/quickstart) for guides, API reference, and examples.

## Docs for AI Agents

This package ships its documentation as Markdown, matched to the installed version. After you install it, point your coding agent at `node_modules/@inth/nuxt/AGENTS.md`. It indexes every guide in `node_modules/@inth/nuxt/docs/`.

On the web, every page of the [c15t docs](https://c15t.com/docs) has a Markdown version, and [llms.txt](https://c15t.com/docs/llms.txt) lists them all. Install the c15t agent skills with `npx skills add c15t/skills`.

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

**Built by [Inth](https://inth.com?utm_source=npm&utm_medium=readme&utm_campaign=oss_readme&utm_content=%40inth%2Fnuxt)**
