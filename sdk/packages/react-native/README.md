# @c15t/react-native: native consent for mobile

<p>
<a href="https://github.com/c15t/c15t"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/github/c15t/c15t/stars.svg?variant=outline&mode=dark"><img src="https://shieldcn.dev/github/c15t/c15t/stars.svg?variant=outline&mode=light" alt="Stars"></picture></a>
<a href="https://github.com/c15t/c15t/blob/main/LICENSE.md"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/github/c15t/c15t/license.svg?variant=outline&mode=dark"><img src="https://shieldcn.dev/github/c15t/c15t/license.svg?variant=outline&mode=light" alt="License"></picture></a>
<a href="https://c15t.link/discord"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/discord/1312171102268690493.svg?variant=outline&mode=dark"><img src="https://shieldcn.dev/discord/1312171102268690493.svg?variant=outline&mode=light" alt="Discord"></picture></a>
<a href="https://skills.sh/c15t/skills/c15t"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/skills/c15t/skills/c15t.svg?variant=outline&mode=dark"><img src="https://shieldcn.dev/skills/c15t/skills/c15t.svg?variant=outline&mode=light" alt="Skills"></picture></a>
<a href="https://inth.com?utm_source=npm&utm_medium=readme&utm_campaign=oss_readme&utm_content=%40c15t%2Freact-native"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/badge/Made%20By-Inth-ffc803.svg?color=ffc803&labelTextColor=000000&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGZpbGw9Im5vbmUiIHZpZXdCb3g9IjAgMCAzOTMgNDAwIj48cGF0aCBmaWxsPSIjMDAwIiBkPSJNMTgyLjY2MiAwdjM2Ljg5NWgtNTkuMDMxdjgyLjczM2g1OS4wMzF2MzYuODkzSDI3LjQ4MnYtMzYuODkzaDU5LjAzVjM2Ljg5NWgtNTkuMDNWMHpNMzIxLjk0MSA4OS44NVYwaDM1LjM1NXYxNTYuNTIxaC0yNS43MTNsLTg2LjEzNy05MC4zNjR2OTAuMzY0aC0zNS4zNTVWMGgyNi4zNTV6Ii8%2BPHBhdGggZmlsbD0iIzAwMCIgZmlsbC1ydWxlPSJldmVub2RkIiBkPSJNMzE4LjU3MSAxODUuNzE0aDc0LjI4NlY0MDBIMFYxODUuNzE0aDI3Mi44NTd2LTQ3LjE0M3ptLTI5MS4wOSAyOC45Njl2MzcuMTE4aDU4LjEzN3YxMTkuNjI4aDM2Ljg5NVYyNTEuODAxaDU4LjU4NHYtMzcuMTE4em0xODIuNjEuMjI0djE1Ni41MjJoMzYuODk0VjMxMy41OWg3My4zNDF2NTcuODM5aDM3LjExOFYyMTQuOTA3aC0zNy4xMTh2NjEuNzg4aC03My4zNDF2LTYxLjc4OHoiIGNsaXAtcnVsZT0iZXZlbm9kZCIvPjwvc3ZnPg%3D%3D&valueColor=000000&mode=dark"><img src="https://shieldcn.dev/badge/Made%20By-Inth-ffc803.svg?color=ffc803&labelTextColor=000000&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGZpbGw9Im5vbmUiIHZpZXdCb3g9IjAgMCAzOTMgNDAwIj48cGF0aCBmaWxsPSIjMDAwIiBkPSJNMTgyLjY2MiAwdjM2Ljg5NWgtNTkuMDMxdjgyLjczM2g1OS4wMzF2MzYuODkzSDI3LjQ4MnYtMzYuODkzaDU5LjAzVjM2Ljg5NWgtNTkuMDNWMHpNMzIxLjk0MSA4OS44NVYwaDM1LjM1NXYxNTYuNTIxaC0yNS43MTNsLTg2LjEzNy05MC4zNjR2OTAuMzY0aC0zNS4zNTVWMGgyNi4zNTV6Ii8%2BPHBhdGggZmlsbD0iIzAwMCIgZmlsbC1ydWxlPSJldmVub2RkIiBkPSJNMzE4LjU3MSAxODUuNzE0aDc0LjI4NlY0MDBIMFYxODUuNzE0aDI3Mi44NTd2LTQ3LjE0M3ptLTI5MS4wOSAyOC45Njl2MzcuMTE4aDU4LjEzN3YxMTkuNjI4aDM2Ljg5NVYyNTEuODAxaDU4LjU4NHYtMzcuMTE4em0xODIuNjEuMjI0djE1Ni41MjJoMzYuODk0VjMxMy41OWg3My4zNDF2NTcuODM5aDM3LjExOFYyMTQuOTA3aC0zNy4xMTh2NjEuNzg4aC03My4zNDF2LTYxLjc4OHoiIGNsaXAtcnVsZT0iZXZlbm9kZCIvPjwvc3ZnPg%3D%3D&valueColor=000000&mode=light" alt="Made by Inth"></picture></a>
</p>

Native consent screens, saved privacy choices and SDK gates for React Native and Expo. SwiftUI renders iOS consent screens and Compose renders Android screens. Optional native SDKs can read permission before JavaScript starts.

