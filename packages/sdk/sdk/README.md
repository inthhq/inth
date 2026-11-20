# @inth/sdk

The consent engine, the vanilla JavaScript client, the script-tag builds, UI styles, translations and IAB TCF support. Framework packages such as `@inth/react` and `@inth/vue` build on it. Install it directly for a site without a UI framework, or to load the script-tag build from a CDN.

```bash
pnpm add @inth/sdk
```

## Prerequisites

- Node.js 20.19 or later for a bundled app
- An [Inth project](https://inth.com) (free sign-up), or `testing()` for development and tests

## Usage

1. Start the client with the project URL from your Inth project

```ts
import { init } from '@inth/sdk'

init({ projectUrl: 'https://your-project.inth.app' })
```

2. For a site without a build step, load `lib/browser/dist/inth.js` from a CDN instead. See the [script tag quickstart](https://c15t.com/docs/frameworks/html/quickstart)
3. For the full setup, see the [JavaScript quickstart](https://c15t.com/docs/frameworks/javascript/quickstart)

## Documentation

See the [documentation](https://c15t.com/docs/frameworks/javascript/quickstart) for guides, API reference, and examples.

## Docs for AI Agents

This package ships its documentation as Markdown, matched to the installed version. After you install it, point your coding agent at `node_modules/@inth/sdk/AGENTS.md`. It indexes every guide in `node_modules/@inth/sdk/docs/`.

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

**Built by [Inth](https://inth.com?utm_source=npm&utm_medium=readme&utm_campaign=oss_readme&utm_content=%40inth%2Fsdk)**
