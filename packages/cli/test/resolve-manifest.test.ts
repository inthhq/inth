import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

import { resolveManifest } from "../scripts/resolve-manifest.ts";

it("finds license manifests for Clack dependencies with private package.json exports", () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const clack = path.dirname(resolveManifest("@clack/prompts", root));
  const require = createRequire(path.join(clack, "package.json"));
  expect(() => require.resolve("fast-string-width/package.json")).toThrow();
  const filename = resolveManifest("fast-string-width", clack);
  expect(JSON.parse(readFileSync(filename, "utf-8")).name).toBe(
    "fast-string-width"
  );
  expect(() => resolveManifest("missing-inth-test-package", root)).toThrow();
});
