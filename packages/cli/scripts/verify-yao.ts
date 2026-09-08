import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { HELP } from "../src/help.ts";
import { VERSION } from "../src/version.ts";
import { verifyJson } from "./json-checks.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const runKeyring = process.argv.includes("--keyring");
if (process.argv.slice(2).some((argument) => argument !== "--keyring")) {
  throw new Error("Usage: verify-yao.ts [--keyring]");
}
const fixture = spawnSync(
  process.execPath,
  [path.join(root, "scripts", "build-yao.ts"), "--smoke"],
  { cwd: root, stdio: "inherit" }
);
if (fixture.status !== 0) {
  throw new Error("Could not build the packaged auth fixture.");
}
const temporary = await mkdtemp(path.join(os.tmpdir(), "inth-binary-test-"));
const extension = process.platform === "win32" ? ".exe" : "";
const binary = path.join(temporary, `inth${extension}`);
const smoke = path.join(temporary, `inth-smoke${extension}`);
try {
  await copyFile(
    path.join(root, "dist-bin", "yao", `inth${extension}`),
    binary
  );
  await copyFile(
    path.join(root, "dist-bin", "yao", `inth-smoke${extension}`),
    smoke
  );
  verifyJson(binary);
  const run = (executable: string, args: string[]) =>
    spawnSync(executable, args, {
      cwd: temporary,
      encoding: "utf-8",
      // Neither Node nor workspace modules are available through PATH in the child.
      env: {
        ...process.env,
        INTH_TOKEN: "inth_packaged_test",
        NODE_OPTIONS: "",
        PATH: "",
      },
      timeout: 30_000,
    });
  const help = run(binary, ["--help"]);
  assert.equal(help.status, 0, help.stderr);
  assert.equal(help.stdout.trim(), HELP);
  const version = run(binary, ["--version"]);
  assert.equal(version.status, 0, version.stderr);
  assert.equal(version.stdout.trim(), VERSION);
  const login = run(binary, ["login"]);
  assert.equal(login.status, 0, login.stderr);
  assert.match(login.stdout, /No browser sign-in needed/u);
  const invalid = run(binary, ["api", "https://example.com/v1/projects"]);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Use an API path under \/v1\//u);
  const result = run(smoke, runKeyring ? ["--keyring"] : []);
  assert.equal(result.status, 0, result.stderr);
  console.log(result.stdout.trim());
  console.log(
    "Standalone CLI passed from an empty directory with PATH cleared."
  );
} finally {
  await rm(temporary, { force: true, recursive: true });
}
