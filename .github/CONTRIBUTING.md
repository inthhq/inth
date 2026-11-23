# Contributing

This repository holds the Inth CLI and the consent SDK: the web packages, React Native, Swift and Android. Bug reports, fixes, docs and feature ideas are welcome.

By contributing, you agree to license your work under the [Apache License 2.0](../LICENSE).

## Before you start

- Search the [issues](https://github.com/inthhq/inth/issues) and [pull requests](https://github.com/inthhq/inth/pulls) first.
- Open an issue before you start work on anything larger than a small fix.
- New features, large refactors and architecture changes need a maintainer's approval first. We mark those issues `needs-approval` and remove the label when work can start.
- Bug fixes, docs, tests, performance and security fixes can start right away.

## Set up

The workspace uses Node.js 24 and the pnpm version in [`package.json`](../package.json). Several SDK scripts also need [Bun](https://bun.sh) 1.3.11 as a runtime.

```sh
git clone https://github.com/<your-username>/inth.git
cd inth
git switch -c my-change
pnpm install
```

Branch from `main` and open your pull request against `main`.

## Check your change

Run the checks for the product you changed. CI runs the same ones, chosen by the files your pull request touches; see [CI.md](CI.md).

CLI:

```sh
pnpm check
```

Web SDK:

```sh
pnpm sdk:fmt          # format
pnpm sdk:lint
pnpm sdk:check-types
pnpm sdk:test
pnpm sdk:test:scripts # repository tooling
```

Mobile SDKs:

```sh
pnpm turbo run test --filter=./packages/react-native
swift test --package-path .
(cd packages/android && ./gradlew :inth-core:test :inth-android:testDebugUnitTest)
```

CI builds Swift with Xcode 26. Android needs JDK 17 and the Android SDK.

## Pull requests

- Fill in the pull request template and link the issue.
- Add or update tests for behavior you change.
- Update the docs when behavior changes.
- Add screenshots for UI changes.
- Keep pull requests to one change. Split unrelated work.

A maintainer reviews every pull request. Changes under `.github/` need review from a repository owner, because workflow code runs with repository credentials.

## Release notes

Add a `.tegami/*.md` note for a change to the CLI. Use explicit bumps and a heading:

```md
---
packages:
  "@inth/cli": patch
---

### Fix the login prompt on Windows

The prompt no longer hangs when the terminal has no TTY.
```

A change to the web SDK packages takes a note in `.tegami/sdk/` instead, with `"group:sdk"` as the package. Run `pnpm tegami:sdk` to write one; [Publishing the SDK](../.tegami/sdk/README.md) shows the format.

See [publishing with Tegami](../.tegami/README.md) for how versions and releases work. Each product has its own release workflow; see [CI.md](CI.md#releases).

## Code style

Oxlint and Oxfmt enforce style. The CLI uses `oxlint.config.ts` and `oxfmt.config.ts`; the SDK uses `oxlint.sdk.config.ts` and `oxfmt.sdk.config.ts`.

## Security

Report vulnerabilities privately. See [SECURITY.md](../SECURITY.md).
