// Client paths and remote config shapes adapted from add-mcp. See vendor/add-mcp/UPSTREAM.md.
// eslint-disable-next-line unicorn/import-style -- Scriptc requires named path imports.
import { isAbsolute, join } from "node:path";

import { CliError } from "./cli-error.ts";

export const MCP_URL = "https://api.inth.com/mcp";
const CLIENT_DEFINITIONS = [
  { id: "codex", name: "Codex" },
  { id: "claude-code", name: "Claude Code" },
  { id: "cursor", name: "Cursor" },
  { id: "vscode", name: "VS Code" },
  { id: "opencode", name: "OpenCode" },
  { id: "fx", name: "fx" },
  { id: "antigravity", name: "Antigravity" },
  { id: "cline", name: "Cline VS Code extension" },
  { id: "cline-cli", name: "Cline CLI" },
  { id: "gemini-cli", name: "Gemini CLI" },
  { id: "github-copilot-cli", name: "GitHub Copilot CLI" },
  { id: "grok-build", name: "Grok Build" },
  { id: "kilo-code", name: "Kilo Code" },
  { id: "kimi-code", name: "Kimi Code" },
  { id: "kiro-cli", name: "Kiro CLI" },
  { id: "mastracode", name: "Mastra Code" },
  { id: "mcporter", name: "MCPorter" },
  { id: "pi", name: "Pi" },
  { id: "windsurf", name: "Windsurf" },
  { id: "zed", name: "Zed" },
] as const;
export type McpClient = (typeof CLIENT_DEFINITIONS)[number]["id"];
export const MCP_CLIENTS = CLIENT_DEFINITIONS.map((client) => client.id);
export const mcpClientName = (agent: McpClient): string => {
  for (const client of CLIENT_DEFINITIONS) {
    if (client.id === agent) {
      return client.name;
    }
  }
  return agent;
};

export interface McpLocation {
  agent: McpClient;
  path: string;
  key: string;
  format: string;
  config: string;
  candidates: string[];
}
export interface McpEnvironment {
  platform: string;
  home: string;
  cwd: string;
  appData?: string;
  xdgConfig?: string;
  codexHome?: string;
  clineHome?: string;
  grokHome?: string;
  kimiHome?: string;
  piHome?: string;
}
const xdgDirectory = (environment: McpEnvironment): string =>
  environment.xdgConfig && isAbsolute(environment.xdgConfig)
    ? environment.xdgConfig
    : join(environment.home, ".config");

const appSupportDirectory = (environment: McpEnvironment): string => {
  if (environment.platform === "darwin") {
    return join(environment.home, "Library", "Application Support");
  }
  if (environment.platform === "win32") {
    return environment.appData && isAbsolute(environment.appData)
      ? environment.appData
      : join(environment.home, "AppData", "Roaming");
  }
  return xdgDirectory(environment);
};

const globalPaths = (
  environment: McpEnvironment
): Record<McpClient, string> => {
  const { home, platform } = environment;
  const xdg = xdgDirectory(environment);
  const support = appSupportDirectory(environment);
  const vscode = join(support, "Code", "User");
  return {
    antigravity: join(home, ".gemini", "config", "mcp_config.json"),
    "claude-code": join(home, ".claude.json"),
    cline: join(
      vscode,
      "globalStorage",
      "saoudrizwan.claude-dev",
      "settings",
      "cline_mcp_settings.json"
    ),
    "cline-cli": join(
      environment.clineHome || join(home, ".cline"),
      "data",
      "settings",
      "cline_mcp_settings.json"
    ),
    codex: join(environment.codexHome || join(home, ".codex"), "config.toml"),
    cursor: join(home, ".cursor", "mcp.json"),
    fx: join(home, ".fx", "mcp.json"),
    "gemini-cli": join(home, ".gemini", "settings.json"),
    "github-copilot-cli": join(
      environment.xdgConfig && isAbsolute(environment.xdgConfig)
        ? xdg
        : join(home, ".copilot"),
      "mcp-config.json"
    ),
    "grok-build": join(
      environment.grokHome || join(home, ".grok"),
      "config.toml"
    ),
    "kilo-code": join(xdg, "kilo", "kilo.json"),
    "kimi-code": join(
      environment.kimiHome || join(home, ".kimi-code"),
      "mcp.json"
    ),
    "kiro-cli": join(home, ".kiro", "settings", "mcp.json"),
    mastracode: join(home, ".mastracode", "mcp.json"),
    mcporter: join(home, ".mcporter", "mcporter.json"),
    opencode: join(xdg, "opencode", "opencode.json"),
    pi: join(environment.piHome || join(home, ".pi", "agent"), "mcp.json"),
    vscode: join(vscode, "mcp.json"),
    windsurf: join(home, ".codeium", "windsurf", "mcp_config.json"),
    zed: join(support, platform === "linux" ? "zed" : "Zed", "settings.json"),
  };
};

