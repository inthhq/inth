// Runs the scriptc compiler from @scriptc/compiler under Node. The prebuilt
// scriptc executable embeds the same compiler, but only the JavaScript build can
// carry patches/@scriptc__compiler@0.2.2.patch. Usage matches `scriptc`.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import {
  analyze,
  compile,
  compileLibrary,
  resolveProvenanceSources,
  sourceTargetPlatform,
  warmNativeCaches,
} from "@scriptc/compiler";
import { runCli } from "@scriptc/compiler/cli/command";

// SAFETY: The compiler package manifest always declares a string version.
const manifest = JSON.parse(
  readFileSync(
    new URL("../package.json", import.meta.resolve("@scriptc/compiler")),
    "utf-8"
  )
) as { version: string };

process.exitCode = await runCli(process.argv.slice(2), {
  analyze: (entry, options) => Promise.resolve(analyze(entry, options)),
  compile,
  compileLibrary,
  resolveProvenanceSources,
  run: (binary) =>
    Promise.resolve(spawnSync(binary, { stdio: "inherit" }).status ?? 1),
  sourceTargetPlatform: () => sourceTargetPlatform(),
  version: () => manifest.version,
  warmNativeCaches,
});
