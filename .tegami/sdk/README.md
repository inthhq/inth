# Publishing the SDK

Tegami publishes `@inth/sdk` and its nine framework packages from `.github/workflows/release-sdk.yml`. They release apart from the CLI, with their own changelogs and publish lock in this folder. The config is `tools/ci/sdk-release.ts`.

The packages share one version. Prereleases go to the `alpha` dist-tag, set in each package's `publishConfig.tag`. Users install them with the tag, such as `npm install @inth/react@alpha`.

| Package | Depends on |
| --- | --- |
| `@inth/sdk` |  |
| `@inth/angular` | `@inth/sdk` |
| `@inth/react` | `@inth/sdk` |
| `@inth/svelte` | `@inth/sdk` |
| `@inth/vue` | `@inth/sdk` |
| `@inth/astro` | `@inth/sdk`, `@inth/svelte`, peers `@inth/react` and `@inth/vue` |
| `@inth/integrations` | `@inth/sdk` |
| `@inth/nextjs` | `@inth/sdk`, `@inth/react` |
| `@inth/nuxt` | `@inth/sdk`, `@inth/vue` |
| `@inth/tanstack-start` | `@inth/sdk`, `@inth/react` |

The private `@inth/sdk-*` packages never publish. `@inth/sdk` copies their built files into `lib/`. They still take every version bump, because each build writes its package version into the code `@inth/sdk` ships. The SDK sends that version to the backend in the `x-c15t-version` header and the `v` parameter.

`@inth/react-native` releases from `release-react-native.yml`, not from here.

## Rehearse a publish

Use Node.js 24, as `.node-version` says. Then build the packages and pack them:

```sh
pnpm install --frozen-lockfile
pnpm turbo run build build:docs --filter='./packages/sdk/*'
pnpm sdk:pack --out /tmp/inth-sdk-tarballs
```

`pnpm sdk:pack` packs each package with `pnpm pack`, which resolves `workspace:` ranges as `pnpm publish` does. It publishes nothing. For each tarball, it checks that:

- the name and version match the workspace, and every package has the same version
- `publishConfig` has `access: public` and `tag: alpha`
- no dependency range still starts with `workspace:`, `catalog:`, `link:` or `file:`
- no dependency, peer or optional dependency names a private workspace package
- each dependency on another SDK package asks for the version that publishes with it
- every `files` entry, `main`, `types` and `exports` target is in the tarball
- no JavaScript or declaration file imports a private package

It prints the publish order and exits with code 1 if a check fails.

## First publish by hand

npm can only set up trusted publishing for a package that already exists. So `0.0.0-alpha.0` publishes from a maintainer's machine. It has no provenance, because npm only creates provenance in CI.

1. Check out `main` with this setup merged and a clean working tree. Run the rehearsal above. All ten packages must pass.
2. Run `npm login` with an account that can publish under `@inth`.
3. Publish the rehearsed tarballs in dependency order:

   ```sh
   for name in sdk angular react svelte vue astro integrations nextjs nuxt tanstack-start; do
     npm publish "/tmp/inth-sdk-tarballs/inth-$name-0.0.0-alpha.0.tgz" --access public --tag alpha || break
   done
   ```

   npm asks for a one-time password or a browser approval for each package. If a publish fails, fix the cause and run the loop again from that package.

4. Check each package with `npm view @inth/react dist-tags`. A new package always gets a `latest` tag, so npm can point `latest` at `0.0.0-alpha.0` too. Later alphas only move `alpha`.

## Turn on trusted publishing

Do this for each of the ten packages after the first publish. On npmjs.com:

1. Open the package's **Settings** page, such as `https://www.npmjs.com/package/@inth/react/access`.
2. Under **Trusted Publisher**, select **GitHub Actions**.
3. Enter organization or user `inthhq`, repository `inth`, and workflow filename `release-sdk.yml`. Leave the environment empty.
4. Save the connection and approve with two-factor authentication.
5. Under **Publishing access**, select **Require two-factor authentication and disallow tokens**, then **Update Package Settings**. Trusted publishing still works, and no token can publish the package.

The same connection from a terminal, with npm 11.20 or later:

```sh
for name in sdk angular react svelte vue astro integrations nextjs nuxt tanstack-start; do
  npm trust github "@inth/$name" --repo inthhq/inth --file release-sdk.yml --allow-publish
done
```

Then set the repository variable that lets the workflow publish:

```sh
gh variable set SDK_RELEASE_ENABLED --body true --repo inthhq/inth
```

The workflow needs no npm token. Its publish job runs on a GitHub-hosted runner with `id-token: write`, and npm exchanges GitHub's OIDC token for a short-lived publish credential. It sets `NPM_CONFIG_PROVENANCE`, so CI releases carry provenance.

## Later releases

1. Add a changelog to this folder with `pnpm tegami:sdk`, or by hand as `.tegami/sdk/YYYY-MM-DD-description.md`:

   ```md
   ---
   packages:
     "group:sdk": patch
   ---

   ### Describe the change

   What changed for a site that uses the SDK.
   ```

2. Run **Release SDK** from the Actions tab on `main`. With nothing left to publish, Tegami opens or updates a version PR on `tegami/sdk-version-packages`. It bumps every SDK package to the next `alpha` version and writes the publish lock.
3. Tegami writes `package.json` with two-space indentation. Run `pnpm sdk:fmt` on the version PR's branch before merging it.
4. Merge the version PR, then run **Release SDK** again. It publishes the new versions to `alpha`, tags `sdk@<version>` and creates a GitHub release. It skips any version already on npm, so a failed run can run again.

Before the first stable release, remove `tag` from each package's `publishConfig`, change `sdkDistTag` and the group's `prerelease` in `tools/ci/sdk-pack.ts` and `tools/ci/sdk-release.ts`, and publish to `latest`.
