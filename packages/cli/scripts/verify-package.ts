import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { HELP } from "../src/help.ts";
import { verifyJson } from "./json-checks.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(path.join(os.tmpdir(), "inth-native-package-"));
try {
  const packed = spawnSync("pnpm", ["pack", "--pack-destination", temporary], {
    cwd: root,
    encoding: "utf-8",
    timeout: 120_000,
  });
  assert.equal(packed.status, 0, packed.stderr || packed.stdout);
  const names = await readdir(temporary);
  const archives = names.filter((name) => name.endsWith(".tgz"));
  assert.equal(archives.length, 1);
  const [archive] = archives;
  assert.ok(archive);
  const extracted = spawnSync(
    "tar",
    ["-xzf", path.join(temporary, archive), "-C", temporary],
    { encoding: "utf-8", timeout: 10_000 }
  );
  assert.equal(extracted.status, 0, extracted.stderr);
  const directory = path.join(temporary, "package");
  const manifest = z
    .object({
      bin: z.object({ inth: z.literal("dist/inth") }),
      cpu: z.array(z.string()),
      dependencies: z.record(z.string(), z.string()).optional(),
      os: z.array(z.string()),
    })
    .parse(
      JSON.parse(await readFile(path.join(directory, "package.json"), "utf-8"))
    );
  assert.deepEqual(manifest.os, ["darwin"]);
  assert.deepEqual(manifest.cpu, ["arm64"]);
  assert.equal(Object.keys(manifest.dependencies ?? {}).length, 0);
  assert.deepEqual(await readdir(path.join(directory, "dist")), ["inth"]);
  const binary = path.join(directory, manifest.bin.inth);
  const info = await stat(binary);
  // eslint-disable-next-line no-bitwise -- Check the executable permission bits preserved by packing.
  assert.ok(info.mode & 0o111, "Packed binary must be executable.");
  const contents = await readFile(binary);
  assert.equal(
    contents.subarray(0, 4).toString("hex"),
    "cffaedfe",
    "Package must contain a native Mach-O executable, not a Node launcher."
  );
  const help = spawnSync(binary, ["--help"], {
    cwd: temporary,
    encoding: "utf-8",
    env: { ...process.env, PATH: "" },
    timeout: 5000,
  });
  assert.equal(help.status, 0, help.stderr);
  assert.equal(help.stdout.trim(), HELP);
  verifyJson(binary);
  console.log(
    "Packed inth is the native executable: executable mode, platform metadata, no runtime npm dependencies, PATH-empty startup and JSON commands passed."
  );
} finally {
  await rm(temporary, { force: true, recursive: true });
}
