# @inth/sdk-browser: Cookie banner and cookie consent for any website, with one script tag

<p>
<a href="https://github.com/inthhq/inth"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/github/inthhq/inth/stars.svg?variant=outline&mode=dark"><img src="https://shieldcn.dev/github/inthhq/inth/stars.svg?variant=outline&mode=light" alt="Stars"></picture></a>
<a href="https://github.com/inthhq/inth/blob/main/LICENSE"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/github/inthhq/inth/license.svg?variant=outline&mode=dark"><img src="https://shieldcn.dev/github/inthhq/inth/license.svg?variant=outline&mode=light" alt="License"></picture></a>
<a href="https://c15t.link/discord"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/discord/1312171102268690493.svg?variant=outline&mode=dark"><img src="https://shieldcn.dev/discord/1312171102268690493.svg?variant=outline&mode=light" alt="Discord"></picture></a>
<a href="https://inth.com?utm_source=npm&utm_medium=readme&utm_campaign=oss_readme&utm_content=%40inth%2Fsdk-browser"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/badge/Made%20By-Inth-ffc803.svg?color=ffc803&labelTextColor=000000&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGZpbGw9Im5vbmUiIHZpZXdCb3g9IjAgMCAzOTMgNDAwIj48cGF0aCBmaWxsPSIjMDAwIiBkPSJNMTgyLjY2MiAwdjM2Ljg5NWgtNTkuMDMxdjgyLjczM2g1OS4wMzF2MzYuODkzSDI3LjQ4MnYtMzYuODkzaDU5LjAzVjM2Ljg5NWgtNTkuMDNWMHpNMzIxLjk0MSA4OS44NVYwaDM1LjM1NXYxNTYuNTIxaC0yNS43MTNsLTg2LjEzNy05MC4zNjR2OTAuMzY0aC0zNS4zNTVWMGgyNi4zNTV6Ii8%2BPHBhdGggZmlsbD0iIzAwMCIgZmlsbC1ydWxlPSJldmVub2RkIiBkPSJNMzE4LjU3MSAxODUuNzE0aDc0LjI4NlY0MDBIMFYxODUuNzE0aDI3Mi44NTd2LTQ3LjE0M3ptLTI5MS4wOSAyOC45Njl2MzcuMTE4aDU4LjEzN3YxMTkuNjI4aDM2Ljg5NVYyNTEuODAxaDU4LjU4NHYtMzcuMTE4em0xODIuNjEuMjI0djE1Ni41MjJoMzYuODk0VjMxMy41OWg3My4zNDF2NTcuODM5aDM3LjExOFYyMTQuOTA3aC0zNy4xMTh2NjEuNzg4aC03My4zNDF2LTYxLjc4OHoiIGNsaXAtcnVsZT0iZXZlbm9kZCIvPjwvc3ZnPg%3D%3D&valueColor=000000&mode=dark"><img src="https://shieldcn.dev/badge/Made%20By-Inth-ffc803.svg?color=ffc803&labelTextColor=000000&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGZpbGw9Im5vbmUiIHZpZXdCb3g9IjAgMCAzOTMgNDAwIj48cGF0aCBmaWxsPSIjMDAwIiBkPSJNMTgyLjY2MiAwdjM2Ljg5NWgtNTkuMDMxdjgyLjczM2g1OS4wMzF2MzYuODkzSDI3LjQ4MnYtMzYuODkzaDU5LjAzVjM2Ljg5NWgtNTkuMDNWMHpNMzIxLjk0MSA4OS44NVYwaDM1LjM1NXYxNTYuNTIxaC0yNS43MTNsLTg2LjEzNy05MC4zNjR2OTAuMzY0aC0zNS4zNTVWMGgyNi4zNTV6Ii8%2BPHBhdGggZmlsbD0iIzAwMCIgZmlsbC1ydWxlPSJldmVub2RkIiBkPSJNMzE4LjU3MSAxODUuNzE0aDc0LjI4NlY0MDBIMFYxODUuNzE0aDI3Mi44NTd2LTQ3LjE0M3ptLTI5MS4wOSAyOC45Njl2MzcuMTE4aDU4LjEzN3YxMTkuNjI4aDM2Ljg5NVYyNTEuODAxaDU4LjU4NHYtMzcuMTE4em0xODIuNjEuMjI0djE1Ni41MjJoMzYuODk0VjMxMy41OWg3My4zNDF2NTcuODM5aDM3LjExOFYyMTQuOTA3aC0zNy4xMTh2NjEuNzg4aC03My4zNDF2LTYxLjc4OHoiIGNsaXAtcnVsZT0iZXZlbm9kZCIvPjwvc3ZnPg%3D%3D&valueColor=000000&mode=light" alt="Made by Inth"></picture></a>
</p>

