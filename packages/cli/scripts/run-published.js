#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const packageName = `@inth/cli-${process.platform}-${process.arch}`;
const executable = process.platform === "win32" ? "inth.exe" : "inth";
const require = createRequire(import.meta.url);
let binary;
try {
  binary = require.resolve(`${packageName}/bin/${executable}`);
} catch {
  console.error(
    `Inth could not find ${packageName}. Reinstall @inth/cli with optional dependencies enabled. Supported platforms are Apple silicon Macs, Linux arm64/x64, and Windows x64.`
  );
  process.exit(1);
}

const result = spawnSync(binary, process.argv.slice(2), { stdio: "inherit" });
if (result.error) {
  console.error(`Could not start Inth: ${result.error.message}`);
  process.exit(1);
}
if (result.signal) {
  process.kill(process.pid, result.signal);
} else {
  process.exitCode = result.status ?? 1;
}
