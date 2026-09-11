import { describe, expect, it } from "vitest";

import { textWidth } from "../src/display.ts";
import { mcpClientName } from "../src/mcp-clients.ts";
import { mcpNextStep, mcpSummary } from "../src/mcp-output.ts";
import type { McpResult } from "../src/mcp-output.ts";

const environment = {
  codexHome:
    "/home/person/Library/Application Support/orca/accounts/a-long-account-id/home",
  cwd: "/home/person/project",
  home: "/home/person",
  platform: "darwin",
};
const result: McpResult = {
  agent: "codex",
  changed: true,
  nextStep: mcpNextStep("codex", "global", "setup", false),
  path: `${environment.codexHome}/config.toml`,
  scope: "global",
  status: "configured",
};

describe("MCP setup output", () => {
  it.each([
    ["would-add", "setup", "Add Inth to Codex"],
    ["would-remove", "remove", "Remove Inth from Codex"],
    ["removed", "remove", "Inth removed from Codex"],
    ["not-configured", "list", "Inth is not configured in Codex"],
    ["unchanged", "remove", "Inth is not configured in Codex"],
  ])("describes %s for %s", (status, action, expected) => {
    const text = mcpSummary(
      [{ ...result, status }],
      action,
      status.startsWith("would-"),
      environment,
      { color: false, columns: 80 }
    );
    expect(text).toContain(expected);
  });
  it("shows a readable client, config location, and exact login command", () => {
    const text = mcpSummary([result], "setup", false, environment, {
      color: false,
      columns: 80,
    });
    expect(text).toContain("Inth added to Codex");
    expect(text).toContain("Config  $CODEX_HOME/config.toml");
    expect(text).toContain("Using the Codex profile selected by CODEX_HOME.");
    expect(text.split("\n")).toContain("    codex mcp login inth");
    expect(text).not.toContain(environment.codexHome);
    expect(text).not.toContain("codex (codex)");
    expect(text).not.toContain("connected");
    expect(text).not.toContain("\u001B");
  });
  it.each([
    ["codex", "codex mcp login inth"],
    ["claude-code", "claude mcp login inth"],
    ["opencode", "opencode mcp auth inth"],
  ] as const)("gives %s its own authentication command", (agent, command) => {
    expect(mcpNextStep(agent, "project", "setup", false)?.command).toBe(
      command
    );
  });
  it("explains the editor action after launching VS Code or Cursor", () => {
    expect(mcpNextStep("vscode", "project", "setup", false)).toEqual({
      command: "code .",
      instruction: expect.stringContaining("MCP: List Servers"),
    });
    expect(mcpNextStep("cursor", "project", "setup", false)).toEqual({
      command: "cursor .",
      instruction: expect.stringContaining("connect inth"),
    });
  });
  it("gives dry runs an apply command and never asks for login after removal", () => {
    expect(mcpNextStep("codex", "global", "setup", true)?.command).toBe(
      "inth mcp setup --agent codex --scope global"
    );
    expect(mcpNextStep("codex", "global", "remove", true)?.command).toBe(
      "inth mcp remove --agent codex --scope global"
    );
    expect(mcpNextStep("codex", "global", "remove", false)).toBeNull();
    expect(mcpNextStep("codex", "global", "list", false)).toBeNull();
  });
  it("fits long paths and prose in a narrow terminal while preserving commands", () => {
    const longPath = {
      ...result,
      path: `/another/${"long-directory/".repeat(8)}config.toml`,
    };
    const text = mcpSummary([longPath], "setup", false, environment, {
      color: false,
      columns: 40,
    });
    for (const line of text.split("\n")) {
      expect(textWidth(line)).toBeLessThan(40);
    }
    expect(text).toContain("…");
    expect(text).toContain("config.toml");
    expect(text.split("\n")).toContain("    codex mcp login inth");
  });
  it("uses client names instead of configuration slugs", () => {
    expect(mcpClientName("codex")).toBe("Codex");
    expect(mcpClientName("claude-code")).toBe("Claude Code");
    expect(mcpClientName("vscode")).toBe("VS Code");
  });
});

it("gives fx reload and authentication steps, with project trust when needed", () => {
  expect(mcpNextStep("fx", "global", "setup", false)?.instruction).toContain(
    "/mcp reload"
  );
  expect(mcpNextStep("fx", "project", "setup", false)?.instruction).toContain(
    "trust the project's inth server"
  );
  expect(mcpNextStep("fx", "global", "setup", false)?.instruction).toContain(
    "/mcp auth inth --open"
  );
});

it("explains Pi's required adapter", () => {
  expect(mcpNextStep("pi", "project", "setup", false)?.command).toBe(
    "pi install npm:pi-mcp-adapter"
  );
});
