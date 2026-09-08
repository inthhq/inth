# Publishing

Tegami manages the `@inth/cli` package and its five native packages as one release group. Versions and GitHub release tags stay together. Releases publish to the `latest` npm tag. The first release is `0.0.0`. The version PR flow follows the [events-sdk setup](https://github.com/inthhq/events-sdk/blob/main/scripts/tegami.mts).

## Add a changelog

Run `pnpm tegami` for a user-visible change, or add `.tegami/YYYY-MM-DD-description.md`:

```md
---
packages:
  "group:inth": patch
---

### Fix organization selection

Describe what changed for the person using the CLI.
```

Use `patch`, `minor`, or `major`. Include a Markdown heading. A changelog for `@inth/cli` also bumps the native packages. Tegami updates `packages/cli/src/version.ts` so the compiled CLI reports the released version. Do not edit that file, generated `CHANGELOG.md` files, or `publish-lock.yaml` by hand.

## Release flow

The initial `0.0.0` release already has generated changelogs and a publish lock. After npm setup, merging this setup into `main` publishes that exact version. Subsequent releases use version PRs:

1. Merge the change and its changelog into `main`.
2. The Release workflow runs lint, typechecks, unit tests, and native/package tests on all five supported targets.
3. `pnpm tegami ci` opens or updates the version PR with package versions, changelogs, and the publish lock.
4. Merge the version PR. The next run rebuilds and tests those versions, checks the downloaded native artifacts, publishes the platform packages, then publishes `@inth/cli` and creates one GitHub release.

Failed releases can be rerun from GitHub Actions. Tegami skips versions already published. The release workflow only runs on `main` in `inthhq/inth` and does not cancel an active publication.

Once the first release is published:

```sh
npm install --global @inth/cli
inth --help
```

The main package uses Node.js to select and launch the native executable. Users who install a platform package directly can run its binary without Node.js on `PATH`. Optional dependencies must be enabled when installing `@inth/cli`.

## One-time repository and npm setup

GitHub Actions must allow workflows to create and approve pull requests so Tegami can open the version PR. This setting is already enabled for `inthhq/inth`. The workflow uses `GITHUB_TOKEN` for PRs and GitHub releases.

Configure npm trusted publishing for all six package names with owner `inthhq`, repository `inth`, workflow `release.yml`, and no environment restriction. The workflow grants `id-token: write` and publishes with provenance.

For package names that do not exist yet, Tegami provides a bootstrap command. From a clean checkout containing the initial publish lock, after logging in to npm with an account that can publish under `@inth`:

```sh
npm login
pnpm tegami npm pretrust --dry-run
pnpm tegami npm pretrust
```

The second command previews the bootstrap. The third publishes empty setup versions under the `temp` tag and configures trust. Commit any resulting publish-lock change with the release setup before merging it. Existing packages are skipped by `pretrust`; configure their trusted publisher in npm settings.