const PROJECT_PATHS: Record<McpClient, string> = {
  antigravity: "",
  "claude-code": ".mcp.json",
  cline: "",
  "cline-cli": "",
  codex: ".codex/config.toml",
  cursor: ".cursor/mcp.json",
  fx: ".mcp.json",
  "gemini-cli": ".gemini/settings.json",
  "github-copilot-cli": ".mcp.json",
  "grok-build": ".grok/config.toml",
  "kilo-code": "kilo.json",
  "kimi-code": ".kimi-code/mcp.json",
  "kiro-cli": ".kiro/settings/mcp.json",
  mastracode: ".mastracode/mcp.json",
  mcporter: "config/mcporter.json",
  opencode: "opencode.json",
  pi: ".pi/mcp.json",
  vscode: ".vscode/mcp.json",
  windsurf: "",
  zed: ".zed/settings.json",
};

export const mcpSupportsProject = (agent: string): boolean => {
  const client = MCP_CLIENTS.find((value) => value === agent);
  return Boolean(client && PROJECT_PATHS[client]);
};

const clientKey = (agent: McpClient, local: boolean): string => {
  if (agent === "codex" || agent === "grok-build") {
    return "mcp_servers";
  }
  if (agent === "vscode") {
    return "servers";
  }
  if (agent === "zed") {
    return "context_servers";
  }
  if (
    agent === "opencode" ||
    agent === "kilo-code" ||
    (agent === "fx" && !local)
  ) {
    return "mcp";
  }
  return "mcpServers";
};

const configCandidates = (
  agent: McpClient,
  path: string,
  local: boolean,
  cwd: string
): string[] => {
  const jsonc = path.replace(/\.json$/u, ".jsonc");
  if (agent === "opencode") {
    return local
      ? [
          jsonc,
          path,
          join(cwd, ".opencode", "opencode.jsonc"),
          join(cwd, ".opencode", "opencode.json"),
        ]
      : [jsonc, path];
  }
  if (agent === "kilo-code") {
    return local
      ? [
          join(cwd, ".kilo", "kilo.jsonc"),
          join(cwd, ".kilo", "kilo.json"),
          join(cwd, ".kilocode", "kilo.jsonc"),
          join(cwd, ".kilocode", "kilo.json"),
          jsonc,
          path,
        ]
      : [jsonc, path];
  }
  if (agent === "github-copilot-cli" && local) {
    return [path, join(cwd, ".github", "mcp.json")];
  }
  if (agent === "mcporter" && !local) {
    return [path, jsonc];
  }
  return [];
};

const clientConfig = (agent: McpClient, local: boolean): string => {
  if (agent === "antigravity" || agent === "windsurf") {
    return JSON.stringify({ serverUrl: MCP_URL });
  }
  if (agent === "cline" || agent === "cline-cli") {
    return JSON.stringify({
      disabled: false,
      type: "streamableHttp",
      url: MCP_URL,
    });
  }
  if (agent === "gemini-cli") {
    return JSON.stringify({ httpUrl: MCP_URL });
  }
  if (agent === "opencode" || agent === "kilo-code" || agent === "fx") {
    return JSON.stringify({
      enabled: true,
      type: agent === "fx" ? "http" : "remote",
      url: MCP_URL,
    });
  }
  if (agent === "kimi-code") {
    return JSON.stringify({ transport: "http", url: MCP_URL });
  }
  if (agent === "zed") {
    return JSON.stringify({ source: "custom", type: "http", url: MCP_URL });
  }
  if (agent === "github-copilot-cli" && !local) {
    return JSON.stringify({ tools: ["*"], type: "http", url: MCP_URL });
  }
  if (
    ["claude-code", "vscode", "github-copilot-cli", "mcporter"].includes(agent)
  ) {
    return JSON.stringify({ type: "http", url: MCP_URL });
  }
  return JSON.stringify({ url: MCP_URL });
};

export const mcpLocation = (
  agent: McpClient,
  scope: string,
  environment: McpEnvironment
): McpLocation => {
  const local = scope === "project";
  if (local && !mcpSupportsProject(agent)) {
    throw new CliError(
      "usage_error",
      `${mcpClientName(agent)} only supports global MCP configuration. Use --scope global.`
    );
  }
  const path = local
    ? join(environment.cwd, PROJECT_PATHS[agent] || "")
    : globalPaths(environment)[agent];
  return {
    agent,
    candidates: configCandidates(agent, path, local, environment.cwd),
    config: clientConfig(agent, local),
    format: agent === "codex" || agent === "grok-build" ? "toml" : "json",
    key: clientKey(agent, local),
    path,
  };
};
