import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";

import { z } from "zod";

export const verifyTelemetry = async (
  binary: string,
  production = true
): Promise<void> => {
  const directory = await mkdtemp(`${os.tmpdir()}/inth-telemetry-cli-`);
  try {
    const run = (action: string, disabled = "", ci = ""): boolean => {
      const result = spawnSync(binary, ["telemetry", action, "--json"], {
        encoding: "utf-8",
        env: {
          ...process.env,
          APPDATA: directory,
          CI: ci,
          HOME: directory,
          INTH_TELEMETRY_DISABLED: disabled,
          NODE_ENV: "production",
          USERPROFILE: directory,
          XDG_STATE_HOME: directory,
        },
        timeout: 5000,
      });
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stderr, "");
      const output = z
        .object({
          data: z.object({ enabled: z.boolean() }),
          ok: z.literal(true),
          schemaVersion: z.literal(2),
        })
        .parse(JSON.parse(result.stdout));
      return output.data.enabled;
    };
    assert.equal(run("status"), production);
    assert.equal(run("disable"), false);
    assert.equal(run("status"), false);
    assert.equal(run("enable"), production);
    assert.equal(run("status"), production);
    assert.equal(run("status", "1"), false);
    assert.equal(run("status", "", "true"), false);
    assert.equal(run("status", "0", "false"), production);
    assert.equal(run("disable"), false);
    assert.equal(run("status"), false);
    console.log(
      "Native telemetry commands: saved preferences, JSON output, environment and CI overrides passed."
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
};
