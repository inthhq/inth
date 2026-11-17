import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { tegami } from "tegami";
import type { TegamiPlugin } from "tegami";
import { runCli } from "tegami/cli";
import { github } from "tegami/plugins/github";

import { nativePackages, prepareRelease } from "./prepare-release.ts";

const nativeRelease: TegamiPlugin = {
  async applyDraft(draft) {
    const [cli] = this.graph.getByName("@inth/cli");
    if (!cli) {
      throw new Error("The @inth/cli workspace package is missing.");
    }
    const version = draft.getPackageDraft(cli.id)?.bumpVersion(cli);
    if (version) {
      await writeFile(
        path.join(cli.path, "src/version.ts"),
        `// Tegami updates this constant with the package manifests.\nexport const VERSION = ${JSON.stringify(version)};\n`
      );
    }
  },
  async beforePublishAll() {
    await prepareRelease(this.cwd);
  },
  enforce: "pre",
  name: "native-release",
  publishPreflight({ pkg }) {
    if (pkg.name !== "@inth/cli") {
      return;
    }
    return {
      shouldPublish: true,
      wait: nativePackages.flatMap((name) =>
        this.graph.getByName(`@inth/${name}`).map((native) => native.id)
      ),
    };
  },
};

export const createRelease = (
  cwd = fileURLToPath(new URL("../../../", import.meta.url))
) =>
  tegami({
    cwd,
    groups: {
      inth: { npm: { distTag: "latest" }, syncBump: true, syncGitTag: true },
    },
    // Only the CLI and its native packages release from here. The SDK and
    // mobile workspaces have their own release lines and must not publish.
    // Tegami tests the pattern against the name and against the id, which
    // is the name behind a manager prefix such as "npm:".
    ignore: ["inth", /^(?!(?:[a-z]+:)?@inth\/cli(?:-[a-z0-9-]+)?$)/u],
    npm: {
      client: "pnpm",
      trustedPublish: { provider: "github", workflow: "release.yml" },
      updateLockFile: true,
    },
    packages: (pkg) =>
      ["cli", ...nativePackages].some((name) => pkg.name === `@inth/${name}`)
        ? { group: "inth" }
        : undefined,
    plugins: [
      nativeRelease,
      github({ repo: "inthhq/inth", versionPr: { base: "main" } }),
    ],
  });

if (import.meta.main) {
  await runCli(createRelease());
}
