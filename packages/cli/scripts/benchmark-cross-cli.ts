// Fresh-process `--version` latency for inth next to whatever other CLIs are on
// this machine, plus an empty program per runtime as a floor. Targets that are
// not installed are skipped and listed. Run `pnpm build` first; run `pnpm bench`
// too if you want the Bun and npm-launcher rows.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  accessSync,
  constants,
  existsSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { summarize } from "./benchmark-stats.ts";
import { packageVersion } from "./runtime-versions.ts";

interface Target {
  args: string[];
  binary: string | null;
  executable: string;
  name: string;
  runtime: string;
}

const WARMUPS = 10;
const RUNS = 30;
const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const output = path.join(root, "build/cross-cli");
const env = {
  ...process.env,
  CI: "1",
  DISABLE_TELEMETRY: "1",
  DO_NOT_TRACK: "1",
  INTH_TELEMETRY_DISABLED: "1",
  NO_COLOR: "1",
  VERCEL_TELEMETRY_DISABLED: "1",
  WRANGLER_SEND_METRICS: "false",
};

const which = (name: string): string | null => {
  const result = spawnSync("which", [name], { encoding: "utf-8" });
  return result.status === 0 ? realpathSync(result.stdout.trim()) : null;
};
const firstLine = (executable: string, args: string[]): string => {
  const result = spawnSync(executable, args, { encoding: "utf-8", env });
  return (result.stdout || result.stderr).trim().split("\n")[0] ?? "";
};
const versionOf = (executable: string, args: string[] = []): string =>
  /\d+\.\d+\.\d+/u.exec(firstLine(executable, [...args, "--version"]))?.[0] ??
  "unknown";
const isScript = (file: string): boolean => /\.[cm]?js$/u.test(file);
// macOS reports the marketing version separately from the Darwin release.
const productVersion = (): string => {
  if (process.platform !== "darwin") {
    return "";
  }
  const result = spawnSync("sw_vers", ["-productVersion"], {
    encoding: "utf-8",
  });
  return result.status === 0 ? ` (${result.stdout.trim()})` : "";
};
const isExecutable = (file: string): boolean => {
  try {
    accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};
const packageRoot = (file: string): string => {
  let directory = path.dirname(file);
  while (!existsSync(path.join(directory, "package.json"))) {
    const parent = path.dirname(directory);
    assert.notEqual(parent, directory, `No package.json above ${file}`);
    directory = parent;
  }
  return directory;
};
// GoReleaser and Codex-style npm packages ship a Node shim next to (or above)
// a platform package holding the real executable. Find the executable by name.
const nativeSibling = (shim: string, name: string): string | null => {
  const visit = (directory: string, depth: number): string | null => {
    if (depth > 8) {
      return null;
    }
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        const found = visit(file, depth + 1);
        if (found) {
          return found;
        }
      } else if (entry.name === name && !isScript(file) && isExecutable(file)) {
        return file;
      }
    }
    return null;
  };
  return visit(packageRoot(shim), 0);
};

const targets: Target[] = [];
const skipped: string[] = [];
const add = (target: Target) => targets.push(target);

