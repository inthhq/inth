import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { verifyPackageDocs } from "./docs-checks.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(path.join(os.tmpdir(), "inth-docs-package-"));
try {
  // Exercise prepack and the actual files allowlist without a native build.
  const packed = spawnSync("pnpm", ["pack", "--pack-destination", temporary], {
    cwd: root,
    encoding: "utf-8",
    shell: process.platform === "win32",
    timeout: 60_000,
  });
  assert.equal(packed.status, 0, `${packed.stderr}\n${packed.stdout}`);
  const files = await readdir(temporary);
  const archives = files.filter((name) => name.endsWith(".tgz"));
  assert.equal(archives.length, 1);
  const [archive] = archives;
  assert.ok(archive);
  const extracted = spawnSync(
    "tar",
    ["-xzf", path.join(temporary, archive), "-C", temporary],
    {
      encoding: "utf-8",
      timeout: 10_000,
    }
  );
  assert.equal(extracted.status, 0, extracted.stderr);
  await verifyPackageDocs(path.join(temporary, "package"));
  console.log(
    "Package docs verified: index, skill, every topic, and local links."
  );
} finally {
  await rm(temporary, { force: true, recursive: true });
}
