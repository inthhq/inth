// Exercises the Node reference implementation in experiments/node, not the shipped Scriptc adapters.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { VERSION } from "../src/version.ts";

const entry = fileURLToPath(
  new URL("../experiments/node/inth.ts", import.meta.url)
);
const envelope = z.object({
  data: z.json().optional(),
  error: z
    .object({
      code: z.string(),
      httpStatus: z.number().nullable(),
      message: z.string(),
      requestId: z.string().nullable(),
    })
    .optional(),
  ok: z.boolean(),
  schemaVersion: z.literal(2),
});
const execute = (args: string[], token = "inth_test_agent") => {
  const env = { ...process.env };
  if (token) {
    env.INTH_TOKEN = token;
  } else {
    delete env.INTH_TOKEN;
  }
  const result = spawnSync(process.execPath, [entry, ...args], {
    encoding: "utf-8",
    env,
    timeout: 5000,
  });
  expect(result.error).toBeUndefined();
  expect(result.status).not.toBeNull();
  expect(result.stderr).toBe("");
  expect(result.stdout).not.toContain("inth_test_agent");
  return {
    result: envelope.parse(JSON.parse(result.stdout)),
    status: result.status,
  };
};
describe("agent commands", () => {
  it("discovers commands and version as JSON", () => {
    const help = execute(["--help", "--json"]);
    expect(help.status).toBe(0);
    expect(help.result).toMatchObject({
      data: {
        commands: expect.arrayContaining([
          "auth status",
          "api <path> [--method <method>] [--data <json>]",
        ]),
        name: "inth",
      },
      ok: true,
    });
    expect(execute(["--json", "--version"]).result).toMatchObject({
      data: { name: "inth", version: VERSION },
      ok: true,
    });
  });
  it("reports API-key login and status without printing the key", () => {
    expect(execute(["login", "--json"]).result).toMatchObject({
      data: { credentialSource: "api_key", validated: false },
      ok: true,
    });
    expect(execute(["auth", "status", "--json"]).result).toMatchObject({
      data: {
        credentialPresent: true,
        credentialSource: "api_key",
        validated: false,
      },
      ok: true,
    });
  });
  it("formats parser failures and invalid destinations even when parsing fails", () => {
    for (const args of [
      ["status", "--json"],
      ["login", "--json", "--token"],
      ["--bad=private-secret", "--json"],
      ["api", "https://evil.example/v1/me", "--json"],
    ]) {
      const result = execute(args);
      expect(result.status).toBe(1);
      expect(result.result).toMatchObject({
        error: { code: "usage_error" },
        ok: false,
      });
      expect(JSON.stringify(result.result)).not.toContain("private-secret");
    }
  });
  it("fails before browser login when machine mode has no API key", () => {
    const result = execute(["login", "--json"], "");
    expect(result.status).toBe(1);
    expect(result.result).toMatchObject({
      error: {
        code: "interaction_required",
        httpStatus: null,
        requestId: null,
      },
      ok: false,
    });
    expect(JSON.stringify(result.result)).not.toContain("verification_uri");
  });
  it("also permits disabling interaction without JSON", () => {
    const env = { ...process.env };
    delete env.INTH_TOKEN;
    const result = spawnSync(
      process.execPath,
      [entry, "login", "--non-interactive"],
      { encoding: "utf-8", env, timeout: 5000 }
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(
      "Browser login requires an interactive terminal"
    );
  });
});
