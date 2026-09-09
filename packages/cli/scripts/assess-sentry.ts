import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import { z } from "zod";

const root = fileURLToPath(new URL("../", import.meta.url));
const experiment = path.join(root, "experiments", "sentry");
const require = createRequire(import.meta.url);
const invoke = (entry: string, args: string[]) =>
  spawnSync(process.execPath, [require.resolve(entry), ...args], {
    cwd: experiment,
    encoding: "utf-8",
    timeout: 120_000,
  });

for (const action of ["sync", "verify"]) {
  const result = invoke("inrepo/dist/cli.mjs", [
    action,
    "--yes",
    "--no-telemetry",
  ]);
  if (result.status !== 0) {
    throw new Error(
      `inrepo ${action} failed: ${result.stderr || result.stdout}`
    );
  }
}

const preflight = invoke("typescript/bin/tsc", ["-p", "tsconfig.json"]);
if (preflight.status !== 0) {
  throw new Error(
    `Sentry source does not typecheck: ${preflight.stdout}${preflight.stderr}`
  );
}

const baselinePath = path.join(root, "build", "sentry-core-probe.mjs");
await mkdir(path.dirname(baselinePath), { recursive: true });
await build({
  absWorkingDir: experiment,
  bundle: true,
  define: { __DEBUG_BUILD__: "false" },
  entryPoints: ["core-probe.ts"],
  format: "esm",
  outfile: baselinePath,
  platform: "node",
  tsconfig: "tsconfig.json",
});
const baseline = spawnSync(process.execPath, [baselinePath], {
  encoding: "utf-8",
  timeout: 10_000,
});
if (baseline.status !== 0) {
  throw new Error(
    `Sentry Node baseline failed: ${baseline.stdout}${baseline.stderr}`
  );
}

const probes = ["core-probe.ts", "stack-probe.ts"].map((entry) => {
  const result = invoke("scriptc/dist/bootstrap.js", [
    "build",
    entry,
    "--emit=ir",
  ]);
  if (result.error || result.signal) {
    throw new Error(`The compiler did not finish ${entry}.`);
  }
  return {
    compiler_exit_code: result.status,
    diagnostics: `${result.stdout}${result.stderr}`.replaceAll(
      experiment,
      "<experiment>"
    ),
    entry,
  };
});

const lock = z
  .object({
    modules: z.record(z.string(), z.object({ commit: z.string() })),
  })
  .parse(
    JSON.parse(
      await readFile(path.join(experiment, "inrepo.lock.json"), "utf-8")
    )
  );
const report = {
  compiler: "scriptc@0.0.36",
  dynamic_runtime: false,
  network_delivery_tested: false,
  node_capture_and_flush: "passed",
  probes,
  sdk: "@sentry/core@10.73.0",
  source_commits: lock.modules,
  source_typecheck: "passed",
  vendor_verify: "passed",
};
await writeFile(
  path.join(experiment, "assessment.json"),
  `${JSON.stringify(report, null, 2)}\n`
);
const failed = probes.some((probe) => probe.compiler_exit_code !== 0);
console.log(
  failed
    ? "Sentry captures and flushes under Node, but static compilation fails. See experiments/sentry/assessment.json."
    : "Both Sentry probes compiled statically. Native execution still needs verification."
);
// A rejected compilation remains a failed check, including for research probes.
process.exitCode = failed ? 1 : 0;
