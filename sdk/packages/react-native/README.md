# @c15t/react-native: native consent for mobile

<p>
<a href="https://github.com/c15t/c15t"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/github/c15t/c15t/stars.svg?variant=outline&mode=dark"><img src="https://shieldcn.dev/github/c15t/c15t/stars.svg?variant=outline&mode=light" alt="Stars"></picture></a>
<a href="https://github.com/c15t/c15t/blob/main/LICENSE.md"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/github/c15t/c15t/license.svg?variant=outline&mode=dark"><img src="https://shieldcn.dev/github/c15t/c15t/license.svg?variant=outline&mode=light" alt="License"></picture></a>
<a href="https://c15t.link/discord"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/discord/1312171102268690493.svg?variant=outline&mode=dark"><img src="https://shieldcn.dev/discord/1312171102268690493.svg?variant=outline&mode=light" alt="Discord"></picture></a>
<a href="https://skills.sh/c15t/skills/c15t"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/skills/c15t/skills/c15t.svg?variant=outline&mode=dark"><img src="https://shieldcn.dev/skills/c15t/skills/c15t.svg?variant=outline&mode=light" alt="Skills"></picture></a>
<a href="https://inth.com?utm_source=npm&utm_medium=readme&utm_campaign=oss_readme&utm_content=%40c15t%2Freact-native"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/badge/Made%20By-Inth-ffc803.svg?color=ffc803&labelTextColor=000000&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGZpbGw9Im5vbmUiIHZpZXdCb3g9IjAgMCAzOTMgNDAwIj48cGF0aCBmaWxsPSIjMDAwIiBkPSJNMTgyLjY2MiAwdjM2Ljg5NWgtNTkuMDMxdjgyLjczM2g1OS4wMzF2MzYuODkzSDI3LjQ4MnYtMzYuODkzaDU5LjAzVjM2Ljg5NWgtNTkuMDNWMHpNMzIxLjk0MSA4OS44NVYwaDM1LjM1NXYxNTYuNTIxaC0yNS43MTNsLTg2LjEzNy05MC4zNjR2OTAuMzY0aC0zNS4zNTVWMGgyNi4zNTV6Ii8%2BPHBhdGggZmlsbD0iIzAwMCIgZmlsbC1ydWxlPSJldmVub2RkIiBkPSJNMzE4LjU3MSAxODUuNzE0aDc0LjI4NlY0MDBIMFYxODUuNzE0aDI3Mi44NTd2LTQ3LjE0M3ptLTI5MS4wOSAyOC45Njl2MzcuMTE4aDU4LjEzN3YxMTkuNjI4aDM2Ljg5NVYyNTEuODAxaDU4LjU4NHYtMzcuMTE4em0xODIuNjEuMjI0djE1Ni41MjJoMzYuODk0VjMxMy41OWg3My4zNDF2NTcuODM5aDM3LjExOFYyMTQuOTA3aC0zNy4xMTh2NjEuNzg4aC03My4zNDF2LTYxLjc4OHoiIGNsaXAtcnVsZT0iZXZlbm9kZCIvPjwvc3ZnPg%3D%3D&valueColor=000000&mode=dark"><img src="https://shieldcn.dev/badge/Made%20By-Inth-ffc803.svg?color=ffc803&labelTextColor=000000&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGZpbGw9Im5vbmUiIHZpZXdCb3g9IjAgMCAzOTMgNDAwIj48cGF0aCBmaWxsPSIjMDAwIiBkPSJNMTgyLjY2MiAwdjM2Ljg5NWgtNTkuMDMxdjgyLjczM2g1OS4wMzF2MzYuODkzSDI3LjQ4MnYtMzYuODkzaDU5LjAzVjM2Ljg5NWgtNTkuMDNWMHpNMzIxLjk0MSA4OS44NVYwaDM1LjM1NXYxNTYuNTIxaC0yNS43MTNsLTg2LjEzNy05MC4zNjR2OTAuMzY0aC0zNS4zNTVWMGgyNi4zNTV6Ii8%2BPHBhdGggZmlsbD0iIzAwMCIgZmlsbC1ydWxlPSJldmVub2RkIiBkPSJNMzE4LjU3MSAxODUuNzE0aDc0LjI4NlY0MDBIMFYxODUuNzE0aDI3Mi44NTd2LTQ3LjE0M3ptLTI5MS4wOSAyOC45Njl2MzcuMTE4aDU4LjEzN3YxMTkuNjI4aDM2Ljg5NVYyNTEuODAxaDU4LjU4NHYtMzcuMTE4em0xODIuNjEuMjI0djE1Ni41MjJoMzYuODk0VjMxMy41OWg3My4zNDF2NTcuODM5aDM3LjExOFYyMTQuOTA3aC0zNy4xMTh2NjEuNzg4aC03My4zNDF2LTYxLjc4OHoiIGNsaXAtcnVsZT0iZXZlbm9kZCIvPjwvc3ZnPg%3D%3D&valueColor=000000&mode=light" alt="Made by Inth"></picture></a>
</p>

