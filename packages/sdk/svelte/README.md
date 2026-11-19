# @inth/svelte

Cookie banner, consent dialog, and preference center for Svelte 5 and SvelteKit. Configure location-based consent policies, such as GDPR opt-in for EU visitors. Use headless state when you want your own design.

```bash
pnpm add @inth/svelte
```

## Key Features

- Works with Svelte 5.20 and later, and SvelteKit 2 and 3
- On SvelteKit, `loadConsent` resolves the policy on the server, so the banner is in the first HTML
- Prebuilt cookie banner, consent dialog, and preference center with a theme system
- Headless state for a fully custom design
- Analytics, ads, and pixels follow each visitor's choice through @inth/integrations: Google Tag Manager, Google Consent Mode v2, GA4, Meta Pixel, PostHog, and more
- Translations for 53 languages through @inth/sdk/translations

## Prerequisites

- Svelte 5.20 or later, or SvelteKit 2 or 3
- Node.js 20.19 or later
- An [Inth project](https://inth.com) (free sign-up), or `testing()` for development and tests

## Installation

```bash
pnpm add @inth/svelte
```

Import the Svelte components from `@inth/svelte`.

To manually install, follow the [quickstart](https://c15t.com/docs/frameworks/svelte/quickstart).

## Usage

1. Add `consentManifest()` from `@inth/svelte/vite` to `vite.config.ts`. It downloads your policy from `VITE_INTH_PROJECT_URL` (SvelteKit: `PUBLIC_INTH_PROJECT_URL`)
2. Wrap your app with `ConsentProvider` in `manifest()` mode
3. Add `ConsentBanner` and `ConsentDialog` near the root
4. In SvelteKit, render `ConsentRoot` with the state `loadConsent` from `@inth/svelte/kit` returns; see the [SvelteKit quickstart](https://c15t.com/docs/frameworks/sveltekit/quickstart)
5. For the full setup, see the [Svelte quickstart docs](https://c15t.com/docs/frameworks/svelte/quickstart)

```svelte
<!-- src/App.svelte -->
<script lang="ts">
  import {
    ConsentBanner,
    ConsentDialog,
    ConsentDialogLink,
    ConsentProvider,
    manifest,
  } from '@inth/svelte';
</script>

<ConsentProvider mode={manifest()}>
  <main>Your app goes here.</main>
  <ConsentBanner />
  <ConsentDialog />
  <ConsentDialogLink>Privacy settings</ConsentDialogLink>
</ConsentProvider>
```

## Hosting

[Inth](https://inth.com?utm_source=npm&utm_medium=readme&utm_campaign=oss_readme&utm_content=%40inth%2Fsvelte) keeps your policies and consent records. You get policy storage, consent records, audit history, and a dashboard, with no database or server to run. Sign-up is free. Set the project URL from your Inth dashboard as `projectUrl`.

For local development, previews, and tests, `testing()` keeps choices in the browser and sends no consent records. It throws in production builds.

## Documentation

See the [documentation](https://c15t.com/docs/frameworks/svelte/quickstart) for guides, API reference, and examples.

## Docs for AI Agents

This package ships its documentation as Markdown, matched to the installed version. After you install it, point your coding agent at `node_modules/@inth/svelte/AGENTS.md`. It indexes every guide in `node_modules/@inth/svelte/docs/`.

On the web, every page of the [Inth docs](https://c15t.com/docs) has a Markdown version, and [llms.txt](https://c15t.com/docs/llms.txt) lists them all. Install the c15t agent skills with `npx skills add c15t/skills`.

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

**Built by [Inth](https://inth.com?utm_source=npm&utm_medium=readme&utm_campaign=oss_readme&utm_content=%40inth%2Fsvelte)**
