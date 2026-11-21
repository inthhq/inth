# @inth/sdk-core: Headless JavaScript cookie consent engine

<p>
<a href="https://github.com/inthhq/inth"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/github/inthhq/inth/stars.svg?variant=outline&mode=dark"><img src="https://shieldcn.dev/github/inthhq/inth/stars.svg?variant=outline&mode=light" alt="Stars"></picture></a>
<a href="https://github.com/inthhq/inth/blob/main/LICENSE"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/github/inthhq/inth/license.svg?variant=outline&mode=dark"><img src="https://shieldcn.dev/github/inthhq/inth/license.svg?variant=outline&mode=light" alt="License"></picture></a>
<a href="https://c15t.link/discord"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/discord/1312171102268690493.svg?variant=outline&mode=dark"><img src="https://shieldcn.dev/discord/1312171102268690493.svg?variant=outline&mode=light" alt="Discord"></picture></a>
<a href="https://inth.com?utm_source=npm&utm_medium=readme&utm_campaign=oss_readme&utm_content=%40inth%2Fsdk-core"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/badge/Made%20By-Inth-ffc803.svg?color=ffc803&labelTextColor=000000&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGZpbGw9Im5vbmUiIHZpZXdCb3g9IjAgMCAzOTMgNDAwIj48cGF0aCBmaWxsPSIjMDAwIiBkPSJNMTgyLjY2MiAwdjM2Ljg5NWgtNTkuMDMxdjgyLjczM2g1OS4wMzF2MzYuODkzSDI3LjQ4MnYtMzYuODkzaDU5LjAzVjM2Ljg5NWgtNTkuMDNWMHpNMzIxLjk0MSA4OS44NVYwaDM1LjM1NXYxNTYuNTIxaC0yNS43MTNsLTg2LjEzNy05MC4zNjR2OTAuMzY0aC0zNS4zNTVWMGgyNi4zNTV6Ii8%2BPHBhdGggZmlsbD0iIzAwMCIgZmlsbC1ydWxlPSJldmVub2RkIiBkPSJNMzE4LjU3MSAxODUuNzE0aDc0LjI4NlY0MDBIMFYxODUuNzE0aDI3Mi44NTd2LTQ3LjE0M3ptLTI5MS4wOSAyOC45Njl2MzcuMTE4aDU4LjEzN3YxMTkuNjI4aDM2Ljg5NVYyNTEuODAxaDU4LjU4NHYtMzcuMTE4em0xODIuNjEuMjI0djE1Ni41MjJoMzYuODk0VjMxMy41OWg3My4zNDF2NTcuODM5aDM3LjExOFYyMTQuOTA3aC0zNy4xMTh2NjEuNzg4aC03My4zNDF2LTYxLjc4OHoiIGNsaXAtcnVsZT0iZXZlbm9kZCIvPjwvc3ZnPg%3D%3D&valueColor=000000&mode=dark"><img src="https://shieldcn.dev/badge/Made%20By-Inth-ffc803.svg?color=ffc803&labelTextColor=000000&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGZpbGw9Im5vbmUiIHZpZXdCb3g9IjAgMCAzOTMgNDAwIj48cGF0aCBmaWxsPSIjMDAwIiBkPSJNMTgyLjY2MiAwdjM2Ljg5NWgtNTkuMDMxdjgyLjczM2g1OS4wMzF2MzYuODkzSDI3LjQ4MnYtMzYuODkzaDU5LjAzVjM2Ljg5NWgtNTkuMDNWMHpNMzIxLjk0MSA4OS44NVYwaDM1LjM1NXYxNTYuNTIxaC0yNS43MTNsLTg2LjEzNy05MC4zNjR2OTAuMzY0aC0zNS4zNTVWMGgyNi4zNTV6Ii8%2BPHBhdGggZmlsbD0iIzAwMCIgZmlsbC1ydWxlPSJldmVub2RkIiBkPSJNMzE4LjU3MSAxODUuNzE0aDc0LjI4NlY0MDBIMFYxODUuNzE0aDI3Mi44NTd2LTQ3LjE0M3ptLTI5MS4wOSAyOC45Njl2MzcuMTE4aDU4LjEzN3YxMTkuNjI4aDM2Ljg5NVYyNTEuODAxaDU4LjU4NHYtMzcuMTE4em0xODIuNjEuMjI0djE1Ni41MjJoMzYuODk0VjMxMy41OWg3My4zNDF2NTcuODM5aDM3LjExOFYyMTQuOTA3aC0zNy4xMTh2NjEuNzg4aC03My4zNDF2LTYxLjc4OHoiIGNsaXAtcnVsZT0iZXZlbm9kZCIvPjwvc3ZnPg%3D%3D&valueColor=000000&mode=light" alt="Made by Inth"></picture></a>
</p>

