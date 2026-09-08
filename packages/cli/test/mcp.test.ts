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
    '{"mcpServers":null}',
    '{"mcpServers":{},"mcpServers":{}}',
    '{"theme":',
    '{"mcpServers":{"inth":{"url":"https://other.example"}}}',
  ])("refuses malformed or conflicting config: %s", (source) => {
    expect(() => editMcpJson(source, "mcpServers", config, false)).toThrow();
  });
  it("leaves existing Inth options and credentials untouched", () => {
    const source = `{"mcpServers":{"inth":{"url":"${MCP_URL}","headers":{"custom":"keep"},"disabled":true}}}`;
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
    expect(() => parseArguments(["mcp", "setup", ...args])).toThrow();
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
          expect(target.path).toBe("/custom-codex/config.toml");
        }
        if (client === "vscode" && scope === "global" && platform === "win32") {
          expect(target.path).toBe("/appdata/Code/User/mcp.json");
        }
      }
    }
  }
});
