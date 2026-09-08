import { readFileSync, realpathSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

import { resolveManifest } from "../scripts/resolve-manifest.ts";

it("finds a manifest when a package hides it through exports", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "inth-manifest-test-"));
  try {
    const directory = path.join(root, "node_modules", "fixture-package");
    await mkdir(path.join(directory, "dist"), { recursive: true });
    const manifest = path.join(directory, "package.json");
    await writeFile(
      manifest,
      JSON.stringify({ exports: "./dist/index.cjs", name: "fixture-package" })
    );
    await writeFile(
      path.join(directory, "dist/index.cjs"),
      "module.exports = {};\n"
    );
    const require = createRequire(path.join(root, "package.json"));
    expect(() => require.resolve("fixture-package/package.json")).toThrow(
      "not defined by"
    );
    expect(resolveManifest("fixture-package", root)).toBe(
      realpathSync(manifest)
    );
    expect(() => resolveManifest("missing-fixture", root)).toThrow(
      "Cannot find module"
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
it("resolves the installed Clack manifest", () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  expect(
    JSON.parse(readFileSync(resolveManifest("@clack/prompts", root), "utf-8"))
      .name
  ).toBe("@clack/prompts");
});
