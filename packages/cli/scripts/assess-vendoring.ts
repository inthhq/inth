import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

const root = fileURLToPath(new URL("../", import.meta.url));
const experiment = path.join(root, "experiments", "scriptc");
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
    `Vendored source does not typecheck: ${preflight.stdout}${preflight.stderr}`
  );
}
const compilation = invoke("scriptc/dist/bootstrap.js", [
  "build",
  "zod-source.ts",
  "--emit=ir",
]);
if (compilation.error || compilation.signal) {
  throw new Error("The compiler did not finish the vendoring assessment.");
}
const diagnostics = `${compilation.stdout}${compilation.stderr}`.replaceAll(
  experiment,
  "<experiment>"
);
const source = z
  .object({ modules: z.object({ zod: z.object({ commit: z.string() }) }) })
  .parse(
    JSON.parse(
      await readFile(path.join(experiment, "inrepo.lock.json"), "utf-8")
    )
  );
const report = {
  compiler: "scriptc@0.0.36",
  compiler_exit_code: compilation.status,
  diagnostics,
  dynamic_runtime: false,
  source: `https://github.com/colinhacks/zod/tree/${source.modules.zod.commit}/packages/zod`,
  source_typecheck: "passed",
  vendor_verify: "passed",
};
await writeFile(
  path.join(experiment, "assessment.json"),
  `${JSON.stringify(report, null, 2)}\n`
);
console.log(
  compilation.status === 0
    ? "Vendored Zod compiled statically."
    : "Vendored Zod typechecks, but static compilation still fails. See experiments/scriptc/assessment.json."
);
// A failing compiler must remain a failing check, even when it is an expected research result.
process.exitCode = compilation.status ?? 1;
