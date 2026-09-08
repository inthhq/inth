/* eslint-disable no-await-in-loop -- Validate all five archives before staging any package. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { z } from "zod";

const manifestSchema = z.object({
  bin: z.object({ inth: z.string() }),
  cpu: z.array(z.string()),
  name: z.string(),
  os: z.array(z.string()),
  version: z.string(),
});

export const nativePackages = [
  "cli-darwin-arm64",
  "cli-darwin-x64",
  "cli-linux-arm64",
  "cli-linux-x64",
  "cli-win32-x64",
];

// Validate every archive before copying any files into the publish directories.
export const prepareRelease = async (root: string): Promise<void> => {
  const cli = z
    .object({ version: z.string() })
    .parse(
      JSON.parse(
        await readFile(path.join(root, "packages/cli/package.json"), "utf-8")
      )
    );
  const temporary = await mkdtemp(path.join(os.tmpdir(), "inth-release-"));
  try {
    for (const name of nativePackages) {
      const expected = manifestSchema.parse(
        JSON.parse(
          await readFile(path.join(root, "npm", name, "package.json"), "utf-8")
        )
      );
      assert.equal(
        expected.version,
        cli.version,
        `${name} must match the CLI version.`
      );
      const archive = path.join(
        root,
        "packages/cli/artifacts",
        `inth-${name}-${cli.version}.tgz`
      );
      const directory = path.join(temporary, name);
      await mkdir(directory);
      const result = spawnSync("tar", ["-xzf", archive, "-C", directory], {
        encoding: "utf-8",
        timeout: 30_000,
      });
      assert.equal(
        result.status,
        0,
        result.stderr || `Could not extract ${archive}`
      );
      const unpacked = path.join(directory, "package");
      const actual = manifestSchema.parse(
        JSON.parse(await readFile(path.join(unpacked, "package.json"), "utf-8"))
      );
      assert.deepEqual(
        actual,
        expected,
        `${name} artifact metadata does not match this release.`
      );
      const binary = await readFile(path.join(unpacked, expected.bin.inth));
      const magic = { darwin: "cffaedfe", linux: "7f454c46", win32: "4d5a" };
      const platform = z
        .enum(["darwin", "linux", "win32"])
        .parse(expected.os[0]);
      assert.equal(
        binary.subarray(0, magic[platform].length / 2).toString("hex"),
        magic[platform],
        `${name} must contain a native executable.`
      );
    }
    for (const name of nativePackages) {
      await cp(
        path.join(temporary, name, "package"),
        path.join(root, "npm", name),
        {
          // Keep the manifest and changelog from the version PR.
          filter: (source) =>
            !["package.json", "CHANGELOG.md"].includes(path.basename(source)),
          recursive: true,
        }
      );
    }
  } finally {
    await rm(temporary, { force: true, recursive: true });
  }
};
