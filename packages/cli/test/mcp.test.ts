import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseArguments } from "../src/arguments.ts";
import {
  MCP_CLIENTS,
  MCP_URL,
  mcpLocation,
  mcpSupportsProject,
} from "../src/mcp-clients.ts";
import { editMcpJson, mcpJsonKey } from "../src/mcp-json.ts";

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
        if (scope === "project" && !mcpSupportsProject(client)) {
          continue;
        }
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

it.each([
  ["vscode", "linux"],
  ["opencode", "linux"],
  ["vscode", "win32"],
] as const)(
  "ignores relative global %s config roots on %s",
  (agent, platform) => {
    const environment = { cwd: "/project", home: "/home/person", platform };
    expect(
      mcpLocation(agent, "global", {
        ...environment,
        appData: "relative-appdata",
        xdgConfig: "relative-config",
      })
    ).toEqual(mcpLocation(agent, "global", environment));
  }
);

const environment = {
  cwd: "/project",
  home: "/home/person",
  platform: "linux",
};

it.each([
  ["fx", ".fx/mcp.json", "mcp", { enabled: true, type: "http", url: MCP_URL }],
  [
    "antigravity",
    ".gemini/config/mcp_config.json",
    "mcpServers",
    { serverUrl: MCP_URL },
  ],
  [
    "cline",
    ".config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json",
    "mcpServers",
    { disabled: false, type: "streamableHttp", url: MCP_URL },
  ],
  [
    "cline-cli",
    ".cline/data/settings/cline_mcp_settings.json",
    "mcpServers",
    { disabled: false, type: "streamableHttp", url: MCP_URL },
  ],
  ["gemini-cli", ".gemini/settings.json", "mcpServers", { httpUrl: MCP_URL }],
  [
    "github-copilot-cli",
    ".copilot/mcp-config.json",
    "mcpServers",
    { tools: ["*"], type: "http", url: MCP_URL },
  ],
  ["grok-build", ".grok/config.toml", "mcp_servers", { url: MCP_URL }],
  [
    "kilo-code",
    ".config/kilo/kilo.json",
    "mcp",
    { enabled: true, type: "remote", url: MCP_URL },
  ],
  [
    "kimi-code",
    ".kimi-code/mcp.json",
    "mcpServers",
    { transport: "http", url: MCP_URL },
  ],
  ["kiro-cli", ".kiro/settings/mcp.json", "mcpServers", { url: MCP_URL }],
  ["mastracode", ".mastracode/mcp.json", "mcpServers", { url: MCP_URL }],
  [
    "mcporter",
    ".mcporter/mcporter.json",
    "mcpServers",
    { type: "http", url: MCP_URL },
  ],
  ["pi", ".pi/agent/mcp.json", "mcpServers", { url: MCP_URL }],
  [
    "windsurf",
    ".codeium/windsurf/mcp_config.json",
    "mcpServers",
    { serverUrl: MCP_URL },
  ],
  [
    "zed",
    ".config/zed/settings.json",
    "context_servers",
    { source: "custom", type: "http", url: MCP_URL },
  ],
] as const)(
  "configures %s using its global path and HTTP schema",
  (agent, filename, key, expected) => {
    expect(MCP_CLIENTS).toContain(agent);
    expect(() =>
      parseArguments([
        "mcp",
        "setup",
        "--agent",
        agent,
        "--scope",
        "global",
        "--json",
      ])
    ).not.toThrow();
    const target = mcpLocation(agent, "global", environment);
    expect(target.path).toBe(path.join(environment.home, filename));
    expect(target.key).toBe(key);
    expect(JSON.parse(target.config)).toEqual(expected);
    if (target.format === "toml") {
      return;
    }
    const original = `{ // Keep settings\n "theme": "dark", "${key}": {"other": {"url": "https://example.com"}} }`;
    const added = editMcpJson(original, key, target.config, false);
    expect(added.source).toContain(MCP_URL);
    expect(editMcpJson(added.source, key, target.config, false).changed).toBe(
      false
    );
    expect(
      editMcpJson(added.source, key, target.config, true, true).configured
    ).toBe(true);
    const removed = editMcpJson(added.source, key, target.config, true);
    expect(removed.source).not.toContain(MCP_URL);
    expect(removed.source).toContain("// Keep settings");
    expect(removed.source).toContain('"other": {"url": "https://example.com"}');
    expect(() =>
      editMcpJson(
        added.source.replace(MCP_URL, "https://other.example"),
        key,
        target.config,
        false
      )
    ).toThrow(expect.objectContaining({ code: "config_conflict" }));
  }
);