// Floors: one empty program per runtime.
await mkdir(output, { recursive: true });
const hello = path.join(root, "bench/cross-cli/hello.ts");
const helloScriptc = path.join(output, "hello-scriptc");
const scriptcBuild = spawnSync(
  process.execPath,
  [
    require.resolve("scriptc/dist/bootstrap.js"),
    "build",
    hello,
    "-o",
    helloScriptc,
  ],
  { cwd: root, encoding: "utf-8" }
);
assert.equal(scriptcBuild.status, 0, scriptcBuild.stderr);
add({
  args: [],
  binary: helloScriptc,
  executable: helloScriptc,
  name: "hello world",
  runtime: `Scriptc ${packageVersion("scriptc")}`,
});
const bun = which("bun");
const bunVersion = bun ? versionOf(bun) : null;
if (bun) {
  const helloBun = path.join(output, "hello-bun");
  const bunBuild = spawnSync(
    bun,
    ["build", hello, "--compile", "--outfile", helloBun],
    { cwd: root, encoding: "utf-8" }
  );
  assert.equal(bunBuild.status, 0, bunBuild.stderr);
  add({
    args: [],
    binary: helloBun,
    executable: helloBun,
    name: "hello world",
    runtime: `Bun ${bunVersion}, --compile`,
  });
} else {
  skipped.push("bun (hello world, inth under Bun)");
}
const helloNode = path.join(output, "hello.js");
await writeFile(helloNode, 'console.log("hello, world");\n');
add({
  args: [helloNode],
  binary: null,
  executable: process.execPath,
  name: "hello world",
  runtime: `Node ${process.version.slice(1)}`,
});

// inth, every way this repo can build it.
const inth = path.join(root, "dist/inth");
assert.ok(existsSync(inth), "dist/inth is missing. Run pnpm build first.");
add({
  args: ["--version"],
  binary: inth,
  executable: inth,
  name: "inth",
  runtime: "Scriptc",
});
const optional: [string, string, Target][] = [
  [
    "dist-bin/bun/inth",
    "inth, bun build --compile (run pnpm bench)",
    {
      args: ["--version"],
      binary: path.join(root, "dist-bin/bun/inth"),
      executable: path.join(root, "dist-bin/bun/inth"),
      name: "inth, --compile",
      runtime: `Bun ${bunVersion}`,
    },
  ],
  [
    "dist-bin/bun/inth-bytecode",
    "inth, bun build --compile --bytecode (run pnpm bench)",
    {
      args: ["--version"],
      binary: path.join(root, "dist-bin/bun/inth-bytecode"),
      executable: path.join(root, "dist-bin/bun/inth-bytecode"),
      name: "inth, --compile --bytecode",
      runtime: `Bun ${bunVersion}`,
    },
  ],
  [
    "dist-bin/launcher/node_modules/@inth/cli/scripts/run-published.js",
    "inth via npm launcher (run pnpm bench)",
    {
      args: [
        path.join(
          root,
          "dist-bin/launcher/node_modules/@inth/cli/scripts/run-published.js"
        ),
        "--version",
      ],
      binary: null,
      executable: process.execPath,
      name: "inth, via npm launcher",
      runtime: "Node, then Scriptc",
    },
  ],
];
for (const [file, description, target] of optional) {
  if (existsSync(path.join(root, file))) {
    add(target);
  } else {
    skipped.push(description);
  }
}
const nodeReference = path.join(root, "build/node/experiments/node/inth.js");
if (bun && existsSync(nodeReference)) {
  add({
    args: [nodeReference, "--version"],
    binary: null,
    executable: bun,
    name: "inth, source under Bun",
    runtime: `Bun ${bunVersion}`,
  });
} else if (bun) {
  skipped.push("inth, source under Bun (run pnpm build:node)");
}

