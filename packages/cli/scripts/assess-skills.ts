import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

const root = fileURLToPath(new URL("../", import.meta.url));
const experiment = path.join(root, "experiments", "skills");
const logs = path.join(root, "build", "skills-assessment");
const require = createRequire(import.meta.url);
const environment = {
  ...process.env,
  DISABLE_TELEMETRY: "1",
  DO_NOT_TRACK: "1",
  NO_COLOR: "1",
};
const run = (command: string, args: string[]) =>
  spawnSync(command, args, {
    cwd: experiment,
    encoding: "utf-8",
    env: environment,
    maxBuffer: 16 * 1024 * 1024,
    timeout: 120_000,
  });
const invoke = (entry: string, args: string[]) =>
  run(process.execPath, [require.resolve(entry), ...args]);
const check = (label: string, result: ReturnType<typeof run>) => {
  if (result.status !== 0) {
    throw new Error(
      `${label} failed: ${result.error?.message ?? ""}\n${result.stdout}${result.stderr}`
    );
  }
};

for (const action of ["sync", "verify"]) {
  check(
    `inrepo ${action}`,
    invoke("inrepo/dist/cli.mjs", [action, "--yes", "--no-telemetry"])
  );
}

// npm's file-link mode also installs upstream development tooling. Packing the
// file dependency keeps this isolated probe limited to its declared dependencies.
check(
  "npm ci",
  run(process.platform === "win32" ? "npm.cmd" : "npm", [
    "ci",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--install-links",
  ])
);
check(
  "source typecheck",
  invoke("typescript/bin/tsc", ["-p", "tsconfig.json"])
);

const help = run(process.execPath, ["cli-probe.ts", "--help"]);
check("Node help", help);
if (!help.stdout.includes("skills")) {
  throw new Error("Node help did not describe the skills CLI.");
}

const fixture = await mkdtemp(path.join(tmpdir(), "inth-skills-assessment-"));
try {
  await writeFile(
    path.join(fixture, "SKILL.md"),
    "---\nname: inth-compiler-probe\ndescription: Local compiler assessment fixture.\n---\n\nOnly used to verify skill discovery.\n"
  );
  const listing = run(process.execPath, ["add-probe.ts", fixture]);
  check("Node local skill discovery", listing);
  if (!listing.stdout.includes("inth-compiler-probe")) {
    throw new Error("The Node installer did not discover the fixture skill.");
  }
} finally {
  await rm(fixture, { force: true, recursive: true });
}

await mkdir(logs, { recursive: true });
const configurations = [
  { entry: "cli-probe.ts", flags: [], name: "cli-static" },
  { entry: "add-probe.ts", flags: [], name: "add-static" },
  {
    entry: "add-probe.ts",
    flags: ["--npm-static", "auto"],
    name: "add-npm-static",
  },
  { entry: "add-probe.ts", flags: ["--dynamic"], name: "add-dynamic" },
];
const probes = [];
const logWrites = [];
const diagnosticPattern =
  /^(?<file>.+?):(?<line>\d+):(?<column>\d+) - error (?<code>SC\d+): (?<message>.+)$/gmu;
for (const { name, entry, flags } of configurations) {
  console.log(`Compiling ${name}...`);
  const result = invoke("scriptc/dist/bootstrap.js", [
    "build",
    entry,
    "--emit=ir",
    ...flags,
  ]);
  if (result.error || result.signal) {
    throw new Error(
      `Compiler did not finish ${name}: ${result.error?.message}`
    );
  }
  const output = `${result.stdout}${result.stderr}`.replaceAll(root, "<cli>/");
  logWrites.push(writeFile(path.join(logs, `${name}.log`), output));
  const counts = new Map<string, number>();
  const examples = [];
  for (const match of output.matchAll(diagnosticPattern)) {
    const { file, line, column, code, message } = match.groups ?? {};
    if (!(file && line && column && code && message)) {
      continue;
    }
    if (!counts.has(code)) {
      examples.push({
        code,
        column: Number(column),
        file,
        line: Number(line),
        message,
      });
    }
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  probes.push({
    compiler_exit_code: result.status,
    diagnostic_counts: Object.fromEntries(counts),
    entry,
    examples,
    flags,
    log: `build/skills-assessment/${name}.log`,
    name,
  });
}
await Promise.all(logWrites);

const lock = z
  .object({ modules: z.record(z.string(), z.object({ commit: z.string() })) })
  .parse(
    JSON.parse(
      await readFile(path.join(experiment, "inrepo.lock.json"), "utf-8")
    )
  );
const manifest = z.object({ version: z.string() });
const version = async (file: string) =>
  manifest.parse(JSON.parse(await readFile(file, "utf-8"))).version;
const report = {
  compiler: `scriptc@${await version(require.resolve("scriptc/package.json"))}`,
  install_tested: false,
  native_execution_tested: false,
  node: process.version,
  node_help: "passed",
  node_local_skill_discovery: "passed",
  platform: `${process.platform}-${process.arch}`,
  probes,
  source_commits: lock.modules,
  source_typecheck: "passed",
  telemetry_delivery_tested: false,
  upstream: `skills@${await version(path.join(experiment, "inrepo_modules/skills/package.json"))}`,
  vendor_tool: `inrepo@${await version(require.resolve("inrepo/package.json"))}`,
  vendor_verify: "passed",
};
await writeFile(
  path.join(experiment, "assessment.json"),
  `${JSON.stringify(report, null, 2)}\n`
);
const failed = probes.some((probe) => probe.compiler_exit_code !== 0);
console.log(
  failed
    ? "Skills runs under Node, but compilation fails. See experiments/skills/assessment.json."
    : "Compiler probes passed. Native builds and installation still need verification."
);
// A compiler rejection stays a failed check, even when expected in this experiment.
process.exitCode = failed ? 1 : 0;
