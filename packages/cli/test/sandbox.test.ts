import { describe, expect, it } from "vitest";

import { CliError } from "../src/cli-error.ts";
import { agentSandbox, sandboxError } from "../src/sandbox.ts";

const STATE = "/Users/person/Library/Application Support/com.inth.cli";
const lock = new Error("Cannot acquire the credential lock.");
const offline = new Error(
  "Could not reach inth. Check your connection and try again."
);

describe("agent sandbox errors", () => {
  it("detects Cursor's sandboxed terminal", () => {
    expect(agentSandbox("seatbelt")).toBe("Cursor");
    expect(agentSandbox("native")).toBe("Cursor");
    expect(agentSandbox()).toBe("");
    expect(agentSandbox("")).toBe("");
  });

  it("leaves errors unchanged outside a sandbox", () => {
    expect(sandboxError(lock, "", STATE)).toBe(lock);
    expect(sandboxError(offline, "", STATE)).toBe(offline);
  });

  it("explains state directory failures inside Cursor's sandbox", () => {
    const error = sandboxError(lock, "Cursor", STATE);
    expect(error).toBeInstanceOf(CliError);
    expect(error).toMatchObject({
      code: "sandbox_restricted",
      message: `Cannot acquire the credential lock. Cursor's agent sandbox blocks writes to ${STATE}, where Inth keeps sign-in locks and settings. Run this command outside the sandbox.`,
    });
  });

  it("explains a fresh account's blocked state directory", () => {
    for (const path of [
      "/Users/person",
      `${STATE}`,
      `${STATE}/auth.md-local`,
    ]) {
      expect(
        sandboxError(
          new Error(`EPERM: operation not permitted, mkdir '${path}'`),
          "Cursor",
          STATE
        )
      ).toMatchObject({
        code: "sandbox_restricted",
        message: `Cannot create the CLI state directory. Cursor's agent sandbox blocks writes to ${STATE}, where Inth keeps sign-in locks and settings. Run this command outside the sandbox.`,
      });
    }
  });

  it("keeps permission errors outside the state directory", () => {
    for (const message of [
      "EPERM: operation not permitted, mkdir '/work/project/.inth'",
      `EACCES: permission denied, open '${STATE}-other/config.json'`,
      "ENOENT: no such file or directory, open '/Users/person'",
    ]) {
      const error = new Error(message);
      expect(sandboxError(error, "Cursor", STATE)).toBe(error);
    }
  });

  it("explains network failures inside Cursor's sandbox", () => {
    expect(sandboxError(offline, "Cursor", STATE)).toMatchObject({
      code: "sandbox_restricted",
      message:
        "Could not reach inth. Cursor's agent sandbox may be blocking the connection. Run this command outside the sandbox.",
    });
  });

  it("keeps unrelated and already structured errors", () => {
    const other = new Error("Invalid token response.");
    const usage = new CliError(
      "usage_error",
      "Cannot acquire the credential lock."
    );
    expect(sandboxError(other, "Cursor", STATE)).toBe(other);
    expect(sandboxError(usage, "Cursor", STATE)).toBe(usage);
  });
});
