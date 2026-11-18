# Publishing the SDK

`.github/workflows/release-sdk.yml` publishes `@inth/sdk` and the nine framework packages built on it, the public `@inth` packages in `packages/sdk`. They release apart from the CLI, with their own changelogs and publish lock in this folder. The Tegami config is `tools/ci/sdk-release.ts`.

The SDK packages share one version. A prerelease goes to the dist-tag its version names, so `0.0.0-alpha.0` goes to `alpha`, and each package's `publishConfig.tag` must say the same. Users install with the tag, such as `npm install @inth/react@alpha`.

The private `@inth/sdk-*` packages never publish. `@inth/sdk` copies their built files into `lib/`. They still take every version bump, because each build writes its version into the code `@inth/sdk` ships. The SDK sends that version to the backend in the `x-c15t-version` header and the `v` parameter.

## Rehearse a publish

Use Node.js 24, the version `.node-version` pins. Build the packages, then pack them into a new folder:

```sh
pnpm install --frozen-lockfile
pnpm turbo run build build:docs --filter='./packages/sdk/*'
pnpm sdk:pack --out /tmp/inth-sdk-tarballs
```

`pnpm sdk:pack` packs each package with `pnpm pack`, which rewrites `workspace:` ranges as `pnpm publish` does. It checks each tarball's version, publish settings, dependencies, files and imports, and exits with code 1 if a check fails. It publishes nothing. It numbers the tarballs in publish order, so each package comes after the ones it depends on.

## First publish by hand

npm can only set up trusted publishing for a package that already exists, so `0.0.0-alpha.0` publishes from a maintainer's machine. It has no provenance, because npm only creates provenance in CI.

1. Check out `main` with a clean working tree. Run the rehearsal above. All ten packages must pass.
2. Run `npm login` with an account that can publish under `@inth`.
3. Publish the tarballs in order:

   ```sh
   for tarball in /tmp/inth-sdk-tarballs/*.tgz; do
     npm publish "$tarball" --access public --tag alpha || break
   done
   ```

   npm asks for a one-time password or a browser approval for each package. If a publish fails, fix the cause, delete the tarballs that did publish, and run the loop again.

4. Check each package with `npm view @inth/react dist-tags`. A new package always gets a `latest` tag, so npm can point `latest` at `0.0.0-alpha.0` too. Later alphas only move `alpha`.

## Turn on trusted publishing

Do this for each of the ten packages on npmjs.com:

1. Open the package's settings page, such as `https://www.npmjs.com/package/@inth/react/access`.
2. Under **Trusted Publisher**, select **GitHub Actions**.
3. Enter organization or user `inthhq`, repository `inth`, and workflow filename `release-sdk.yml`. Leave the environment empty.
4. Save the connection and approve with two-factor authentication.
5. Under **Publishing access**, select **Require two-factor authentication and disallow tokens**, then **Update Package Settings**. Trusted publishing still works, and no token can publish the package.

Or connect all ten from a terminal, with npm 11.20 or later:

```sh
for name in sdk angular react svelte vue astro integrations nextjs nuxt tanstack-start; do
  npm trust github "@inth/$name" --repo inthhq/inth --file release-sdk.yml --allow-publish
done
```

Then let the workflow publish:

```sh
gh variable set SDK_RELEASE_ENABLED --body true --repo inthhq/inth
```

The workflow needs no npm token. npm exchanges GitHub's OIDC token for a short-lived publish credential, and CI releases carry provenance.

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

2. Run **Release SDK** from the Actions tab on `main`. With nothing left to publish, Tegami opens or updates a version PR on `tegami/sdk-version-packages`. It moves every SDK package to the next `alpha` version and writes the publish lock.
3. Merge the version PR, then run **Release SDK** again. It publishes the new versions to `alpha`, tags `sdk@<version>` and creates a GitHub release. It skips any version already on npm, so you can rerun a failed run.

Before the first stable release, remove `tag` from each package's `publishConfig` and `prerelease` from the `sdk` group in `tools/ci/sdk-release.ts`. Stable versions publish to `latest`.
