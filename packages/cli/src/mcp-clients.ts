// Client paths and remote config shapes adapted from add-mcp. See vendor/add-mcp/UPSTREAM.md.
// eslint-disable-next-line unicorn/import-style -- Scriptc requires named path imports.
import { join } from "node:path";

export const MCP_URL = "https://api.inth.com/mcp";
const CLIENT_DEFINITIONS = [
  { id: "codex", name: "Codex" },
  { id: "claude-code", name: "Claude Code" },
  { id: "cursor", name: "Cursor" },
  { id: "vscode", name: "VS Code" },
  { id: "opencode", name: "OpenCode" },
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
}
export interface McpEnvironment {
  platform: string;
  home: string;
  cwd: string;
  appData?: string;
  xdgConfig?: string;
  codexHome?: string;
}
export const mcpLocation = (
  agent: McpClient,
  scope: string,
  environment: McpEnvironment
): McpLocation => {
  const { home, cwd, platform } = environment;
  const local = scope === "project";
  const xdg = environment.xdgConfig || join(home, ".config");
  let format = "json";
  let key = "mcpServers";
  let path = "";
  let config = JSON.stringify({ url: MCP_URL });
  if (agent === "codex") {
    path = local
      ? join(cwd, ".codex", "config.toml")
      : join(environment.codexHome || join(home, ".codex"), "config.toml");
    key = "mcp_servers";
    format = "toml";
  } else if (agent === "claude-code") {
    path = local ? join(cwd, ".mcp.json") : join(home, ".claude.json");
    config = JSON.stringify({ type: "http", url: MCP_URL });
  } else if (agent === "cursor") {
    path = join(local ? cwd : home, ".cursor", "mcp.json");
  } else if (agent === "vscode") {
    let directory = join(xdg, "Code", "User");
    if (platform === "darwin") {
      directory = join(home, "Library", "Application Support", "Code", "User");
    }
    if (platform === "win32") {
      directory = join(
        environment.appData || join(home, "AppData", "Roaming"),
        "Code",
        "User"
      );
    }
    path = local
      ? join(cwd, ".vscode", "mcp.json")
      : join(directory, "mcp.json");
    key = "servers";
    config = JSON.stringify({ type: "http", url: MCP_URL });
  } else if (agent === "opencode") {
    path = join(local ? cwd : join(xdg, "opencode"), "opencode.json");
    key = "mcp";
    config = JSON.stringify({ enabled: true, type: "remote", url: MCP_URL });
  } else {
    throw new Error("Unknown MCP client.");
  }
  return { agent, config, format, key, path };
};
