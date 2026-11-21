# @inth/nextjs

Next.js cookie banner, consent dialog, and preference center for the App Router and Pages Router. The server resolves each visitor's consent policy, such as GDPR opt-in in the EU, and renders the banner in the first HTML. Use headless hooks for your own UI.

```bash
pnpm add @inth/nextjs
```

## Key Features

- Works with Next.js 15 and 16, on the App Router and the Pages Router
- On dynamic pages, the server resolves each visitor's policy and sends it in the same response. Await `resolveConsent()` to put the banner in the first HTML
- Your policy downloads at build time with `withConsentManifest`, so rendering never waits on the consent backend
- Prebuilt cookie banner, consent dialog, and preference center with a theme system
- Headless hooks for a fully custom design
- Analytics, ads, and pixels follow each visitor's choice through @inth/integrations: Google Tag Manager, Google Consent Mode v2, GA4, Meta Pixel, PostHog, and more
- IAB TCF 2.4 banner, dialog, and hooks through the @inth/react/iab subpath
- Translations for 53 languages through @inth/sdk/translations

## Prerequisites

- Next.js 15 or 16
- React 18 or 19
- Node.js 20.19 or later
- An [Inth project](https://inth.com) (free sign-up), or `testing()` for development and tests

## Installation

```bash
pnpm add @inth/nextjs
```

Then add the prebuilt stylesheet to your app-level CSS entry point:

```css
/* app/globals.css */
@import "@inth/nextjs/styles.css";
```

## Usage

1. Set `NEXT_PUBLIC_INTH_PROJECT_URL` to your Inth project URL in `.env`
2. Wrap `next.config.ts` in `withConsentManifest`, which downloads your policy at build time and finds `inth.config.ts`

```ts
// next.config.ts
import { withConsentManifest } from '@inth/nextjs/build'
import type { NextConfig } from 'next'

const nextConfig = {} satisfies NextConfig

export default withConsentManifest(nextConfig)
```

3. Export the config from `inth.config.ts` at the project root

```ts
// inth.config.ts
import { defineConsentConfig } from '@inth/nextjs'

export default defineConsentConfig({})
```

4. Render `InthProvider` with `ConsentBanner` and `ConsentDialog` in the root layout, and pass it `resolveConsent()`

```tsx
// app/layout.tsx
import {
  ConsentBanner,
  ConsentDialog,
  ConsentDialogLink,
  InthProvider,
} from '@inth/nextjs'
import { resolveConsent } from '@inth/nextjs/server'
import type { ReactNode } from 'react'

import './globals.css'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Not awaited: the page renders while consent resolves. */}
        <InthProvider state={resolveConsent()}>
          {children}
          <ConsentBanner />
          <ConsentDialog />
          <ConsentDialogLink>Privacy settings</ConsentDialogLink>
        </InthProvider>
      </body>
    </html>
  )
}
```

5. For the full setup, see the [Next.js quickstart](https://inth.com/docs/frameworks/next/quickstart)

## Hosting

[Inth](https://inth.com?utm_source=npm&utm_medium=readme&utm_campaign=oss_readme&utm_content=%40inth%2Fnextjs) keeps your policies and consent records. You get policy storage, consent records, audit history, and a dashboard, with no database or server to run. Sign-up is free. Set the project URL from your Inth dashboard as `projectUrl`.

For local development, previews, and tests, `testing()` keeps choices in the browser and sends no consent records. It throws in production builds.

## Documentation

See the [documentation](https://inth.com/docs/frameworks/next/quickstart) for guides, API reference, and examples.

## Docs for AI Agents

This package ships its documentation as Markdown, matched to the installed version. After you install it, point your coding agent at `node_modules/@inth/nextjs/AGENTS.md`. It indexes every guide in `node_modules/@inth/nextjs/docs/`.

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

**Built by [Inth](https://inth.com?utm_source=npm&utm_medium=readme&utm_campaign=oss_readme&utm_content=%40inth%2Fnextjs)**
