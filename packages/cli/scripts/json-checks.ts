import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { z } from "zod";

const responseSchema = z.discriminatedUnion("ok", [
  z
    .object({
      data: z.json(),
      ok: z.literal(true),
      schemaVersion: z.literal(2),
    })
    .strict(),
  z
    .object({
      error: z
        .object({
          apiCode: z.string().nullable(),
          code: z.string(),
          httpStatus: z.number().nullable(),
          message: z.string(),
          requestId: z.string().nullable(),
        })
        .strict(),
      ok: z.literal(false),
      schemaVersion: z.literal(2),
    })
    .strict(),
]);
export const verifyJson = (command: string, prefix: string[] = []): void => {
  for (const scenario of [
    { args: ["--help", "--json"], code: "", noKey: false },
    { args: ["--json", "--version"], code: "", noKey: false },
    { args: ["login", "--json"], code: "", noKey: false },
    { args: ["auth", "status", "--json"], code: "", noKey: false },
    { args: ["whoami", "extra", "--json"], code: "usage_error", noKey: false },
    { args: ["status", "--json"], code: "usage_error", noKey: false },
    { args: ["login", "--json", "--token"], code: "usage_error", noKey: false },
    {
      args: ["--bad=private-value", "--json"],
      code: "usage_error",
      noKey: false,
    },
    { args: ["login", "--json"], code: "interaction_required", noKey: true },
  ]) {
    const env = { ...process.env, INTH_TOKEN: "inth_json_test_key" };
    if (scenario.noKey) {
      Reflect.deleteProperty(env, "INTH_TOKEN");
    }
    const result = spawnSync(command, [...prefix, ...scenario.args], {
      encoding: "utf-8",
      env,
      timeout: 5000,
    });
    assert.equal(result.stderr, "");
    assert.equal(result.status, scenario.code ? 1 : 0, result.stdout);
    const response = responseSchema.parse(JSON.parse(result.stdout));
    assert.equal(response.ok, !scenario.code);
    if (!response.ok) {
      assert.equal(response.error.code, scenario.code);
    }
    assert.doesNotMatch(
      result.stdout,
      /inth_json_test_key|private-value|Approve sign-in/u
    );
  }
};

// Linux only: point libsecret at a missing session bus so the store is unavailable.
export const verifyUnavailableCredentialStore = (command: string): void => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "inth-no-bus-"));
  try {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      DBUS_SESSION_BUS_ADDRESS: `unix:path=${path.join(directory, "missing-bus")}`,
      XDG_RUNTIME_DIR: directory,
      XDG_STATE_HOME: directory,
    };
    for (const name of [
      "INTH_TOKEN",
      "CURSOR_SANDBOX",
      "CODEX_SANDBOX",
      "CODEX_SANDBOX_NETWORK_DISABLED",
    ]) {
      Reflect.deleteProperty(env, name);
    }
    for (const scenario of [
      { args: ["logout", "--json"], code: "credential_store_unavailable" },
      { args: ["whoami", "--json"], code: "credential_store_unavailable" },
      {
        args: ["whoami", "--json"],
        code: "sandbox_restricted",
        extra: { CODEX_SANDBOX_NETWORK_DISABLED: "1" },
      },
    ]) {
      const result = spawnSync(command, scenario.args, {
        encoding: "utf-8",
        env: { ...env, ...scenario.extra },
        timeout: 5000,
      });
      assert.equal(result.stderr, "");
      assert.equal(result.status, 1, result.stdout);
      const response = responseSchema.parse(JSON.parse(result.stdout));
      assert.equal(response.ok, false);
      if (!response.ok) {
        assert.equal(response.error.code, scenario.code);
        // libsecret is optional, so a host without it reports that instead.
        assert.match(
          response.error.message,
          /^The system credential store is unavailable because (?:the session bus cannot be reached|libsecret is not installed)\./u
        );
      }
    }
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
};
