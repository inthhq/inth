import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { summarize } from "./benchmark-stats.ts";
import { packageVersion, YAO_NODE_VERSION } from "./runtime-versions.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const metrics = z.object({
  cycle_ms: z.number(),
  login_ms: z.number(),
  logout_ms: z.number(),
  refresh_ms: z.number(),
});
const targets = [
  {
    args: [],
    executable: path.join(root, "build/native/auth-bench"),
    name: `Scriptc ${packageVersion("scriptc")}`,
  },
  {
    args: [],
    executable: path.join(root, "dist-bin/yao/inth-auth-bench"),
    name: `yao-pkg ${packageVersion("@yao-pkg/pkg")} / Node ${YAO_NODE_VERSION}`,
  },
  {
    args: [path.join(root, "build/yao/dist/inth.js")],
    executable: process.execPath,
    name: `Node ${process.version} bundled JS`,
  },
];
type Sample = z.infer<typeof metrics> & { process_ms: number };
const samples: Sample[][] = targets.map(() => []);
const keys: (keyof Sample)[] = [
  "process_ms",
  "cycle_ms",
  "login_ms",
  "refresh_ms",
  "logout_ms",
];
for (let iteration = 0; iteration < 23; iteration += 1) {
  for (let offset = 0; offset < targets.length; offset += 1) {
    const index = (iteration + offset) % targets.length;
    const target = targets[index];
    const list = samples[index];
    assert.ok(target && list);
    const start = performance.now();
    const result = spawnSync(target.executable, target.args, {
      encoding: "utf-8",
      timeout: 10_000,
    });
    const elapsed = performance.now() - start;
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    const measured = metrics.parse(JSON.parse(result.stdout));
    if (iteration >= 3) {
      list.push({ ...measured, process_ms: elapsed });
    }
  }
}
const results = targets.map((target, index) => {
  const list = samples[index];
  assert.ok(list);
  const summary = Object.fromEntries(
    keys.map((key) => [key, summarize(list.map((sample) => sample[key]))])
  );
  return { samples: list, summary, target: target.name };
});
const report = {
  cpu: os.cpus()[0]?.model,
  iterations: 20,
  measured_at: new Date().toISOString(),
  node: process.version,
  platform: `${process.platform} ${process.arch}`,
  results,
  scope:
    "Interleaved fresh processes, warm filesystem caches. Same shared AuthFlow and seven-response scenario: discovery, device grant, pending, slow_down, approval, forced refresh, revocation. Real isolated macOS Keychain and production locking; fake tokens and clock skip 20 seconds of polling waits. HTTP responses are in memory, no network/browser/human approval. Node/yao use production HttpClient and Zod; Scriptc uses native parsers with an in-memory OAuthTransport. Process time includes startup, assertions, and cleanup. Phase times exclude setup and cleanup; not an isolated compiler comparison or live end-to-end login latency.",
  warmups: 3,
};
await writeFile(
  path.join(root, "bench/auth-results.json"),
  `${JSON.stringify(report, null, 2)}\n`
);
console.log(
  JSON.stringify(
    results.map(({ target, summary }) => ({ summary, target })),
    null,
    2
  )
);
