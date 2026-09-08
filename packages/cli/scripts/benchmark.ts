import { spawnSync } from "node:child_process";
import { mkdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { summarize } from "./benchmark-stats.ts";
import { packageVersion, YAO_NODE_VERSION } from "./runtime-versions.ts";

process.env.INTH_TELEMETRY_DISABLED = "1";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = path.join(root, "dist");
await mkdir(dist, { recursive: true });
const native = path.join(
  dist,
  process.platform === "win32" ? "startup-probe.exe" : "startup-probe"
);
const build = spawnSync(
  "pnpm",
  ["exec", "scriptc", "build", "bench/startup.ts", "-o", native],
  { cwd: root, encoding: "utf-8" }
);
if (build.status !== 0) {
  throw new Error(build.stderr || build.stdout || "Scriptc build failed");
}
const buildNode = spawnSync("pnpm", ["build:node"], {
  cwd: root,
  encoding: "utf-8",
});
if (buildNode.status !== 0) {
  throw new Error(buildNode.stderr || buildNode.stdout || "Node build failed");
}

const buildYao = spawnSync(
  process.execPath,
  [path.join(root, "scripts", "build-yao.ts")],
  { cwd: root, encoding: "utf-8" }
);
if (buildYao.status !== 0) {
  throw new Error(buildYao.stderr || buildYao.stdout || "yao-pkg build failed");
}
const yao = path.join(
  root,
  "dist-bin",
  "yao",
  process.platform === "win32" ? "inth.exe" : "inth"
);

interface Target {
  name: string;
  executable: string;
  args: string[];
}
const targets: Target[] = [
  { args: ["--help"], executable: yao, name: "yao-pkg complete CLI" },
  {
    args: [path.join(root, "build/node/experiments/node/inth.js"), "--help"],
    executable: process.execPath,
    name: "Node CLI",
  },
  {
    args: [path.join(root, "bench", "startup.ts"), "--help"],
    executable: process.execPath,
    name: "Node same-source probe",
  },
  { args: ["--help"], executable: native, name: "Scriptc static probe" },
];
const iterations = 100;
const warmups = 10;
const samples: number[][] = targets.map(() => []);
let expected = "";
for (let round = 0; round < iterations + warmups; round += 1) {
  // Interleave runs and alternate order to reduce drift from thermal or background load.
  const indices = targets.map((_, index) => index);
  const order = round % 2 === 0 ? indices : indices.toReversed();
  for (const index of order) {
    const target = targets[index];
    const measurements = samples[index];
    if (!target || !measurements) {
      throw new Error("Invalid benchmark target");
    }
    const started = performance.now();
    const result = spawnSync(target.executable, target.args, {
      cwd: root,
      encoding: "utf-8",
      timeout: 10_000,
    });
    const elapsed = performance.now() - started;
    if (result.status !== 0 || result.stderr) {
      throw new Error(`Benchmark failed for ${target.name}: ${result.stderr}`);
    }
    expected ||= result.stdout;
    if (result.stdout !== expected) {
      throw new Error(`Output differs for ${target.name}`);
    }
    if (round >= warmups) {
      measurements.push(elapsed);
    }
  }
}
const results = targets.map((target, index) => {
  const sorted = samples[index]?.toSorted((a, b) => a - b);
  if (!sorted) {
    throw new Error("Missing benchmark samples");
  }
  const stats = summarize(sorted);
  return {
    median_ms: stats.median,
    p95_ms: stats.p95,
    target: target.name,
  };
});
const nativeStat = await stat(native);
const yaoStat = await stat(yao);
const report = {
  cpu: os.cpus()[0]?.model,
  iterations,
  measured_at: new Date().toISOString(),
  native_bytes: nativeStat.size,
  node: process.version,
  os_release: os.release(),
  platform: `${process.platform} ${process.arch}`,
  results,
  scope:
    "Warm filesystem, fresh-process --help latency including spawn overhead. Static probe prints the real CLI help but excludes auth, HTTP, validation and credential storage. Node same-source probe includes Node TypeScript stripping. No native auth or CPU-throughput claim.",
  scriptc: packageVersion("scriptc"),
  warmups,
  yao_bytes: yaoStat.size,
  yao_node: YAO_NODE_VERSION,
  yao_pkg: packageVersion("@yao-pkg/pkg"),
};
await writeFile(
  path.join(root, "bench", "results.json"),
  `${JSON.stringify(report, null, 2)}\n`
);
console.log(JSON.stringify(report, null, 2));
