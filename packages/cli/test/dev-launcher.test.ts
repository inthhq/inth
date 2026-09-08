import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { expect, it } from "vitest";

it("explains how to build a missing development executable", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "inth-launcher-"));
  try {
    const scripts = path.join(directory, "scripts");
    await mkdir(scripts);
    const launcher = path.join(scripts, "run-native.mjs");
    await copyFile(
      new URL("../scripts/run-native.js", import.meta.url),
      launcher
    );
    const result = spawnSync(process.execPath, [launcher, "--help"], {
      encoding: "utf-8",
      timeout: 5000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      "Inth has not been built. Run pnpm --filter @inth/cli build, then retry.\n"
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
