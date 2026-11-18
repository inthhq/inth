// Tegami for the SDK: the @inth packages in packages/sdk. The public ones
// publish to npm. The private @inth/sdk-* parts never publish, but take every
// version bump, because each build writes its version into the code @inth/sdk
// ships. Run it as `pnpm tegami:sdk <command>`; the workflow runs
// `pnpm tegami:sdk release`. See .tegami/sdk/README.md.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { tegami } from "tegami";
import type { TegamiPlugin } from "tegami";
import { createCli } from "tegami/cli";
import { github } from "tegami/plugins/github";

type Dependencies = Record<string, string>;

/** The repository that publishes the SDK, as GitHub and npm name it. */
export const sdkRepo = "inthhq/inth";

export interface Manifest {
  name: string;
  version?: string;
  private?: boolean;
  publishConfig?: { access?: string; tag?: string };
  imports?: unknown;
  repository?: { url?: string };
  files?: string[];
  main?: string;
  module?: string;
  types?: string;
  exports?: unknown;
  dependencies?: Dependencies;
  peerDependencies?: Dependencies;
  optionalDependencies?: Dependencies;
  devDependencies?: Dependencies;
}

export const readManifest = (dir: string): Manifest =>
  JSON.parse(readFileSync(path.join(dir, "package.json"), "utf-8"));

/** Every package the SDK release versions, as directory and manifest. */
export const sdkPackages = (root: string) => {
  const directory = path.join(root, "packages/sdk");
  return readdirSync(directory, { withFileTypes: true })
    .map((entry) => path.join(directory, entry.name))
    .filter((dir) => existsSync(path.join(dir, "package.json")))
    .map((dir) => ({ dir, manifest: readManifest(dir) }))
    .filter(({ manifest }) => manifest.name.startsWith("@inth/"));
};

// Tegami rewrites every workspace package.json with two spaces. The SDK
// keeps tabs and sorted keys, which `pnpm sdk:fmt:check` enforces.
const formatManifests: TegamiPlugin = {
  applyDraft() {
    execFileSync("pnpm", ["sdk:fmt"], { cwd: this.cwd, stdio: "inherit" });
  },
  enforce: "post",
  name: "sdk-format-manifests",
};

export const createSdkRelease = (
  cwd = fileURLToPath(new URL("../../", import.meta.url))
) => {
  const packages = sdkPackages(cwd);
  const names = packages.map(({ manifest }) => manifest.name);
  return tegami({
    changelogDir: ".tegami/sdk",
    cwd,
    // Each package's publishConfig.tag sets its dist-tag.
    groups: { sdk: { prerelease: "alpha", syncBump: true, syncGitTag: true } },
    // Tegami tests each pattern against the name and the id ("npm:<name>").
    ignore: [
      new RegExp(
        `^(?!(?:[a-z]+:)?(?:${names.map((name) => name.replace("/", "\\/")).join("|")})$)`,
        "u"
      ),
    ],
    npm: {
      // syncBump moves the SDK packages together. Nothing else follows them.
      bumpDep: () => false,
      client: "pnpm",
      trustedPublish: { provider: "github", workflow: "release-sdk.yml" },
      updateLockFile: true,
    },
    packages: (pkg) =>
      names.includes(pkg.name) ? { group: "sdk" } : undefined,
    plugins: [
      formatManifests,
      github({
        repo: sdkRepo,
        versionPr: { base: "main", branch: "tegami/sdk-version-packages" },
      }),
    ],
  });
};

/**
 * The Tegami command `release` runs. `tegami ci` drafts a new version before
 * it publishes, so a pending release is finished first. `--dry-run` passes
 * through, and only `publish` accepts it.
 */
export const releaseArgv = (status: string, args: string[]) => [
  status === "pending" ? "publish" : "ci",
  ...args,
];

if (import.meta.main) {
  const release = createSdkRelease();
  const [command = "", ...args] = process.argv.slice(2);
  let argv = process.argv.slice(2);
  if (command === "release") {
    // A failed status check throws here, so the run fails before versioning.
    const { status } = await release.getPublishStatus();
    argv = releaseArgv(status, args);
  }
  await createCli(release).parseAsync(argv);
}
