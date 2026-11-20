# @inth/angular

Cookie banner, consent dialog, and preference center for Angular. Standalone components, signals, zoneless change detection, and server rendering. Use the headless state and primitives when you want your own design.

```bash
pnpm add @inth/angular
```

## Key Features

- Works with Angular 20, 21 and 22, zoneless or with zone.js
- `provideInth()` sets up consent once; `inject(ConsentManager)` reads it as signals anywhere
- Server rendering with `@angular/platform-server`: the banner is in the first HTML
- Headless directives for switches (with Angular forms), accordions, tabs, dialogs and preference items
- `*inthIfConsent` keeps content out of the DOM until the visitor agrees
- Translations for 53 languages through @inth/sdk/translations

## Prerequisites

- Angular 20, 21 or 22
- Node.js 20.19 or later
- An [Inth project](https://inth.com) (free sign-up), or `testing()` for development and tests

## Installation

```bash
pnpm add @inth/angular
```

## Usage

1. Add `provideInth()` to your application providers with a `mode`
2. Read consent anywhere with `inject(ConsentManager)`
3. Render `<inth-consent-banner />` and `<inth-consent-dialog />` once in your root component, and add `inthConsentDialogLink` to a footer button

```ts
// app.config.ts
import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { hosted, provideInth } from '@inth/angular';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideInth({ mode: hosted({ projectUrl: 'https://your-project.inth.app' }) }),
  ],
};
```

```html
<!-- Rendered only once the visitor allows marketing -->
<iframe *inthIfConsent="'marketing'; else blocked" src="https://www.youtube.com/embed/…"></iframe>
<ng-template #blocked>Allow marketing cookies to watch this video.</ng-template>
```

## Hosting

[Inth](https://inth.com?utm_source=npm&utm_medium=readme&utm_campaign=oss_readme&utm_content=%40inth%2Fangular) keeps your policies and consent records. You get policy storage, consent records, audit history, and a dashboard, with no database or server to run. Sign-up is free. Set the project URL from your Inth dashboard as `projectUrl`.

For local development, previews, and tests, `testing()` keeps choices in the browser and sends no consent records. It throws in production builds.

## Documentation

See the [documentation](https://c15t.com/docs/frameworks/angular/quickstart) for guides, API reference, and examples.

## Docs for AI Agents

This package ships its documentation as Markdown, matched to the installed version. After you install it, point your coding agent at `node_modules/@inth/angular/AGENTS.md`. It indexes every guide in `node_modules/@inth/angular/docs/`.

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

**Built by [Inth](https://inth.com?utm_source=npm&utm_medium=readme&utm_campaign=oss_readme&utm_content=%40inth%2Fangular)**