Private prerelease for React Native, Expo development builds and native iOS/Android integration. One native engine owns policy, durable choices and SDK gates before JavaScript starts. SwiftUI and Compose provide the shared stock consent screens.

c15t is used by [2,100+ sites](https://www.wappalyzer.com/technologies/cookie-compliance/c15t/), including expo.dev, zed.dev, unkey.dev, mintlify.com, and sazabi.com.

## Key Features

- Native Swift and Kotlin consent authority, durable records and synchronous SDK gates before JavaScript
- Shared SwiftUI and Compose presenters with native drafts, IAB disclosures, search and standing preferences
- Durable local commit outcomes and queued delivery, including offline withdrawal
- Build-exported endpoint-bound policies for first-install offline prompts, with explicit authority expiry
- Headless React Native hooks and commands, separate ATT authorization and app-owned native installation

## Prerequisites

- React Native 0.86.x or 0.87.x with the New Architecture enabled
- React 19.2.3 or later, below 19.3.0, to render the built-in components
- iOS 16.4 or newer, Android `minSdk` 24 and `compileSdk` 36
- A custom native build: Expo Go cannot load this package's native module, so use a development build
- An Inth hosted project URL, such as https://your-project.inth.app. Advanced self-hosted deployments remain supported.

## Installation

This package is still `private: true`. Obtain the matching package tarball and native artifacts from the maintainer. Public npm, Maven and remote SwiftPM installation, cloud builds and device acceptance are not established by this checkout.

## Documentation

See the [documentation](https://c15t.com/docs/frameworks/react-native/quickstart) for guides, API reference, and examples.

## Native setup before JavaScript

Start with an Inth project and its authored policy. The reference apps use https://example-inth.inth.app/. Replace it with your own project URL. Configure the native launch hooks before optional SDK startup; `C15tProvider` attaches to that engine and checks the protocol. It does not bootstrap a JavaScript consent engine. Disable vendor automatic startup and keep gates current after withdrawal.

## Local success and delivery

Check `CommitResult.ok` after `save`, `acceptAll` or `rejectAll`. A resolved promise can refuse a commit. `ok: true, queued: true` means durable local success; it does not prove backend delivery. Keep refused drafts and retry controls. Stock native presenter outcomes report durable commits separately from presentation and dismissal.

## Guides

Use the version-matched Markdown under `docs/frameworks/react-native/` or the [public docs source routes](https://c15t.com/docs/frameworks/react-native/quickstart):

- [Quickstart and availability](https://c15t.com/docs/frameworks/react-native/quickstart)
- [Expo and EAS](https://c15t.com/docs/frameworks/react-native/expo)
- [Bare React Native](https://c15t.com/docs/frameworks/react-native/bare)
- [Commands and outcomes](https://c15t.com/docs/frameworks/react-native/usage)
- [Native startup and gates](https://c15t.com/docs/frameworks/react-native/native-behaviour)
- [Offline policies and withdrawal](https://c15t.com/docs/frameworks/react-native/offline)
- [IAB, Additional Consent, ATT and ads](https://c15t.com/docs/frameworks/react-native/iab)
- [Identity and reset](https://c15t.com/docs/frameworks/react-native/identity)
- [Native customization](https://c15t.com/docs/frameworks/react-native/customize) and [headless hooks](https://c15t.com/docs/frameworks/react-native/headless)
- [Standalone Apple](https://c15t.com/docs/frameworks/react-native/apple) and [Android](https://c15t.com/docs/frameworks/react-native/android)
- [Configuration](https://c15t.com/docs/frameworks/react-native/configuration), [compatibility and OTA](https://c15t.com/docs/frameworks/react-native/platform-support)
- [Verification](https://c15t.com/docs/frameworks/react-native/verify) and [troubleshooting](https://c15t.com/docs/frameworks/react-native/troubleshooting)

## IAB and ads

Native IAB and Additional Consent APIs do not establish IAB registration, Google certification or AdMob interoperability. Vendor scope alone is not approved CMP configuration. ATT is a separate platform permission and never grants consent. Keep an ad integration disabled until its actual SDK, policy and certification requirements are verified.

## Self-hosted and headless integration

Hosted Inth is the recommended starting point. The existing self-hosted transports, native installation APIs, React components and headless hooks remain available. Browser script-loader and CSS APIs are not native SDK gates.

## Docs for AI Agents

This package ships its documentation as Markdown, matched to the installed version. After you install it, point your coding agent at `node_modules/@c15t/react-native/AGENTS.md`. It indexes every guide in `node_modules/@c15t/react-native/docs/`.

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

**Built by [Inth](https://inth.com?utm_source=npm&utm_medium=readme&utm_campaign=oss_readme&utm_content=%40c15t%2Freact-native)**
