import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const build = spawnSync(
  process.execPath,
  [path.join(root, "scripts/build-scriptc.ts")],
  { stdio: "inherit" }
);
assert.equal(build.status, 0, "Native CLI build failed.");
const require = createRequire(import.meta.url);
const nodeBuild = spawnSync(
  process.execPath,
  [require.resolve("typescript/bin/tsc"), "-p", "tsconfig.build.json"],
  { cwd: root, stdio: "inherit" }
);
assert.equal(nodeBuild.status, 0, "Node CLI build failed.");
const yaoBuild = spawnSync(
  process.execPath,
  [path.join(root, "scripts/build-yao.ts")],
  { stdio: "inherit" }
);
assert.equal(yaoBuild.status, 0, "yao-pkg CLI build failed.");
const binary = path.join(root, "dist/inth");
const targets = [
  {
    args: ["--help"],
    executable: path.join(root, "dist-bin/yao/inth"),
    name: "yao-pkg CLI",
  },
  { args: ["--help"], executable: binary, name: "Scriptc CLI" },
  {
    args: [path.join(root, "build/node/experiments/node/inth.js"), "--help"],
    executable: process.execPath,
    name: "Node CLI",
  },
];
const samples: number[][] = targets.map(() => []);
const expected = targets.map(() => "");
for (let iteration = 0; iteration < 110; iteration += 1) {
  // Measure the reference in the same run to expose background load and drift.
  const order = targets.map((_, index) => (iteration + index) % targets.length);
  for (const index of order) {
    const target = targets[index];
    const measurements = samples[index];
    assert.ok(target && measurements);
    const started = performance.now();
    const result = spawnSync(target.executable, target.args, {
      encoding: "utf-8",
      env: { ...process.env, PATH: "" },
      timeout: 5000,
    });
    const elapsed = performance.now() - started;
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    expected[index] ||= result.stdout;
    assert.equal(result.stdout, expected[index]);
    if (iteration >= 10) {
      measurements.push(elapsed);
    }
  }
}
const results = targets.map((target, index) => {
  const sorted = samples[index]?.toSorted((a, b) => a - b);
  assert.ok(sorted);
  return { median_ms: sorted[50], p95_ms: sorted[94], target: target.name };
});
const info = await stat(binary);
const report = {
  binary_bytes: info.size,
  compiler: "scriptc@0.0.36",
  cpu: os.cpus()[0]?.model,
  dynamic_runtime: false,
  iterations: 100,
  measured_at: new Date().toISOString(),
  node: process.version,
  platform: `${process.platform} ${process.arch}`,
  results,
  scope:
    "Interleaved fresh-process --help latency with warm filesystem caches and spawn overhead. All three CLIs contain auth, API, and organization commands and share help text. Help does not execute authentication. Each target's output is checked for consistency; runtime adapters differ, so this does not isolate compiler performance.",
  warmups: 10,
};
await writeFile(
  path.join(root, "bench/startup-results.json"),
  `${JSON.stringify(report, null, 2)}\n`
);
console.log(JSON.stringify(report, null, 2));
