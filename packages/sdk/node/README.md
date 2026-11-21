# @inth/node

Read what your signed-in users consent to, link them to the browsers they chose on, and publish and record acceptance of your legal documents, from Node.js, Vercel Functions or Cloudflare Workers.

```bash
pnpm add @inth/node
```

## Key Features

- Link a browser's consent to your user at sign-in, or from another domain with identity tokens
- Read what a user consents to across every device they signed in on
- Publish your terms and privacy policy, record who accepted which version, and check whether a user accepted the latest one
- Every call resolves to `{ data, error }`, with typed error codes, field errors and safe retries
- No Node built-ins: runs on Node.js 20.3 or later, Vercel Functions and Cloudflare Workers

## Prerequisites

- Node.js 20.3 or later, Vercel Functions or Cloudflare Workers
- An [Inth project](https://inth.com) and its secret key, with the Inth consent banner on your site

## Installation

```bash
pnpm add @inth/node
```

## Usage

1. Set `INTH_SECRET_KEY` and `INTH_PROJECT_URL` in your server's environment
2. At sign-in, call `inth.users.identify({ externalId, subjectId })` to link the browser to your user
3. Call `inth.consents.check({ externalId })` before you send marketing
4. For the full setup, see the [Node.js quickstart](https://inth.com/docs/node/quickstart)

## Documentation

See the [documentation](https://inth.com/docs/node/quickstart) for guides, API reference, and examples.

## Docs for AI Agents

This package ships its documentation as Markdown, matched to the installed version. After you install it, point your coding agent at `node_modules/@inth/node/AGENTS.md`. It indexes every guide in `node_modules/@inth/node/docs/`.

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

**Built by [Inth](https://inth.com?utm_source=npm&utm_medium=readme&utm_campaign=oss_readme&utm_content=%40inth%2Fnode)**