it.each(["antigravity", "cline", "cline-cli", "windsurf"] as const)(
  "rejects project scope for %s",
  (agent) => {
    expect(() => mcpLocation(agent, "project", environment)).toThrow(
      "Use --scope global"
    );
  }
);

it("uses fx's trusted project layout and global profile layout", () => {
  expect(mcpLocation("fx", "project", environment)).toMatchObject({
    key: "mcpServers",
    path: path.join("/project", ".mcp.json"),
  });
  expect(mcpLocation("fx", "global", environment)).toMatchObject({
    key: "mcp",
    path: path.join("/home/person", ".fx", "mcp.json"),
  });
});

it.each([
  [
    "cline-cli",
    { clineHome: "/custom/cline" },
    "data/settings/cline_mcp_settings.json",
  ],
  ["grok-build", { grokHome: "/custom/grok" }, "config.toml"],
  ["kimi-code", { kimiHome: "/custom/kimi" }, "mcp.json"],
  ["pi", { piHome: "/custom/pi" }, "mcp.json"],
] as const)("honors the %s profile directory", (agent, override, filename) => {
  expect(
    mcpLocation(agent, "global", { ...environment, ...override }).path
  ).toBe(path.join(Object.values(override)[0] ?? "", filename));
  if (mcpSupportsProject(agent)) {
    expect(
      mcpLocation(agent, "project", { ...environment, ...override }).path
    ).toContain(path.join("/project"));
  }
});

it.each([
  ["antigravity", "serverUrl"],
  ["windsurf", "serverUrl"],
  ["gemini-cli", "httpUrl"],
] as const)(
  "preserves %s credentials and detects its URL field",
  (agent, field) => {
    const target = mcpLocation(agent, "global", environment);
    const source = JSON.stringify({
      mcpServers: { inth: { [field]: MCP_URL, headers: { custom: "keep" } } },
    });
    expect(editMcpJson(source, target.key, target.config, false)).toMatchObject(
      { changed: false, configured: true, source }
    );
  }
);

it.each([
  [
    "opencode",
    "mcp",
    '{"mcp":{"servers":{"other":{"url":"https://example.com"}}}}',
    "mcp.servers",
  ],
  [
    "github-copilot-cli",
    "mcpServers",
    '{"other":{"url":"https://example.com"}}',
    "",
  ],
  [
    "fx",
    "mcp",
    '{"mcpServers":{"other":{"url":"https://example.com"}}}',
    "mcpServers",
  ],
] as const)(
  "preserves existing %s layouts through setup and removal",
  (agent, defaultKey, source, expectedKey) => {
    const key = mcpJsonKey(source, agent, defaultKey);
    expect(key).toBe(expectedKey);
    const { config: clientConfig } = mcpLocation(agent, "global", environment);
    const added = editMcpJson(source, key, clientConfig, false);
    expect(editMcpJson(added.source, key, clientConfig, false).changed).toBe(
      false
    );
    expect(
      editMcpJson(added.source, key, clientConfig, true, true).configured
    ).toBe(true);
    expect(
      JSON.parse(editMcpJson(added.source, key, clientConfig, true).source)
    ).toEqual(JSON.parse(source));
  }
);

it("keeps OpenCode legacy entries in place when a native map also exists", () => {
  const source = JSON.stringify({
    mcp: { inth: { type: "remote", url: MCP_URL }, servers: {} },
  });
  expect(mcpJsonKey(source, "opencode", "mcp")).toBe("mcp");
  expect(
    mcpJsonKey(
      '{"mcp":{"other":{"type":"remote","url":"https://example.com"},"servers":{}}}',
      "opencode",
      "mcp"
    )
  ).toBe("mcp");
  expect(
    mcpJsonKey(
      JSON.stringify({
        mcp: { inth: { url: MCP_URL }, servers: { inth: { url: MCP_URL } } },
      }),
      "opencode",
      "mcp"
    )
  ).toBe("mcp.servers");
});

it("rejects VS Code's wrapper for Copilot CLI but accepts a server named servers", () => {
  expect(() =>
    mcpJsonKey(
      '{"servers":{"other":{"url":"https://example.com"}}}',
      "github-copilot-cli",
      "mcpServers"
    )
  ).toThrow("Use --agent vscode");
  expect(
    mcpJsonKey(
      '{"servers":{"url":"https://example.com"}}',
      "github-copilot-cli",
      "mcpServers"
    )
  ).toBe("");
});