// Other CLIs on this machine. Native binaries run directly; npm shims run
// under Node and, where a platform binary can be found, also bare.
const external: [string, string][] = [
  ["fx", "Zig"],
  ["claude", "Bun"],
  ["codex", "Rust"],
  ["unkey", "Go"],
  ["gh", "Go"],
];
for (const [name, language] of external) {
  const found = which(name);
  if (!found) {
    skipped.push(name);
    continue;
  }
  if (!isScript(found)) {
    let runtime = language;
    if (language === "Bun") {
      const embedded = /Bun v(?<version>\d+\.\d+\.\d+)/u.exec(
        spawnSync("strings", [found], {
          encoding: "utf-8",
          maxBuffer: 1024 ** 3,
        }).stdout
      )?.groups?.version;
      if (embedded) {
        runtime = `Bun ${embedded}`;
      }
    }
    add({
      args: ["--version"],
      binary: found,
      executable: found,
      name: `${name} ${versionOf(found)}`,
      runtime,
    });
    continue;
  }
  const version = versionOf(process.execPath, [found]);
  const bare = nativeSibling(found, name);
  if (bare) {
    add({
      args: ["--version"],
      binary: bare,
      executable: bare,
      name: `${name} ${version}, bare binary`,
      runtime: language,
    });
  }
  add({
    args: [found, "--version"],
    binary: null,
    executable: process.execPath,
    name: `${name} ${version}, via npm launcher`,
    runtime: `Node, then ${language}`,
  });
}
// Node CLIs pinned in bench/cross-cli/package.json; fall back to a global install.
for (const name of ["vercel", "wrangler"]) {
  const local = path.join(root, "bench/cross-cli/node_modules/.bin", name);
  const found = existsSync(local) ? realpathSync(local) : which(name);
  if (!found || !isScript(found)) {
    skipped.push(`${name} (npm install in bench/cross-cli)`);
    continue;
  }
  add({
    args: [found, "--version"],
    binary: null,
    executable: process.execPath,
    name: `${name} ${versionOf(process.execPath, [found])}`,
    runtime: "Node",
  });
}

// Measure. Every run shuffles the target order so drift hits everyone equally.
const samples = new Map<Target, number[]>(targets.map((t) => [t, []]));
const time = (target: Target): number => {
  const started = process.hrtime.bigint();
  const result = spawnSync(target.executable, target.args, {
    encoding: "utf-8",
    env,
    timeout: 10_000,
  });
  const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
  assert.equal(result.status, 0, `${target.name}: ${result.stderr}`);
  return elapsed;
};
for (let i = 0; i < WARMUPS; i += 1) {
  for (const target of targets) {
    time(target);
  }
}
for (let i = 0; i < RUNS; i += 1) {
  for (const target of targets.toSorted(() => Math.random() - 0.5)) {
    samples.get(target)?.push(time(target));
  }
}

const results = targets.map((target) => {
  const stats = summarize(samples.get(target) ?? []);
  return {
    args: target.args.map((a) => a.replace(os.homedir(), "~")),
    binary_bytes: target.binary ? statSync(target.binary).size : null,
    executable: target.executable.replace(os.homedir(), "~"),
    median_ms: stats.median,
    name: target.name,
    p95_ms: stats.p95,
    runtime: target.runtime,
  };
});
results.sort((a, b) => a.median_ms - b.median_ms);
const report = {
  cpu: os.cpus()[0]?.model,
  env_overrides: Object.keys(env).filter((k) => !(k in process.env)),
  measured_at: new Date().toISOString(),
  os: `${process.platform} ${os.release()}${productVersion()}`,
  results,
  runs: RUNS,
  scope:
    "Fresh-process --version latency, interleaved in random order per run, warm filesystem caches, spawn overhead included. Compares specific executables as installed on one machine; it does not isolate languages or runtimes.",
  skipped,
  warmups: WARMUPS,
};
await writeFile(
  path.join(root, "bench/cross-cli-results.json"),
  `${JSON.stringify(report, null, 2)}\n`
);

const megabytes = (bytes: number | null): string => {
  if (bytes === null) {
    return "needs runtime";
  }
  if (bytes < 1_000_000) {
    return `${Math.round(bytes / 1000)} KB`;
  }
  return `${(bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0)} MB`;
};
console.log("| Program | Runtime | Binary | Median | p95 |");
console.log("| --- | --- | --: | --: | --: |");
for (const r of results) {
  console.log(
    `| ${r.name} | ${r.runtime} | ${megabytes(r.binary_bytes)} | ${r.median_ms.toFixed(1)} ms | ${r.p95_ms.toFixed(1)} ms |`
  );
}
if (skipped.length) {
  console.log(`\nSkipped: ${skipped.join("; ")}`);
}
