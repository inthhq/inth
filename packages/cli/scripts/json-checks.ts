import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

import { z } from "zod";

const responseSchema = z.discriminatedUnion("ok", [
  z
    .object({
      data: z.json(),
      ok: z.literal(true),
      schemaVersion: z.literal(1),
    })
    .strict(),
  z
    .object({
      error: z
        .object({
          code: z.string(),
          httpStatus: z.number().nullable(),
          message: z.string(),
          requestId: z.string().nullable(),
        })
        .strict(),
      ok: z.literal(false),
      schemaVersion: z.literal(1),
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