c15t is used by [2,100+ sites](https://www.wappalyzer.com/technologies/cookie-compliance/c15t/), including expo.dev, zed.dev, unkey.dev, mintlify.com, and sazabi.com.

## Key Features

- Native consent prompts and a preference center that can be reopened from app settings
- Hooks and category commands for app-owned React Native controls
- Consent gates that stay current after grants and withdrawals
- Protected saved choices and queued delivery when the app is offline
- Native IAB purpose and partner choices, Additional Consent and separate ATT handling

## Prerequisites

- React Native 0.83.x through 0.88.x with the New Architecture enabled
- React >=19.2.0 <19.4.0, using the version prescribed by your React Native or Expo release
- iOS 16.4 or newer and Android `minSdk` 24. Android needs JDK 17 and `compileSdk` 36, or 37 for RN 0.87, RN 0.88 and Expo 58
- Expo SDK 55 through 58 requires a custom native build. Expo Go cannot load this package's native module
- An Inth hosted project URL, such as https://your-project.inth.app. Advanced self-hosted deployments remain supported.

## Installation

The mobile SDK is a private prerelease. Obtain the package tarball and its matching Android artifacts from the maintainer, then follow the [React Native quickstart](https://c15t.com/docs/frameworks/react-native/quickstart) or [Expo setup](https://c15t.com/docs/frameworks/react-native/expo). [Mobile availability](https://c15t.com/docs/guides/mobile-status) records distribution and first-release scope.

## Documentation

See the [documentation](https://c15t.com/docs/frameworks/react-native/quickstart) for guides, API reference, and examples.

## Compatibility and updates

For a new app, target RN 0.88 with React 19.3, or Expo 58, and verify native builds and consent journeys before shipping. Older matrix versions remain compatibility targets for existing apps; c15t compatibility does not extend upstream maintenance. The Expo plugin raises the iOS deployment target to at least 16.4 and preserves higher targets. Compatibility checks cover packed types, maintained source types, Codegen and Expo prebuild; they do not establish native runtime acceptance for every version. We review each stable RN and Expo release, announce removals, and raise compatibility floors in a c15t major release. See [compatibility and updates](https://c15t.com/docs/frameworks/react-native/platform-support).

## Native setup before JavaScript

Start with an Inth project and its authored policy. The reference apps use https://example-inth.inth.app/. Replace it with your own project URL. Configure the native launch hooks before optional SDK startup; `ConsentProvider` attaches to that engine, checks the protocol and presents the native consent prompt when one is owed. Pass `privacyPolicyURL`, or `autoPresent={false}` to present it yourself. It does not bootstrap a JavaScript consent engine. Disable vendor automatic startup and keep gates current after withdrawal.

## Local success and delivery

Check `CommitResult.ok` after each `useSaveConsents()` call. A resolved promise can refuse a commit. `ok: true, queued: true` means durable local success; it does not prove backend delivery. Keep refused drafts and retry controls. Stock native presenter outcomes report durable commits separately from presentation and dismissal.

## Guides

Start with the guide for your app. The package also includes version-matched Markdown under `docs/` for offline reading.

- [React Native quickstart](https://c15t.com/docs/frameworks/react-native/quickstart)
- [Expo and EAS](https://c15t.com/docs/frameworks/react-native/expo)
- [Bare React Native](https://c15t.com/docs/frameworks/react-native/bare)
- [Build your own UI](https://c15t.com/docs/frameworks/react-native/headless)
- [Customize native screens](https://c15t.com/docs/frameworks/react-native/customize)
- [Commands and outcomes](https://c15t.com/docs/frameworks/react-native/usage)
- [Native SDK gates](https://c15t.com/docs/frameworks/react-native/native-behaviour)
- [SwiftUI quickstart and UIKit](https://c15t.com/docs/frameworks/swift/quickstart)
- [Kotlin Android quickstart](https://c15t.com/docs/frameworks/android/quickstart)
- [Mobile SDK integrations](https://c15t.com/docs/integrations/overview#mobile-sdks)
- [Offline consent](https://c15t.com/docs/guides/mobile-offline)
- [IAB and advertising](https://c15t.com/docs/guides/mobile-iab)
- [Verify mobile consent](https://c15t.com/docs/guides/mobile-verify)

## IAB and ads

Native IAB and Additional Consent APIs do not establish IAB registration, Google certification or AdMob interoperability. Vendor scope alone is not approved CMP configuration: set the Expo plugin's `iab` option, or the matching native metadata in bare RN, with your registered CMP ID, CMP version and publisher country code. There is no default CMP ID. ATT is a separate platform permission and never grants consent. Keep an ad integration disabled until its actual SDK, policy and certification requirements are verified.

## Self-hosted and headless integration

Hosted Inth is the recommended starting point. The existing self-hosted transports, native installation APIs, React components and headless hooks remain available. Browser script-loader and CSS APIs are not native SDK gates.

## First release scope

The first release includes native presenters, RN hooks and category commands, app-owned native installation, IAB CMP settings through the Expo plugin or native metadata, and standalone Swift/Kotlin APIs. A separate UI-free RN package is deferred. See [mobile availability](https://c15t.com/docs/guides/mobile-status) for the supported integration paths.

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
