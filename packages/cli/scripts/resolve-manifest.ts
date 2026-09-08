import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { z } from "zod";

// Some bundled packages hide package.json through exports. Locate their manifest
// from the resolved entry so license collection still follows pnpm's dependency graph.
export const resolveManifest = (name: string, from: string): string => {
  const require = createRequire(path.join(from, "package.json"));
  try {
    return require.resolve(`${name}/package.json`);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED"
    ) {
      throw error;
    }
  }
  let directory = path.dirname(require.resolve(name));
  for (;;) {
    const filename = path.join(directory, "package.json");
    if (
      existsSync(filename) &&
      z
        .object({ name: z.string().optional() })
        .parse(JSON.parse(readFileSync(filename, "utf-8"))).name === name
    ) {
      return filename;
    }
    const parent = path.dirname(directory);
    if (parent === directory) {
      throw new Error(`Cannot locate the package manifest for ${name}.`);
    }
    directory = parent;
  }
};
