# @inth/react

React cookie banner, consent dialog, and preference center for React 18 and 19. Each visitor's consent policy decides whether optional cookies wait for an opt-in, as EU cookie rules require, or load until the visitor opts out. Use headless hooks when you want your own design.

```bash
pnpm add @inth/react
```

## Key Features

- Works with React 18 and 19, including React Server Components through 'use client' entry points
- Prebuilt cookie banner, consent dialog, and preference center with a theme system
- Headless hooks and compound components for a fully custom design
- Analytics, ads, and pixels follow each visitor's choice through @inth/integrations: Google Tag Manager, Google Consent Mode v2, GA4, Meta Pixel, PostHog, and more
- IAB TCF 2.4 banner, dialog, and hooks through the @inth/react/iab subpath
- Translations for 53 languages through @inth/sdk/translations

## Prerequisites

- React 18 or 19
- Node.js 20.19 or later
- An [Inth project](https://inth.com) (free sign-up), or `testing()` for development and tests

## Installation

```bash
pnpm add @inth/react
```

Then add the prebuilt stylesheet to your app-level CSS entry point:

```css
/* src/index.css */
@import "@inth/react/styles.css";
```

If you use the prebuilt IAB TCF UI, also import `@inth/react/iab/styles.css`. It is published separately so apps without IAB do not ship those styles.

## Usage

1. Wrap your app in `InthProvider` with the project URL from your Inth dashboard
2. Render `ConsentBanner`, `ConsentDialog` and `ConsentDialogLink` inside the provider, and mount it once for the life of the app

```tsx
// src/consent.tsx
import {
  ConsentBanner,
  ConsentDialog,
  ConsentDialogLink,
  InthProvider,
  hosted,
} from '@inth/react'
import type { ReactNode } from 'react'

const mode = hosted({ projectUrl: 'https://your-project.inth.app' })

export const Consent = ({ children }: { children: ReactNode }) => (
  <InthProvider options={{ mode }}>
    {children}
    <ConsentBanner />
    <ConsentDialog />
    <ConsentDialogLink>Privacy settings</ConsentDialogLink>
  </InthProvider>
)
```

3. For the full setup, see the [React quickstart](https://inth.com/docs/frameworks/react/quickstart)

## Hosting

[Inth](https://inth.com?utm_source=npm&utm_medium=readme&utm_campaign=oss_readme&utm_content=%40inth%2Freact) keeps your policies and consent records. You get policy storage, consent records, audit history, and a dashboard, with no database or server to run. Sign-up is free. Set the project URL from your Inth dashboard as `projectUrl`.

For local development, previews, and tests, `testing()` keeps choices in the browser and sends no consent records. It throws in production builds.

## Documentation

See the [documentation](https://inth.com/docs/frameworks/react/quickstart) for guides, API reference, and examples.

## Docs for AI Agents

This package ships its documentation as Markdown, matched to the installed version. After you install it, point your coding agent at `node_modules/@inth/react/AGENTS.md`. It indexes every guide in `node_modules/@inth/react/docs/`.

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

**Built by [Inth](https://inth.com?utm_source=npm&utm_medium=readme&utm_campaign=oss_readme&utm_content=%40inth%2Freact)**
