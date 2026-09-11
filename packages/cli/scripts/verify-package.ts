import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { HELP } from "../src/help.ts";
import { verifyPackageDocs } from "./docs-checks.ts";
import { verifyJson } from "./json-checks.ts";
import { verifyMcp } from "./mcp-checks.ts";
import { verifyTelemetry } from "./telemetry-checks.ts";

process.env.INTH_TELEMETRY_DISABLED = "1";

const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(path.join(os.tmpdir(), "inth-native-package-"));
try {
  for (const script of ["build-scriptc.ts", "package-native.ts"]) {
    const result = spawnSync(
      process.execPath,
      [
        path.join(root, "scripts", script),
        ...(script === "build-scriptc.ts" ? ["--production"] : []),
      ],
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
  await verifyPackageDocs(directory);
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
  const nativeVersion = spawnSync(binary, ["--version"], {
    cwd: temporary,
    encoding: "utf-8",
    timeout: 5000,
  });
  assert.equal(nativeVersion.status, 0, nativeVersion.stderr);
  assert.equal(nativeVersion.stdout.trim(), source.version);
  verifyJson(binary);
  await verifyMcp(binary);

  const wrapper = spawnSync("pnpm", ["pack", "--pack-destination", temporary], {
    cwd: root,
    encoding: "utf-8",
    shell: process.platform === "win32",
    timeout: 60_000,
  });
  assert.equal(wrapper.status, 0, wrapper.stderr || wrapper.stdout);
  const consumer = path.join(temporary, "consumer");
  await mkdir(consumer);
  const installed = spawnSync(
    "npm",
    [
      "install",
      "--offline",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      path.join(temporary, `inth-cli-${source.version}.tgz`),
      archive,
    ],
    {
      cwd: consumer,
      encoding: "utf-8",
      shell: process.platform === "win32",
      timeout: 60_000,
    }
  );
  assert.equal(installed.status, 0, installed.stderr || installed.stdout);
  const launched = spawnSync(
    path.join(
      consumer,
      "node_modules/.bin",
      process.platform === "win32" ? "inth.cmd" : "inth"
    ),
    ["--help"],
    {
      cwd: consumer,
      encoding: "utf-8",
      shell: process.platform === "win32",
      timeout: 5000,
    }
  );
  assert.equal(launched.status, 0, launched.stderr);
  assert.equal(launched.stdout.trim(), HELP);
  await verifyPackageDocs(path.join(consumer, "node_modules/@inth/cli"));
  const wrapperManifest = z
    .object({
      bin: z.object({ inth: z.string() }),
      optionalDependencies: z.record(z.string(), z.string()),
    })
    .parse(
      JSON.parse(
        await readFile(
          path.join(consumer, "node_modules/@inth/cli/package.json"),
          "utf-8"
        )
      )
    );
  assert.equal(wrapperManifest.bin.inth, "scripts/run-published.js");
  const wrapperVersion = spawnSync(
    process.execPath,
    [
      path.join(consumer, "node_modules/@inth/cli", wrapperManifest.bin.inth),
      "--version",
    ],
    {
      cwd: consumer,
      encoding: "utf-8",
      timeout: 5000,
    }
  );
  assert.equal(wrapperVersion.status, 0, wrapperVersion.stderr);
  assert.equal(wrapperVersion.stdout.trim(), source.version);
  assert.equal(Object.keys(wrapperManifest.optionalDependencies).length, 4);
  for (const version of Object.values(wrapperManifest.optionalDependencies)) {
    assert.equal(version, source.version);
  }
  await rm(
    path.join(
      consumer,
      "node_modules/@inth",
      `cli-${process.platform}-${process.arch}`
    ),
    { force: true, recursive: true }
  );
  const missing = spawnSync(
    process.execPath,
    [
      path.join(consumer, "node_modules/@inth/cli/scripts/run-published.js"),
      "--help",
    ],
    {
      cwd: consumer,
      encoding: "utf-8",
      timeout: 5000,
    }
  );
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /optional dependencies enabled/u);
  await verifyTelemetry(binary);
  console.log(
    "Package checks passed: native executable, JSON and MCP commands, npm installation, platform selection, and missing-binary error."
  );
} finally {
  await rm(temporary, { force: true, recursive: true });
}
