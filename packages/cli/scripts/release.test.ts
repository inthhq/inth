/* eslint-disable no-await-in-loop -- Each fixture assembles five small native archives. */
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, expect, test } from "vitest";
import { z } from "zod";

import { nativePackages, prepareRelease } from "./prepare-release.ts";
import { createRelease } from "./tegami.ts";

const repository = fileURLToPath(new URL("../../../", import.meta.url));
const roots: string[] = [];
const fixture = async (version = "0.0.0") => {
  const root = await mkdtemp(path.join(os.tmpdir(), "inth-release-test-"));
  roots.push(root);
  for (const file of [
    "package.json",
    "pnpm-workspace.yaml",
    "packages/cli/package.json",
    "packages/cli/src/version.ts",
    ...nativePackages.map((name) => `npm/${name}/package.json`),
  ]) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    const contents = await readFile(path.join(repository, file), "utf-8");
    await writeFile(
      path.join(root, file),
      contents.replace(/"version": "[^"]+"/u, `"version": "${version}"`)
    );
  }
  return root;
};

const archives = async (root: string, invalid = "") => {
  const output = path.join(root, "packages/cli/artifacts");
  await mkdir(output, { recursive: true });
  for (const name of nativePackages) {
    const manifestPath = path.join(root, "npm", name, "package.json");
    const manifest = z
      .object({ bin: z.object({ inth: z.string() }), version: z.string() })
      .parse(JSON.parse(await readFile(manifestPath, "utf-8")));
    const directory = path.join(root, "fixtures", name);
    const packagePath = path.join(directory, "package");
    await mkdir(path.join(packagePath, "bin"), { recursive: true });
    await cp(manifestPath, path.join(packagePath, "package.json"));
    let magic = "4d5a";
    if (name.includes("darwin")) {
      magic = "cffaedfe";
    }
    if (name.includes("linux")) {
      magic = "7f454c46";
    }
    await writeFile(
      path.join(packagePath, manifest.bin.inth),
      Buffer.from(name === invalid ? "00000000" : magic, "hex")
    );
    const packed = spawnSync(
      "tar",
      [
        "-czf",
        path.join(output, `inth-${name}-${manifest.version}.tgz`),
        "-C",
        directory,
        "package",
      ],
      { encoding: "utf-8" }
    );
    expect(packed.status, packed.stderr).toBe(0);
  }
};

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { force: true, recursive: true }))
  );
});

test.each([
  ["0.0.0-dev.0", "0.0.0"],
  ["0.0.0", "0.0.1"],
])("versions every platform from %s to stable %s", async (current, next) => {
  const root = await fixture(current);
  await mkdir(path.join(root, ".tegami"));
  await writeFile(
    path.join(root, ".tegami/change.md"),
    '---\npackages:\n  "@inth/cli": patch\n---\n\n### Fix a CLI command\n'
  );
  const release = createRelease(root);
  const draft = await release.draft();
  expect(draft.getPackageDrafts().size).toBe(6);
  await draft.apply();
  expect(
    await readFile(path.join(root, "packages/cli/src/version.ts"), "utf-8")
  ).toContain(`export const VERSION = "${next}";`);
  for (const file of [
    "packages/cli/package.json",
    ...nativePackages.map((name) => `npm/${name}/package.json`),
  ]) {
    const manifest = z
      .object({ version: z.string() })
      .parse(JSON.parse(await readFile(path.join(root, file), "utf-8")));
    expect(manifest.version).toBe(next);
  }
  const lock = await readFile(
    path.join(root, ".tegami/publish-lock.yaml"),
    "utf-8"
  );
  expect(lock).toContain("distTag: latest");
  const followingDraft = await createRelease(root).draft();
  expect(followingDraft.hasPending()).toBe(false);
});

test("stages all native artifacts and preserves release changelogs", async () => {
  const root = await fixture();
  await archives(root);
  const changelog = path.join(root, "npm/cli-darwin-arm64/CHANGELOG.md");
  await writeFile(changelog, "Release notes\n");
  await prepareRelease(root);
  expect(await readFile(changelog, "utf-8")).toBe("Release notes\n");
  expect(await readFile(path.join(root, "npm/cli-linux-x64/bin/inth"))).toEqual(
    Buffer.from("7f454c46", "hex")
  );
});

test("rejects an incomplete platform set before staging packages", async () => {
  const root = await fixture();
  await archives(root);
  await rm(
    path.join(root, "packages/cli/artifacts/inth-cli-win32-x64-0.0.0.tgz")
  );
  await expect(prepareRelease(root)).rejects.toThrow();
  await expect(
    readFile(path.join(root, "npm/cli-darwin-arm64/bin/inth"))
  ).rejects.toThrow();
});

test("rejects a non-native executable before staging packages", async () => {
  const root = await fixture();
  await archives(root, "cli-win32-x64");
  await expect(prepareRelease(root)).rejects.toThrow(
    "must contain a native executable"
  );
  await expect(
    readFile(path.join(root, "npm/cli-darwin-arm64/bin/inth"))
  ).rejects.toThrow();
});

test("rejects platform versions that do not match the CLI", async () => {
  const root = await fixture();
  const manifestPath = path.join(root, "npm/cli-darwin-arm64/package.json");
  const contents = await readFile(manifestPath, "utf-8");
  await writeFile(manifestPath, contents.replace('"0.0.0"', '"0.2.0"'));
  await expect(prepareRelease(root)).rejects.toThrow(
    "must match the CLI version"
  );
});
