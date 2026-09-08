/* eslint-disable no-await-in-loop -- Alternate complete CLI runs to control for network drift. */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";

import { z } from "zod";

const [install] = process.argv.slice(2);
assert.ok(
  install,
  "Usage: node scripts/benchmark-vercel.ts <isolated npm install directory>"
);
assert.equal(process.platform, "darwin");
assert.equal(process.arch, "arm64");
const packages = path.resolve(install, "node_modules");
const packageVersion = z.object({ version: z.string() });
const published = packageVersion.parse(
  JSON.parse(
    await readFile(path.join(packages, "vercel/package.json"), "utf-8")
  )
).version;
const native = packageVersion.parse(
  JSON.parse(
    await readFile(
      path.join(packages, "@vercel/vc-native-darwin-arm64/package.json"),
      "utf-8"
    )
  )
).version;
assert.equal(published, native, "Compare matching Vercel releases.");
const env = {
  ...process.env,
  CI: "1",
  FORCE_HYPERLINK: "0",
  NO_COLOR: "1",
  VERCEL_CLI_USE_NATIVE_BINARY: "0",
  VERCEL_TELEMETRY_DISABLED: "1",
};
for (const key of Object.keys(env)) {
  if (
    /TOKEN|SECRET|CURSOR|NODE_OPTIONS|NODE_PATH|VERCEL_VC_NATIVE|VERCEL_TOKEN_STORAGE|VERCEL_TEST_KEYRING/u.test(
      key
    )
  ) {
    Reflect.deleteProperty(env, key);
  }
}
const targets = [
  {
    args: [path.join(packages, "vercel/dist/vc.js")],
    command: process.execPath,
    name: `vercel@${published} published Node`,
  },
  {
    args: [],
    command: path.join(packages, "@vercel/vc-native-darwin-arm64/bin/vercel"),
    name: `@vercel/vc-native-darwin-arm64@${native}`,
  },
];
const run = async (command: string, args: string[]): Promise<number> => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "inth-vercel-bench-"));
  try {
    // eslint-disable-next-line promise/avoid-new -- Adapt child-process stream and exit events.
    return await new Promise<number>((resolve, reject) => {
      const start = performance.now();
      const child = spawn(
        command,
        [...args, "login", "--global-config", directory, "--no-color"],
        { cwd: directory, env, stdio: ["pipe", "pipe", "pipe"] }
      );
      let captured = "";
      let elapsed: number | undefined;
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, 30_000);
      // Do not persist device URLs, user codes, or CLI output in benchmark artifacts.
      const output = (data: Buffer): void => {
        captured += data.toString();
        if (
          elapsed === undefined &&
          /Visit\s+(?:https:\/\/)?vercel\.com\//u.test(
            stripVTControlCharacters(captured)
          )
        ) {
          elapsed = performance.now() - start;
          child.kill("SIGKILL");
        }
      };
      child.stdout.on("data", output);
      child.stderr.on("data", output);
      child.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timeout);
        if (elapsed === undefined) {
          reject(
            new Error(
              `Vercel did not reach the approval prompt. Exit ${code}; timeout ${timedOut}. Output withheld because it may contain a device code.`
            )
          );
        } else {
          resolve(elapsed);
        }
      });
    });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
};
const samples: number[][] = targets.map(() => []);
const warmup: number[] = [];
for (let iteration = 0; iteration < 6; iteration += 1) {
  for (let offset = 0; offset < targets.length; offset += 1) {
    const index = (iteration + offset) % targets.length;
    const target = targets[index];
    const list = samples[index];
    assert.ok(target && list);
    const elapsed = await run(target.command, target.args);
    console.log(
      `${iteration === 0 ? "Warmup" : `Sample ${iteration}`} ${target.name}: ${elapsed.toFixed(1)} ms`
    );
    if (iteration > 0) {
      list.push(elapsed);
    } else {
      warmup[index] = elapsed;
    }
  }
}
const results = targets.map((target, index) => {
  const list = samples[index];
  assert.ok(list);
  const sorted = list.toSorted((a, b) => a - b);
  const version = spawnSync(target.command, [...target.args, "--version"], {
    encoding: "utf-8",
    env,
    timeout: 10_000,
  });
  assert.equal(version.status, 0);
  assert.ok(`${version.stdout}${version.stderr}`.includes(published));
  return {
    max_ms: sorted[4],
    median_ms: sorted[2],
    min_ms: sorted[0],
    samples_ms: list,
    target: target.name,
    warmup_ms: warmup[index],
  };
});
const report = {
  cpu: os.cpus()[0]?.model,
  iterations: 5,
  measured_at: new Date().toISOString(),
  node: process.version,
  platform: `${process.platform} ${process.arch}`,
  results,
  scope:
    "Interleaved fresh processes, warm filesystem and Node compile caches. Spawn to live Vercel device-approval URL printed, including startup, discovery, DNS/TLS and device authorization. CI=1 suppresses browser; terminal hyperlinks and telemetry off; fresh --global-config and cwd per run, isolating credential accounts. Published vc.js shim forced to Node, official native platform binary invoked directly. Kill immediately at prompt; no approval, token storage, refresh or logout measured. Twelve unapproved device grants including warmups. Small network-sensitive sample; no p95 claim.",
  warmups: 1,
};
const root = fileURLToPath(new URL("../", import.meta.url));
await writeFile(
  path.join(root, "bench/vercel-login-results.json"),
  `${JSON.stringify(report, null, 2)}\n`
);
console.log(JSON.stringify(results, null, 2));