Cookie banner, preference center, and consent-gated scripts for sites without a build step: Webflow, WordPress, Framer, Squarespace, and plain HTML. Configure consent policies for GDPR and other privacy laws, then paste one script tag. Bundled apps can import the same runtime as an ES module.

## Key Features

- One script tag from a CDN, configured with data attributes or calls queued on `window.inth`
- Prebuilt banner and preference dialog in a shadow root, so your site's CSS does not change them
- Vendor scripts use `<script type="text/plain" data-inth-category>` and iframes use `data-src` and `data-category`. They load when the resolved policy allows their categories
- Buttons with `data-inth-action` and links to `#inth-preferences` work without code
- A headless build with the same runtime and `window.inth` API, for your own banner
- DevTools (`inth.devtools.js`) and IAB GPP (`inth.gpp.js`) load as a second tag. For IAB TCF 2.4, load `inth.iab.js` instead of `inth.js`
- ES module entry points for bundled apps, which can use the @inth/integrations vendor loaders

## Prerequisites

- A page where you can add a `<script>` tag
- An [Inth project](https://inth.com) (free sign-up), or `inth.testing.js` on test pages

## Installation

Paste before `</head>`, with the project URL from your Inth project:

```html
<script
  src="https://cdn.jsdelivr.net/npm/@inth/sdk/lib/browser/dist/inth.js"
  data-project-url="YOUR_INTH_PROJECT_URL"
  defer
></script>
```

A URL without a version loads the newest release, so pin an exact version, such as `@inth/sdk@3.2.0`, in production. The default `inth.js` requires a project URL. Load `lib/browser/dist/inth.testing.js` on test pages with no backend, or `lib/browser/dist/inth.headless.js` for the runtime without any UI.

For bundled apps:

```bash
npm install @inth/sdk
```

## Usage

1. Add the tag and reload. The banner appears when the visitor's policy asks for one
2. Change vendor tags to `type="text/plain"` with `data-inth-category="measurement"` so they load when the resolved policy allows that category
3. Link to `#inth-preferences` so visitors can reopen the preference dialog
4. For every attribute and method, see the [HTML docs](https://inth.com/docs/frameworks/html/attributes-and-api)

```js
window.inth = window.inth || [];
inth.push(['on', 'consent', () => {
  if (inth.has('measurement')) {
    startAnalytics();
  }
}]);
```

## Hosting

[Inth](https://inth.com?utm_source=npm&utm_medium=readme&utm_campaign=oss_readme&utm_content=%40inth%2Fsdk-browser) keeps your policies and consent records. You get policy storage, consent records, audit history, and a dashboard, with no database or server to run. Sign-up is free. Set the project URL from your Inth dashboard as `projectUrl`.

For local development, previews, and tests, `testing()` keeps choices in the browser and sends no consent records. It throws in production builds.

## Documentation

See the [documentation](https://inth.com/docs/frameworks/html/quickstart) for guides, API reference, and examples.

## Which Script to Load

| File | Use it for |
| --- | --- |
| `inth.js` | Your Inth project. Set `data-project-url` |
| `inth.testing.js` | Test pages only: the stock UI with `testing()`, which resolves a policy in the browser with no backend |
| `inth.headless.js` | The runtime without UI, for your own banner. Can inline or fetch the backend's cacheable `/v1/consent/manifest` |
| `inth.iab.js` | IAB TCF 2.4. Configure `iab` with your registered CMP ID and vendor list. See the [IAB example](https://inth.com/docs/frameworks/html/iab) |
| `inth.devtools.js` | A DevTools panel, with a Location tab to try policies by region |
| `inth.gpp.js` | IAB GPP (`__gpp`) for US state opt-outs. Also available as `mountGPP` from `@inth/sdk/gpp` |

## Docs for AI Agents

This package ships its documentation as Markdown, matched to the installed version. After you install it, point your coding agent at `node_modules/@inth/sdk-browser/AGENTS.md`. It indexes every guide in `node_modules/@inth/sdk-browser/docs/`.

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

**Built by [Inth](https://inth.com?utm_source=npm&utm_medium=readme&utm_campaign=oss_readme&utm_content=%40inth%2Fsdk-browser)**
