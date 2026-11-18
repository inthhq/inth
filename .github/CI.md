# CI and releases

This repository ships three products: the Inth CLI, the web SDK and the mobile SDKs (React Native, Swift and Android). Pull requests run only the checks their files need. Each product releases from its own workflow, with its own checks and versions.

## How checks are selected

`.github/workflows/ci.yml` starts with a **Select checks** job that runs `tools/ci/plan.ts`. The planner lists the changed files against the pull request's base (or the previous tip on a push to `main`) and reads the pnpm workspace graph with `pnpm ls --recursive`. A changed file selects the workspace that owns it and every workspace that depends on that one. Run it locally:

```sh
CI_DIFF_BASE=origin/main node tools/ci/plan.ts   # route by the diff
node tools/ci/plan.ts                            # full run
CI_PRODUCTS=cli node tools/ci/plan.ts            # one product, as a release does
```

| Change | Jobs that run |
| --- | --- |
| `packages/cli/**`, `npm/**`, `docs/**`, `.tegami/**`, `install.sh`, root lint and test configs | CLI: Documentation; Lint, types, and unit tests; Native CLI on four platforms |
| `packages/sdk/**` | SDK lint and format, SDK repository tooling tests, SDK build and types, SDK package tests, SDK workspace tests, and the browser integration groups. Only the changed packages and their dependents build and test. |
| `apps/**`, `examples/**`, `benchmarks/**`, `internals/**`, `scripts/**` | The same SDK jobs, for the changed workspaces and their dependents |
| `packages/react-native/**` and the React Native fixtures | React Native and the React Native compatibility matrix, plus the SDK lint and format jobs. Its `ios/` half also runs Swift, its `android/` half also runs Android, and its Codegen specs and manifest run both. |
| `packages/swift/**`, root `Package.swift` | Swift, plus SDK lint and format |
| `packages/android/**` | Android, plus SDK lint and format |
| `packages/native-protocol/**`, `examples/native/**` | React Native, Swift and Android, and all SDK package tests, because the web packages read the shared fixtures |
| Markdown in the SDK or mobile trees | SDK lint and format only |
| `pnpm-lock.yaml`, `package.json`, `turbo.json`, `pnpm-workspace.yaml`, `.github/workflows/**`, `.github/actions/**`, `tools/ci/**`, `patches/**`, any file the planner does not know | Everything |

The browser integration groups come from c15t's planner (`tools/ci/browser-groups.ts`) and run through `scripts/ci-browser.ts`: example acceptance, starter smoke tests, Next.js compatibility cells, framework parity across the Storybooks, SSR journeys and CSS compatibility. A group runs when a fixture, starter, Storybook or bench it covers is selected.

The React Native compatibility matrix packs `@inth/react-native` and installs it in a fresh app for each React Native and Expo release in `scripts/mobile-compatibility.json`, then checks types, Codegen and Expo prebuild.

A web SDK change never runs the mobile jobs, even when it reaches `@inth/react-native` through `@c15t/core` or `@c15t/iab`. The planner lists those workspaces as `mobileReached` in the job summary. The React Native release runs their checks before it publishes.

The six CLI jobs are required checks on `main` under their exact names. They always run. When a change has no CLI work, each one prints a line and reports success, so a required check never waits forever.

**CI result** runs last, every time. It passes only when **Select checks** passed and every other job passed or was not selected. Requiring **CI result** alone in the `main` ruleset covers all products, and lets the CLI jobs drop their always-run steps later.

## Runners

The CLI jobs keep the Blacksmith runners they used before. The SDK and mobile jobs use GitHub-hosted runners: `ubuntu-24.04`, and `macos-26` for Swift. The Android emulator suites in `.depot/workflows` need KVM and run on Depot CI, which this repository is connected to. They report as `Android emulator / …` checks. **CI result** does not cover them, because they are not jobs in `ci.yml`.

## Releases

| Product | Workflow | Checks before publishing | Publishes to | Tags | State |
| --- | --- | --- | --- | --- | --- |
| CLI | `release.yml` (Release CLI) | CLI jobs only | npm, with trusted publishing | `inth@<version>` | Live |
| Web SDK | `release-sdk.yml` | SDK jobs only | npm | `sdk@<version>` | Disabled |
| React Native | `release-react-native.yml` | React Native jobs | npm | `react-native@<version>` | Disabled |
| Swift | `release-swift.yml` | Swift jobs | Git tags read by SwiftPM | `<version>`, no prefix | Disabled |
| Android | `release-android.yml` | Android jobs | Maven Central | `android@<version>` | Disabled |

SwiftPM resolves the root `Package.swift` from plain semver tags such as `1.2.3`. Only the Swift line may create those, so every other product uses a prefixed tag.

`release.yml` keeps its file name because npm trusted publishing for `@inth/cli` names it (`packages/cli/scripts/tegami.ts`). Renaming the file makes npm reject the publish.

The four disabled workflows run by hand only. Each verifies its product, then `tools/ci/release-guard.ts` stops the publish job. The guard refuses while the product's repository variable (`SDK_RELEASE_ENABLED`, `REACT_NATIVE_RELEASE_ENABLED`, `SWIFT_RELEASE_ENABLED`, `ANDROID_RELEASE_ENABLED`) is not `true`. It also refuses any `c15t`, `@c15t/*` or `com.c15t` artifact, even with the variable set. After the guard, each publish step is a placeholder that fails. To turn a line on: rename its packages, wire its publish step, give that job the permissions it needs, put its credentials in a protected environment, then set the variable.

## Secrets and variables

| Name | Kind | Used by | Without it |
| --- | --- | --- | --- |
| `MACOS_CERTIFICATE`, `MACOS_CERTIFICATE_PASSWORD` | Secrets in the `macos-signing` environment | CLI release, macOS signing | The CLI release fails at signing, as before |
| `SDK_RELEASE_ENABLED`, `REACT_NATIVE_RELEASE_ENABLED`, `SWIFT_RELEASE_ENABLED`, `ANDROID_RELEASE_ENABLED` | Repository variables | The disabled release workflows | The release refuses to publish |
| npm trusted publishers for the SDK and React Native packages | npm settings | `release-sdk.yml`, `release-react-native.yml` | Not wired yet |
| Maven Central user token and a GPG signing key and password | Secrets | `release-android.yml` | Not wired yet |
| `POSTHOG_E2E_PROJECT_KEY` | Depot CI secret | `.depot/workflows/android-posthog-live.yml` | The job prints a notice and skips |

No CI job needs Apple signing. The Swift job builds and tests SwiftPM targets only.
