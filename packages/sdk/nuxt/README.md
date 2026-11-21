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
- An [Inth project](https://inth.com) (free sign-up), or `testing()` for development and tests

## Installation

```bash
pnpm add @inth/nuxt
```

## Usage

1. Register the module and set `NUXT_PUBLIC_INTH_PROJECT_URL` to your Inth project URL

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@inth/nuxt'],
})
```

2. Add `InthProvider` and a link that opens the preference dialog to `app.vue`

```vue
<!-- app/app.vue -->
<template>
  <InthProvider />
  <NuxtPage />
  <footer>
    <ConsentDialogLink>Privacy settings</ConsentDialogLink>
  </footer>
</template>
```

3. For the full setup, see the [Nuxt quickstart](https://inth.com/docs/frameworks/nuxt/quickstart)

## Hosting

[Inth](https://inth.com?utm_source=npm&utm_medium=readme&utm_campaign=oss_readme&utm_content=%40inth%2Fnuxt) keeps your policies and consent records. You get policy storage, consent records, audit history, and a dashboard, with no database or server to run. Sign-up is free. Set the project URL from your Inth dashboard as `projectUrl`.

For local development, previews, and tests, `testing()` keeps choices in the browser and sends no consent records. It throws in production builds.

## Documentation

See the [documentation](https://inth.com/docs/frameworks/nuxt/quickstart) for guides, API reference, and examples.

## Docs for AI Agents

This package ships its documentation as Markdown, matched to the installed version. After you install it, point your coding agent at `node_modules/@inth/nuxt/AGENTS.md`. It indexes every guide in `node_modules/@inth/nuxt/docs/`.

On the web, every page of the [Inth docs](https://inth.com/docs) has a Markdown version, and [llms.txt](https://inth.com/docs/llms.txt) lists them all.

## Support

- Join our [Discord community](https://c15t.link/discord)
- Open an issue on our [GitHub repository](https://github.com/inthhq/inth/issues)
- Visit [inth.com](https://inth.com) and use the chat widget
- Contact our support team via email [support@inth.com](mailto:support@inth.com)

## Contributing

- Read the [contribution guidelines](https://github.com/inthhq/inth/blob/main/.github/CONTRIBUTING.md) before you open a pull request
- Open an issue or pull request on [GitHub](https://github.com/inthhq/inth)

## Security

Do not open a public issue for a security vulnerability. Report it privately through [GitHub's vulnerability reporting](https://github.com/inthhq/inth/security/advisories/new). We examine every valid report.

- Do not share the vulnerability in public forums, issues, or pull requests
- Give the steps to reproduce it and the versions it affects
- Give us time to release a fix before you disclose it

## License

[Apache License 2.0](https://github.com/inthhq/inth/blob/main/LICENSE)

---

**Built by [Inth](https://inth.com?utm_source=npm&utm_medium=readme&utm_campaign=oss_readme&utm_content=%40inth%2Fnuxt)**
