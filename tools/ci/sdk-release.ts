// Tegami for the SDK: @inth/sdk and the framework packages in packages/sdk.
// It keeps its changelogs and publish lock in .tegami/sdk, apart from the
// CLI's (packages/cli/scripts/tegami.ts), and publishes from release-sdk.yml.
// Run it as `pnpm tegami:sdk <command>`. See .tegami/sdk/README.md.
import { fileURLToPath } from "node:url";

import { tegami } from "tegami";
import { runCli } from "tegami/cli";
import { github } from "tegami/plugins/github";

import { sdkDistTag } from "./sdk-pack.ts";

/** The packages that publish to npm. */
export const sdkPublished = [
  "angular",
  "astro",
  "integrations",
  "nextjs",
  "nuxt",
  "react",
  "sdk",
  "svelte",
  "tanstack-start",
  "vue",
].map((name) => `@inth/${name}`);

/**
 * The private parts @inth/sdk copies into lib/. They never publish, but each
 * build writes its own version into the code @inth/sdk ships, so they take
 * every version bump with the published packages.
 */
export const sdkParts = [
  "browser",
  "core",
  "dev-tools",
  "iab",
  "schema",
  "translations",
  "ui",
].map((name) => `@inth/sdk-${name}`);

const sdkNames = [...sdkPublished, ...sdkParts];

// Tegami tests each pattern against the name and the id ("npm:<name>").
export const sdkReleaseIgnore = [
  "inth",
  new RegExp(
    `^(?!(?:[a-z]+:)?(?:${sdkNames.map((name) => name.replace("/", "\\/")).join("|")})$)`,
    "u"
  ),
];

export const createSdkRelease = (
  cwd = fileURLToPath(new URL("../../", import.meta.url))
) =>
  tegami({
    changelogDir: ".tegami/sdk",
    cwd,
    groups: {
      sdk: {
        npm: { distTag: sdkDistTag },
        prerelease: sdkDistTag,
        syncBump: true,
        syncGitTag: true,
      },
    },
    ignore: sdkReleaseIgnore,
    npm: {
      client: "pnpm",
      trustedPublish: { provider: "github", workflow: "release-sdk.yml" },
      updateLockFile: true,
    },
    packages: (pkg) =>
      sdkNames.includes(pkg.name) ? { group: "sdk" } : undefined,
    plugins: [
      github({
        repo: "inthhq/inth",
        versionPr: { base: "main", branch: "tegami/sdk-version-packages" },
      }),
    ],
  });

if (import.meta.main) {
  await runCli(createSdkRelease());
}
