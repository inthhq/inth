// Exercises the Node reference implementation in experiments/node, not the shipped Scriptc adapters.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { formatHelp } from "../src/help.ts";
import { VERSION } from "../src/version.ts";

const entry = fileURLToPath(
  new URL("../experiments/node/inth.ts", import.meta.url)
);
const execute = (args: string[], key = "inth_test_environment") =>
  spawnSync(process.execPath, [entry, ...args], {
    encoding: "utf-8",
    env: { ...process.env, INTH_TOKEN: key },
    timeout: 10_000,
  });

describe("CLI commands", () => {
  it("prints help and version without loading credentials", () => {
    const help = execute(["--help"]);
    expect(help.status).toBe(0);
    expect(help.stdout.trim()).toBe(formatHelp());
    expect(help.stderr).toBe("");
    expect(execute(["--version"]).stdout.trim()).toBe(VERSION);
  });
  it("skips login for an environment key", () => {
    const result = execute(["login"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("No browser sign-in needed");
    expect(result.stdout).not.toContain("inth_test_environment");
    expect(result.stderr).toBe("");
  });
  it("lets an explicit key override an invalid environment value", () => {
    const result = execute(["login", "--token", "inth_flag"], "invalid");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("No browser sign-in needed");
  });
  it("reports the API-key source without exposing the key", () => {
    const result = execute(["auth", "status"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("validity has not been checked");
    expect(result.stdout).not.toContain("inth_test_environment");
  });
  it("rejects unsafe API URLs before loading credentials or issuing requests", () => {
    const result = execute(["api", "https://example.com/v1/projects"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Use an API path under /v1/");
    expect(result.stderr).not.toContain("inth_test_environment");
  });
  it("does not print invalid supplied secrets", () => {
    const result = execute(["login", "--token", "invalid-secret"]);
    expect(result.status).toBe(1);
    expect(result.stderr).not.toContain("invalid-secret");
  });
  it("rejects organization creation with an API key before touching credentials or the network", () => {
    const result = execute([
      "org",
      "create",
      "--name",
      "Acme",
      "--slug",
      "acme",
      "--json",
    ]);
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).error).toMatchObject({
      code: "usage_error",
      message: expect.stringContaining("cannot create organizations"),
    });
    expect(result.stdout).not.toContain("inth_test_environment");
    expect(result.stderr).toBe("");
  });
  it("rejects unknown commands", () => {
    const result = execute(["unknown"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unknown command");
  });
});
