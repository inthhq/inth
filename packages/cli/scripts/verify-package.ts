import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { HELP } from "../src/help.ts";
import { verifyJson } from "./json-checks.ts";
import { verifyMcp } from "./mcp-checks.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(path.join(os.tmpdir(), "inth-native-package-"));
try {
  for (const script of ["build-scriptc.ts", "package-native.ts"]) {
    const result = spawnSync(
      process.execPath,
      [path.join(root, "scripts", script)],
      { cwd: root, encoding: "utf-8", timeout: 600_000 }
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
  const source = z
    .object({ version: z.string() })
    .parse(
      JSON.parse(await readFile(path.join(root, "package.json"), "utf-8"))
    );
  const archive = path.join(
    root,
    "artifacts",
    `inth-cli-${process.platform}-${process.arch}-${source.version}.tgz`
  );
  const extracted = spawnSync("tar", ["-xzf", archive, "-C", temporary], {
    encoding: "utf-8",
    timeout: 10_000,
  });
  assert.equal(extracted.status, 0, extracted.stderr);
  const directory = path.join(temporary, "package");
  const manifest = z
    .object({
      bin: z.object({ inth: z.string() }),
      cpu: z.array(z.string()),
      dependencies: z.record(z.string(), z.string()).optional(),
      name: z.string(),
      os: z.array(z.string()),
    })
    .parse(
      JSON.parse(await readFile(path.join(directory, "package.json"), "utf-8"))
    );
  assert.equal(manifest.name, `@inth/cli-${process.platform}-${process.arch}`);
  assert.deepEqual(manifest.os, [process.platform]);
  assert.deepEqual(manifest.cpu, [process.arch]);
  assert.equal(Object.keys(manifest.dependencies ?? {}).length, 0);
  const binary = path.join(directory, manifest.bin.inth);
  const contents = await readFile(binary);
  let magic = "4d5a";
  if (process.platform === "darwin") {
    magic = "cffaedfe";
  }
  if (process.platform === "linux") {
    magic = "7f454c46";
  }
  assert.equal(
    contents.subarray(0, magic.length / 2).toString("hex"),
    magic,
    "Package must contain the target's native executable."
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
  await verifyMcp(binary);
  console.log(
    "Native package passed: platform metadata, executable format, no runtime npm dependencies, startup without Node on PATH, JSON and MCP commands."
  );
} finally {
  await rm(temporary, { force: true, recursive: true });
}
