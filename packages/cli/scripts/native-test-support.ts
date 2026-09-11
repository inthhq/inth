import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import type { SpawnSyncReturns } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { nativeTarget } from "./native-target.ts";

export const root = fileURLToPath(new URL("../", import.meta.url));
export const target = nativeTarget(
  process.platform,
  process.arch,
  process.env.SCRIPTC_TARGET,
  process.env.SCRIPTC_CC
);
export const executable = (name: string): string =>
  name + (process.platform === "win32" ? ".exe" : "");
export const binary = path.join(root, "dist", executable("inth"));
export const output = path.join(
  root,
  "build",
  process.env.SCRIPTC_TARGET
    ? `native-${target.platform}-${target.arch}`
    : "native"
);
export const fixture = (name: string): string =>
  path.join(output, executable(name));
export const script = (name: string): string =>
  path.join(root, "scripts", name);

export interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Forward the child's output instead of capturing it. */
  inherit?: boolean;
  /** Expected exit status. Defaults to 0. */
  status?: number;
  timeout?: number;
}

export const run = (
  command: string,
  args: string[],
  options: RunOptions = {}
): SpawnSyncReturns<string> => {
  const expected = options.status ?? 0;
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf-8",
    env: options.env,
    stdio: options.inherit ? "inherit" : "pipe",
    timeout: options.timeout ?? 5000,
  });
  const label = [path.basename(command), ...args].join(" ");
  assert.ifError(result.error);
  assert.equal(
    result.status,
    expected,
    `${label} exited with status ${result.status}, expected ${expected}.\n${result.stderr || result.stdout || ""}`
  );
  return result;
};
