import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { summarize } from "./benchmark-stats.ts";
import { packageVersion } from "./runtime-versions.ts";

process.env.INTH_TELEMETRY_DISABLED = "1";

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
const nodeReference = path.join(root, "build/node/experiments/node/inth.js");

// Bun is optional: it is not a repo dependency, but a compiled-Bun build is
// the shape most native-feeling TypeScript CLIs ship today, so measure it when
// the machine has it.
// Targets run with an empty PATH, so resolve Bun's absolute path up front.
// Newline-separated so an install path containing spaces survives the split.
const bunLookup = spawnSync(
  "bun",
  ["-e", "console.log(Bun.version); console.log(process.execPath)"],
  { encoding: "utf-8" }
);
const [bunVersion, bunPath] =
  bunLookup.status === 0 ? bunLookup.stdout.trim().split("\n") : [];
const bunBinary = path.join(root, "dist-bin/bun/inth");
const bunBytecodeBinary = path.join(root, "dist-bin/bun/inth-bytecode");
if (bunVersion) {
  const bunBuild = spawnSync(
    "bun",
    ["build", nodeReference, "--compile", "--outfile", bunBinary],
    { cwd: root, stdio: "inherit" }
  );
  assert.equal(bunBuild.status, 0, "Bun CLI build failed.");
  // Bytecode skips parsing the bundle at startup; Bun's documented startup
  // optimization for compiled executables.
  const bunBytecodeBuild = spawnSync(
    "bun",
    [
      "build",
      nodeReference,
      "--compile",
      "--bytecode",
      "--format=esm",
      "--outfile",
      bunBytecodeBinary,
    ],
    { cwd: root, stdio: "inherit" }
  );
  assert.equal(bunBytecodeBuild.status, 0, "Bun bytecode CLI build failed.");
}
const bunTargets =
  bunVersion && bunPath
    ? [
        {
          args: [nodeReference, "--help"],
          executable: bunPath,
          name: "Bun CLI",
        },
        {
          args: ["--help"],
          executable: bunBinary,
          name: "Bun --compile CLI",
        },
        {
          args: ["--help"],
          executable: bunBytecodeBinary,
          name: "Bun --compile --bytecode CLI",
        },
      ]
    : [];

// Stage the layout `npm install -g @inth/cli` produces, so the launcher target
// runs the published bin (run-published.js) resolving a platform package, not
// the development helper.
const launcherRoot = path.join(root, "dist-bin/launcher");
const platformPackage = path.join(
  launcherRoot,
  "node_modules/@inth",
  `cli-${process.platform}-${process.arch}/bin`
);
const launcherScripts = path.join(
  launcherRoot,
  "node_modules/@inth/cli/scripts"
);
await mkdir(platformPackage, { recursive: true });
await mkdir(launcherScripts, { recursive: true });
await cp(binary, path.join(platformPackage, path.basename(binary)));
await cp(
  path.join(root, "scripts/run-published.js"),
  path.join(launcherScripts, "run-published.js")
);
await writeFile(
  path.join(launcherRoot, "node_modules/@inth/cli/package.json"),
  '{"name":"@inth/cli","type":"module"}\n'
);
const targets = [
  ...bunTargets,
  {
    args: ["--help"],
    executable: path.join(root, "dist-bin/yao/inth"),
    name: "yao-pkg CLI",
  },
  { args: ["--help"], executable: binary, name: "Scriptc CLI" },
  {
    args: [nodeReference, "--help"],
    executable: process.execPath,
    name: "Node CLI",
  },
  // What `npm install -g @inth/cli` users run: the published Node launcher
  // spawning the native binary. This time includes the child process.
  {
    args: [path.join(launcherScripts, "run-published.js"), "--help"],
    executable: process.execPath,
    name: "Scriptc CLI via npm launcher",
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
  const stats = summarize(sorted);
  return { median_ms: stats.median, p95_ms: stats.p95, target: target.name };
});
const sizeOf = async (file: string): Promise<number> => {
  const info = await stat(file);
  return info.size;
};
const report = {
  binary_bytes: await sizeOf(binary),
  bun: bunVersion ?? null,
  bun_binary_bytes: bunVersion ? await sizeOf(bunBinary) : null,
  bun_bytecode_binary_bytes: bunVersion
    ? await sizeOf(bunBytecodeBinary)
    : null,
  compiler: `scriptc@${packageVersion("scriptc")}`,
  cpu: os.cpus()[0]?.model,
  dynamic_runtime: false,
  iterations: 100,
  measured_at: new Date().toISOString(),
  node: process.version,
  platform: `${process.platform} ${process.arch}`,
  results,
  scope:
    "Interleaved fresh-process --help latency with warm filesystem caches and spawn overhead. Every target contains auth, API, and organization commands and shares help text. Help does not execute authentication. Each target's output is checked for consistency across its own runs; runtime adapters differ, so this does not isolate compiler performance. The npm launcher target runs the published run-published.js against a staged platform package, and its time includes the native child. The Bun targets run the Node reference under Bun, as a `bun build --compile` binary, and as a `--compile --bytecode --format=esm` binary; they are skipped when Bun is not installed.",
  warmups: 10,
  yao_binary_bytes: await sizeOf(path.join(root, "dist-bin/yao/inth")),
};
await writeFile(
  path.join(root, "bench/startup-results.json"),
  `${JSON.stringify(report, null, 2)}\n`
);
console.log(JSON.stringify(report, null, 2));
