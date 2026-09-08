import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseArguments } from "../src/arguments.ts";
import { MCP_CLIENTS, MCP_URL, mcpLocation } from "../src/mcp-clients.ts";
import { editMcpJson } from "../src/mcp-json.ts";

const config = JSON.stringify({ type: "http", url: MCP_URL });
describe("Inth MCP config edits", () => {
  it.each([
    "",
    "{}",
    '{"theme":"dark"}',
    '{"mcpServers":{}}',
    '{\n\t// Keep the theme\n\t"theme": "dark",\n\t"mcpServers": {\n\t\t"other": { "url": "https://example.com" }, // Keep other servers\n\t},\n}\n',
  ])("adds and removes only Inth from JSON/JSONC", (source) => {
    const added = editMcpJson(source, "mcpServers", config, false);
    expect(added.configured).toBe(true);
    expect(added.source).toContain(MCP_URL);
    const repeated = editMcpJson(added.source, "mcpServers", config, false);
    expect(repeated.changed).toBe(false);
    expect(repeated.source).toBe(added.source);
    const removed = editMcpJson(added.source, "mcpServers", config, true);
    expect(removed.source).not.toContain(MCP_URL);
    expect(
      editMcpJson(removed.source, "mcpServers", config, true).changed
    ).toBe(false);
    for (const preserved of [
      "// Keep the theme",
      "// Keep other servers",
      '"theme": "dark"',
    ]) {
      if (source.includes(preserved)) {
        expect(removed.source).toContain(preserved);
      }
    }
  });
  it("preserves comments around an entry being removed", () => {
    const source = `{"mcpServers":{"inth":${config}, /* other settings */ "other":{"url":"https://example.com"}}}`;
    expect(editMcpJson(source, "mcpServers", config, true).source).toContain(
      '/* other settings */ "other"'
    );
  });
  it.each([
    ['{"mcpServers":null}', "invalid_config"],
    ['{"mcpServers":{},"mcpServers":{}}', "invalid_config"],
    ['{"theme":', "invalid_config"],
    [
      '{"mcpServers":{"inth":{"url":"https://other.example"}}}',
      "config_conflict",
    ],
  ])("refuses malformed or conflicting config: %s", (source, code) => {
    expect(() => editMcpJson(source, "mcpServers", config, false)).toThrow(
      expect.objectContaining({ code })
    );
  });
  it("leaves existing Inth options and credentials untouched", () => {
    const source = `{"mcpServers":{"inth":{"type":"http","url":"${MCP_URL}","headers":{"custom":"keep"},"disabled":true}}}`;
    expect(editMcpJson(source, "mcpServers", config, false).source).toBe(
      source
    );
  });
  it("supports strict JSON after deleting the last entry", () => {
    const source = `{"mcpServers":{"other":{},"inth":${config}}}`;
    expect(
      JSON.parse(editMcpJson(source, "mcpServers", config, true).source)
    ).toEqual({ mcpServers: { other: {} } });
  });
});

it("requires known clients and explicit scopes and rejects credential flags", () => {
  for (const args of [
    ["--agent", "unknown"],
    ["--scope", "bad"],
    ["--token", "inth_secret"],
  ]) {
    expect(() => parseArguments(["mcp", "setup", ...args])).toThrow(
      expect.objectContaining({ code: "usage_error" })
    );
  }
  expect(
    parseArguments([
      "mcp",
      "setup",
      "--agent",
      "cursor",
      "--scope",
      "project",
      "--json",
    ]).command
  ).toBe("mcp");
});
it("maps client config files and uses OAuth without embedding tokens", () => {
  for (const platform of ["darwin", "linux", "win32"]) {
    for (const client of MCP_CLIENTS) {
      for (const scope of ["project", "global"]) {
        const target = mcpLocation(client, scope, {
          appData: "/appdata",
          codexHome: "/custom-codex",
          cwd: "/project",
          home: "/home/person",
          platform,
        });
        expect(target.path).not.toBe("");
        expect(target.config).not.toContain("Authorization");
        if (client === "codex" && scope === "global") {
          expect(target.path).toBe(path.join("/custom-codex", "config.toml"));
        }
        if (client === "vscode" && scope === "global" && platform === "win32") {
          expect(target.path).toBe(
            path.join("/appdata", "Code", "User", "mcp.json")
          );
        }
      }
    }
  }
});

it.each(["claude-code", "vscode", "opencode"] as const)(
  "repairs managed %s fields without changing custom config",
  (agent) => {
    const location = mcpLocation(agent, "project", {
      cwd: "/project",
      home: "/home",
      platform: "linux",
    });
    for (const existing of [
      { url: MCP_URL },
      { enabled: false, type: "local", url: MCP_URL },
    ]) {
      const source = `{ // keep settings\n "${location.key}": {"inth": ${JSON.stringify({ ...existing, disabled: true, headers: { custom: "keep" } })}}}`;
      const inspected = editMcpJson(
        source,
        location.key,
        location.config,
        true,
        true
      );
      expect(inspected).toMatchObject({
        changed: false,
        configured: false,
        source,
      });
      const repaired = editMcpJson(
        source,
        location.key,
        location.config,
        false
      );
      expect(repaired).toMatchObject({ changed: true, configured: true });
      expect(repaired.source).toContain("// keep settings");
      expect(repaired.source).toContain('"headers":{"custom":"keep"}');
      expect(repaired.source).toContain('"disabled":true');
      expect(
        editMcpJson(repaired.source, location.key, location.config, false)
      ).toMatchObject({
        changed: false,
        configured: true,
        source: repaired.source,
      });
      expect(
        editMcpJson(repaired.source, location.key, location.config, true, true)
          .configured
      ).toBe(true);
    }
  }
);
