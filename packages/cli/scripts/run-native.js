#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Development helper only. Distributed npm packages point straight at a native executable.
const binary = fileURLToPath(
  new URL(
    process.platform === "win32" ? "../dist/inth.exe" : "../dist/inth",
    import.meta.url
  )
);
const result = spawnSync(binary, process.argv.slice(2), { stdio: "inherit" });
if (result.error) {
  console.error(
    result.error.code === "ENOENT"
      ? "Inth has not been built. Run pnpm --filter @inth/cli build, then retry."
      : `Could not start Inth: ${result.error.message}`
  );
  process.exit(1);
}
process.exitCode = result.status ?? 1;
