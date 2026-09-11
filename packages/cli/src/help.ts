/* eslint-disable unicorn/prefer-single-call -- Scriptc cannot mix positional and spread arguments in push. */
import { COMMAND_METADATA, OPTION_METADATA } from "./command-metadata.ts";
import type { CommandMetadata, OptionMetadata } from "./command-metadata.ts";
import { padText, textWidth, wrapText } from "./display.ts";
import { VERSION } from "./version.ts";

export const COMMANDS = COMMAND_METADATA.map((entry) =>
  entry.command === "api"
    ? "api <path> [--method <method>] [--data <json>]"
    : entry.usage.slice(5)
);
export const OPTIONS = OPTION_METADATA.map(
  (entry) => `--${entry.name}${entry.type === "boolean" ? "" : " <value>"}`
);
const groupDescriptions = [
  ["telemetry", "Enable, disable, or inspect usage telemetry"],
  ["auth", "Manage sign-in, approval, and saved credentials"],
  ["org", "List, create, and inspect organizations"],
  ["project", "Manage projects and consent settings"],
  ["member", "Manage organization members and roles"],
  ["invitation", "Send and manage invitations"],
  ["api-key", "Create, rotate, and revoke API keys"],
  ["code-audit", "Scan repositories and read findings"],
  ["inbox", "Review and update Inbox findings"],
  ["mcp", "Configure Inth MCP in your coding client"],
];
const authenticationDescription = (value: string): string => {
  if (value === "agent") {
    return "Use an approved auth.md connection. Run inth login --email <email> --json first.";
  }
  if (value === "browser-or-agent") {
    return "Use a browser sign-in or an approved auth.md connection with --auth agent.";
  }
  if (value === "browser-or-agent-or-api-key") {
    return "Use a browser sign-in, --auth agent, or an organization API key.";
  }
  if (value === "browser") {
    return "Browser sign-in required. Run inth login first.";
  }
  if (value === "browser-or-api-key") {
    return "Use a browser sign-in or an organization API key.";
  }
  if (value === "client-oauth") {
    return "Sign in to Inth through your coding client after setup.";
  }
  return "No sign-in required.";
};
export const helpCommands = (command = "", action = ""): CommandMetadata[] =>
  COMMAND_METADATA.filter(
    (entry) =>
      (!command || entry.command === command) &&
      (!action || !entry.action || entry.action === action)
  );
const rows = (entries: string[][], columns: number): string[] => {
  const size = Math.max(
    0,
    Math.max(...entries.map((entry) => textWidth(entry[0] ?? "")))
  );
  return entries.map((entry) => {
    const label = entry[0] ?? "";
    const description = entry[1] ?? "";
    if (size + 24 > columns) {
      return `  ${label}\n    ${wrapText(description, columns - 4, "    ")}`;
    }
    return `  ${padText(label, size)}  ${wrapText(description, columns - size - 4, " ".repeat(size + 4))}`;
  });
};
const optionLabel = (item: OptionMetadata): string =>
  `--${item.name}${item.type === "boolean" ? "" : ` <${item.name}>`}`;
const optionDescription = (item: OptionMetadata): string => {
  let { description } = item;
  if (item.required) {
    description += ". Required";
  }
  if (item.values.length) {
    description += `. Values: ${item.values.join(", ")}`;
  }
  if (item.defaultValue !== null) {
    description += `. Default: ${item.defaultValue}`;
  }
  return description;
};
export const formatHelp = (command = "", action = "", columns = 80): string => {
  const width = Math.max(20, columns - 1);
  const entries = helpCommands(command, action);
  const detail = entries.length === 1 ? entries[0] : undefined;
  const lines = [`inth ${VERSION}`, ""];
  if (!command || ["login", "signup"].includes(command)) {
    lines.push(
      "Sign in or create an account from an agent:",
      "  inth login --email <email> --json",
      wrapText(
        "Give the person the returned approval URL and code, then run:",
        width
      ),
      "  inth login --complete --wait --json",
      "Run the waiting command immediately in the background. Approval selects this connection.",
      wrapText(
        "For organization and project setup, add --scopes organizations.read,organizations.write,projects.read,projects.write to login.",
        width
      ),
      ""
    );
  }
  if (detail) {
    lines.push(
      wrapText(detail.description, width),
      "",
      "Usage:",
      `  ${detail.usage} [options]`,
      "",
      "Options:"
    );
    lines.push(
      ...rows(
        detail.options.map((item) => [
          optionLabel(item),
          optionDescription(item),
        ]),
        width
      )
    );
    lines.push(
      "",
      wrapText(authenticationDescription(detail.authentication), width)
    );
    if (detail.scopes.length) {
      lines.push(
        wrapText(`Required scopes: ${detail.scopes.join(", ")}.`, width)
      );
    }
    if (detail.paginated) {
      lines.push(
        wrapText(
          "Returns one page. Pass pagination.nextCursor with --cursor for the next page.",
          width
        )
      );
    }
    for (const effect of detail.effects) {
      lines.push(wrapText(effect, width));
    }
    lines.push("", "Examples:");
    lines.push(...detail.examples.map((example) => `  ${example}`));
  } else {
    lines.push(
      `Usage: inth${command ? ` ${command}` : ""} <command> [options]`,
      "",
      "Commands:"
    );
    if (command) {
      lines.push(
        ...rows(
          entries.map((entry) => [entry.action, entry.description]),
          width
        )
      );
    } else {
      const groups: string[][] = [];
      for (const entry of entries) {
        if (groups.some((group) => group[0] === entry.command)) {
          continue;
        }
        groups.push([
          entry.command,
          groupDescriptions.find((group) => group[0] === entry.command)?.[1] ??
            entry.description,
        ]);
      }
      lines.push(...rows(groups, width));
    }
    const common = OPTION_METADATA.filter((entry) =>
      ["json", "non-interactive", "help", "version"].includes(entry.name)
    );
    lines.push("", "Options:");
    lines.push(
      ...rows(
        common.map((entry) => [optionLabel(entry), entry.description]),
        width
      )
    );
    lines.push(
      "",
      wrapText(
        "Use inth <command> --help for options and examples. Add --json for scripts and agents.",
        width
      )
    );
  }
  return lines.join("\n");
};