The headless JavaScript cookie consent engine behind every Inth adapter. It resolves consent policies for GDPR and other privacy laws, stores choices, and holds back configured scripts, iframes, and network requests that the visitor's policy and choices do not allow. Use it to build your own consent UI or to connect a framework that has no Inth adapter.

## Key Features

- Bring your own UI: render from a consent snapshot, and Inth keeps state, storage, and policy resolution
- Control configured scripts, iframes, and network requests with category permissions from the resolved policy
- Policies decide who sees a banner: opt-in for visitors in the EU, opt-out for some US states, or rules that you write
- Google Consent Mode v2, IAB TCF 2.4, and Global Privacy Control support
- Creating a runtime has no side effects, so the module is safe to import on the server
- Vendor loaders for Google Tag Manager, Meta Pixel, PostHog, and more through @inth/integrations

## Prerequisites

- Node.js 20.19 or later
- An [Inth project](https://inth.com) (free sign-up), or `testing()` for development and tests

## Installation

```bash
pnpm add @inth/sdk-core
```

## Usage

1. Create one runtime for the page with `createConsentRuntime` and a mode such as `hosted()`
2. Call `runtime.start()` in the browser
3. Render your banner from `runtime.kernel.getSnapshot()` and update it from `runtime.kernel.subscribe()`
4. Record choices with `runtime.kernel.commands.save('all')`, `save('none')`, or an object such as `{ measurement: true }`
5. For the full walkthrough, see the [headless runtime guide](https://inth.com/docs/frameworks/javascript/headless)

```ts
// src/consent-runtime.ts
import { hosted } from '@inth/sdk-core'
import { createConsentRuntime } from '@inth/sdk-core/runtime'

export const runtime = createConsentRuntime({
  mode: hosted({ projectUrl: 'https://your-project.inth.app' }),
})
```

## Hosting

[Inth](https://inth.com?utm_source=npm&utm_medium=readme&utm_campaign=oss_readme&utm_content=%40inth%2Fsdk-core) keeps your policies and consent records. You get policy storage, consent records, audit history, and a dashboard, with no database or server to run. Sign-up is free. Set the project URL from your Inth dashboard as `projectUrl`.

For local development, previews, and tests, `testing()` keeps choices in the browser and sends no consent records. It throws in production builds.

## Documentation

See the [documentation](https://inth.com/docs/frameworks/javascript/headless) for guides, API reference, and examples.

## Related Packages

- [@inth/sdk](https://www.npmjs.com/package/@inth/sdk): this engine with a stock banner and preference dialog for plain JavaScript and script-tag sites
- [@inth/integrations](https://www.npmjs.com/package/@inth/integrations): consent-aware analytics, tag manager, pixel, and widget loaders

## Docs for AI Agents

This package ships its documentation as Markdown, matched to the installed version. After you install it, point your coding agent at `node_modules/@inth/sdk-core/AGENTS.md`. It indexes every guide in `node_modules/@inth/sdk-core/docs/`.

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

**Built by [Inth](https://inth.com?utm_source=npm&utm_medium=readme&utm_campaign=oss_readme&utm_content=%40inth%2Fsdk-core)**
