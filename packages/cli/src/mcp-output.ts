import { style, textWidth, wrapText } from "./display.ts";
import type { DisplayOptions } from "./display.ts";
import { mcpClientName } from "./mcp-clients.ts";
import type { McpEnvironment } from "./mcp-clients.ts";
import { terminalText } from "./organizations.ts";

export interface McpResult {
  agent: string;
  scope: string;
  path: string;
  status: string;
  changed: boolean;
  nextStep: { command: string; instruction: string } | null;
}

export const mcpNextStep = (
  agent: string,
  scope: string,
  action: string,
  dryRun: boolean
): McpResult["nextStep"] => {
  if (action === "list" || (action === "remove" && !dryRun)) {
    return null;
  }
  if (dryRun) {
    return {
      command: `inth mcp ${action} --agent ${agent} --scope ${scope}`,
      instruction: "Apply these changes:",
    };
  }
  if (agent === "codex" || agent === "claude-code") {
    return {
      command: `${agent === "codex" ? "codex" : "claude"} mcp login inth`,
      instruction: "Sign in to Inth:",
    };
  }
  if (agent === "opencode") {
    return {
      command: "opencode mcp auth inth",
      instruction: "Sign in to Inth:",
    };
  }
  if (agent === "vscode") {
    return {
      command: "code .",
      instruction:
        'Open VS Code, then run "MCP: List Servers" in the Command Palette. Select inth, start it, and sign in.',
    };
  }
  return {
    command: "cursor .",
    instruction:
      "Open Cursor, then open MCP settings and connect inth to sign in.",
  };
};

const abbreviatePath = (
  result: McpResult,
  environment: McpEnvironment
): string => {
  const candidates = [
    [result.scope === "project" ? environment.cwd : "", "."],
    [
      result.agent === "codex" ? (environment.codexHome ?? "") : "",
      "$CODEX_HOME",
    ],
    [environment.home, "~"],
  ];
  for (const [base, label] of candidates) {
    if (
      base &&
      (result.path.startsWith(`${base}/`) ||
        result.path.startsWith(`${base}\\`))
    ) {
      return terminalText(`${label}${result.path.slice(base.length)}`);
    }
  }
  return terminalText(result.path);
};

const fitPath = (value: string, columns: number): string => {
  if (textWidth(value) <= columns) {
    return value;
  }
  let tail = "";
  for (const character of [...value].toReversed()) {
    if (textWidth(tail + character) > columns - 1) {
      break;
    }
    tail = character + tail;
  }
  return `…${tail}`;
};

const headline = (result: McpResult, action: string): string => {
  const client = mcpClientName(result.agent);
  if (result.status === "would-add") {
    return `Add Inth to ${client}`;
  }
  if (result.status === "would-remove") {
    return `Remove Inth from ${client}`;
  }
  if (result.status === "removed") {
    return `Inth removed from ${client}`;
  }
  if (
    result.status === "not-configured" ||
    (action === "remove" && result.status === "unchanged")
  ) {
    return `Inth is not configured in ${client}`;
  }
  return result.changed
    ? `Inth added to ${client}`
    : `Inth is configured in ${client}`;
};

export const mcpSummary = (
  results: McpResult[],
  action: string,
  dryRun: boolean,
  environment: McpEnvironment,
  display: DisplayOptions
): string => {
  const width = Math.max(20, display.columns - 1);
  const lines = [""];
  for (const result of results) {
    lines.push(
      style(
        `  ${wrapText(headline(result, action), width - 2, "  ")}`,
        "1",
        display.color
      ),
      "",
      `  Scope   ${wrapText(result.scope === "global" ? "All projects" : "This project", width - 10, "          ")}`,
      style(
        `  Config  ${fitPath(abbreviatePath(result, environment), width - 10)}`,
        "2",
        display.color
      )
    );
    if (
      result.agent === "codex" &&
      result.scope === "global" &&
      environment.codexHome
    ) {
      lines.push(
        `  ${wrapText("Using the Codex profile selected by CODEX_HOME.", width - 2, "  ")}`
      );
    }
    if (result.nextStep) {
      lines.push(
        "",
        `  ${wrapText(result.nextStep.instruction, width - 2, "  ")}`,
        "",
        // Keep commands intact so copied text remains executable.
        style(`    ${result.nextStep.command}`, "1;36", display.color)
      );
    }
    if (dryRun) {
      lines.push(
        "",
        `  ${wrapText("Dry run. No files changed.", width - 2, "  ")}`
      );
    }
    lines.push("");
  }
  return lines.join("\n");
};
