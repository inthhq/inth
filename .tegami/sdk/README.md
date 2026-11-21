# Publishing the SDK

`.github/workflows/release-sdk.yml` publishes the public `@inth` packages in `packages/sdk`: `@inth/sdk`, the nine framework packages built on it, and the server client `@inth/node`. They release apart from the CLI, with their own changelogs and publish lock in this folder. The Tegami config is `tools/ci/sdk-release.ts`.

The SDK packages share one version. A prerelease goes to the dist-tag its version names, so `0.0.0-alpha.0` goes to `alpha`, and each package's `publishConfig.tag` must say the same. Users install with the tag, such as `npm install @inth/react@alpha`.

The private `@inth/sdk-*` packages never publish. `@inth/sdk` copies their built files into `lib/`. They still take every version bump, because each build writes its version into the code `@inth/sdk` ships. The SDK sends that version to the backend in the `x-inth-version` header and the `v` parameter.

## Rehearse a publish

Use Node.js 24, the version `.node-version` pins, and Bun 1.3.11, which the SDK's build scripts run with. Build the packages, then pack them into a new folder:

```sh
pnpm install --frozen-lockfile
pnpm turbo run build build:docs --filter='./packages/sdk/*'
pnpm sdk:pack --out /tmp/inth-sdk-tarballs
```

`pnpm sdk:pack` packs each package with `pnpm pack`, which rewrites `workspace:` ranges as `pnpm publish` does. It checks each tarball's version, publish settings, repository, dependencies, files and imports, and exits with code 1 if a check fails. It publishes nothing. It numbers the tarballs in publish order, so each package comes after the ones it depends on.

## First publish by hand

npm can only set up trusted publishing for a package that already exists, so `0.0.0-alpha.0` publishes from a maintainer's machine. It has no provenance, because npm only creates provenance in CI.

1. Check out `main`, pull it, and check that the working tree is clean. Note the commit with `git rev-parse HEAD`. Run the rehearsal above. All eleven packages must pass.
2. Run `npm login` with an account that can publish under `@inth`.
3. Publish the tarballs in order:

   ```sh
   for tarball in /tmp/inth-sdk-tarballs/*.tgz; do
     npm publish "$tarball" --access public --tag alpha || break
   done
   ```

   npm asks for a one-time password or a browser approval for each package. If a publish fails on the login, the password or the network, delete the tarballs that did publish and run the loop again.

   npm can't replace a published version. If a package's contents must change after any package has published, release all eleven as the next alpha: add a changelog, run `pnpm tegami:sdk version --no-checks` on a branch to replace the publish lock, merge it, then rehearse and publish by hand again.

4. Run `npm view @inth/react dist-tags` for each package. `alpha` must point at `0.0.0-alpha.0`. npm also points `latest` at a package's first version, whatever tag it went to, and later alphas only move `alpha`. Until the first stable release, `npm install @inth/react` with no tag installs `0.0.0-alpha.0`. `npm dist-tag add @inth/react@<version> latest` moves it.

## Turn on the workflow

1. In the repository settings, create the environment `npm-sdk`. Under **Deployment branches and tags**, allow `main` only.
2. Let the workflow publish:

   ```sh
   gh variable set SDK_RELEASE_ENABLED --body true --repo inthhq/inth
   ```

3. Run **Release SDK** from the Actions tab on `main`. Every version is on npm already, so it publishes nothing. It tags the commit it runs on as `sdk@0.0.0-alpha.0` and creates that GitHub release. If `main` has moved past the commit you packed, push the tag to that commit first, and the run then only creates the release:

   ```sh
   git tag sdk@0.0.0-alpha.0 <packed commit>
   git push origin sdk@0.0.0-alpha.0
   ```

## Release from CI

1. Add a changelog to this folder with `pnpm tegami:sdk`, or by hand as `.tegami/sdk/YYYY-MM-DD-description.md`:

   ```md
   ---
   packages:
     "group:sdk": patch
   ---

   ### Describe the change

   What changed for a site that uses the SDK.
   ```

2. Run **Release SDK** on `main`. Tegami opens or updates a version PR on `tegami/sdk-version-packages`. It moves every SDK package to the next `alpha` version and writes the publish lock.
3. The version PR's checks wait for approval, because the workflow's token opened it. Select **Approve workflows to run**, wait for the checks to pass, then merge.
4. Before the first CI release only, connect each package to the workflow, as the next section shows.
5. Run **Release SDK** again. It publishes the new versions to `alpha`, tags `sdk@<version>` and creates a GitHub release. Until every package in the publish lock is on npm and tagged, a run finishes that release and drafts nothing new.

   If a run fails partway, use **Re-run failed jobs** on that run. It builds the same commit and skips the versions already on npm. A new run would build whatever `main` is by then.

## Connect trusted publishing

npm drops a trusted publisher that hasn't published within 48 hours of its creation. Connect the packages only when the first CI release is ready to run, then run it the same day. If a connection expires, delete it in the package settings and create it again.

Do this for each of the eleven packages on npmjs.com:

1. Open the package's settings page, such as `https://www.npmjs.com/package/@inth/react/access`.
2. Under **Trusted Publisher**, select **GitHub Actions**.
3. Enter organization or user `inthhq`, repository `inth`, workflow filename `release-sdk.yml` and environment `npm-sdk`.
4. Allow it to publish with `npm publish`, not only to stage a publish. Save the connection and approve with two-factor authentication.

Or connect all eleven from a terminal, with npm 11.15 or later. At the first two-factor prompt, choose to skip it for five minutes, so the rest go through. The pause avoids npm's rate limit, and the loop stops at the first failure:

```sh
for name in sdk angular react svelte vue astro integrations nextjs nuxt tanstack-start node; do
  npm trust github "@inth/$name" --repo inthhq/inth --file release-sdk.yml --env npm-sdk --allow-publish --yes || break
  sleep 2
done
```

Either way, then open each package's settings page. Under **Publishing access**, select **Require two-factor authentication and disallow tokens**, then **Update Package Settings**. Trusted publishing still works, and no token can publish the package.

The workflow needs no npm token. npm exchanges GitHub's OIDC token for a short-lived publish credential, and CI releases carry provenance.

## Stable releases

Before the first stable release, remove `tag` from each package's `publishConfig` and `prerelease` from the `sdk` group in `tools/ci/sdk-release.ts`. Stable versions publish to `latest`.
