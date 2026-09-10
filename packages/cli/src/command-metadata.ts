import { RESOURCE_COMMANDS } from "./resource-commands.ts";
import type { ResourceCommand } from "./resource-commands.ts";

export interface OptionMetadata {
  name: string;
  type: string;
  description: string;
  required: boolean;
  values: string[];
  defaultValue: string | null;
}
export interface CommandMetadata {
  command: string;
  action: string;
  usage: string;
  description: string;
  authentication: string;
  scopes: string[];
  effects: string[];
  options: OptionMetadata[];
  examples: string[];
  paginated: boolean;
}
const option = (
  name: string,
  type: string,
  description: string,
  values: string[] = [],
  defaultValue: string | null = null
): OptionMetadata => ({
  defaultValue,
  description,
  name,
  required: false,
  type,
  values,
});
export const OPTION_METADATA: OptionMetadata[] = [
  option(
    "json",
    "boolean",
    "Emit one JSON result; disable prompts and browser login"
  ),
  option("non-interactive", "boolean", "Disable prompts and browser login"),
  option("help", "boolean", "Show help for this command"),
  option("version", "boolean", "Show the CLI version"),
  option("complete", "boolean", "Check browser approval and finish signing in"),
  option(
    "wait",
    "boolean",
    "Wait for browser approval and finish sign-in automatically"
  ),
  option(
    "timeout",
    "integer",
    "Maximum approval wait in seconds, 1 through 3600",
    [],
    "600"
  ),
  option(
    "auth",
    "string",
    "Override the selected saved connection",
    ["browser", "agent"],
    null
  ),
  option(
    "scopes",
    "string",
    "Comma-separated account permissions",
    [],
    "organizations.read"
  ),
  option(
    "yes",
    "boolean",
    "Confirm sending the email and requested scopes to Inth for approval"
  ),
  option("token", "string", "Organization API key; overrides INTH_TOKEN"),
  option("organization", "string", "Organization ID or local default override"),
  option("no-browser", "boolean", "Print the approval URL without opening it"),
  option("name", "string", "Resource name"),
  option("slug", "string", "Organization slug"),
  option("limit", "integer", "Page size, 1 through 100", [], "50"),
  option(
    "cursor",
    "string",
    "Opaque pagination.nextCursor from the previous page"
  ),
  option("region", "string", "Project region ID from inth region list"),
  option("description", "string", "Project description"),
  option("branding", "string", "Consent branding", ["inth", "c15t", "none"]),
  option(
    "trusted-origins",
    "json-array",
    "Consent origins as a JSON array of strings"
  ),
  option("email", "string", "Sign-in or invitation email address"),
  option("role", "string", "Organization role", ["owner", "admin", "member"]),
  option("repository", "string", "Repository ID"),
  option("status", "string", "Filter or update the resource status"),
  option("request-id", "string", "Idempotency key for scan start retries"),
  option(
    "item-version",
    "integer",
    "Version from the last read of this Inbox item"
  ),
  option(
    "method",
    "string",
    "HTTP request method",
    ["GET", "POST", "PATCH", "DELETE"],
    "GET"
  ),
  option(
    "data",
    "json-object",
    "JSON body; replaces individual body options, including required fields"
  ),
  option("agent", "string", "MCP client to configure", [
    "codex",
    "claude-code",
    "cursor",
    "vscode",
    "opencode",
  ]),
  option("scope", "string", "MCP configuration location", [
    "project",
    "global",
  ]),
  option(
    "dry-run",
    "boolean",
    "Preview configuration changes without writing files"
  ),
];
const baseOptions = ["json", "non-interactive", "help", "version"];
export const commandOptions = (
  names: string[],
  required: string[] = [],
  group = ""
): OptionMetadata[] =>
  OPTION_METADATA.filter((item) =>
    [...baseOptions, ...names].includes(item.name)
  ).map((item) => ({
    ...item,
    required: required.includes(item.name),
    values:
      item.name === "status" && group === "inbox"
        ? ["open", "accepted", "dismissed", "resolved"]
        : item.values,
  }));
const descriptions = [
  ["org list", "List organizations"],
  ["org get", "Read an organization"],
  ["org create", "Create an organization"],
  ["region list", "List available project regions"],
  ["project list", "List projects"],
  ["project get", "Read a project and its consent settings"],
  ["project create", "Create a project"],
  ["project update", "Update a project"],
  ["project delete", "Delete a project"],
  ["member list", "List organization members"],
  ["member update", "Change a member's role"],
  ["member remove", "Remove a member"],
  ["invitation list", "List pending invitations"],
  ["invitation create", "Send an invitation"],
  ["invitation cancel", "Cancel an invitation"],
  ["api-key list", "List organization API keys"],
  ["api-key create", "Create an API key; its secret is shown once"],
  ["api-key roll", "Rotate an API key; its secret is shown once"],
  ["api-key delete", "Revoke an API key"],
  ["billing", "Read the plan and credit balance"],
  ["code-audit repositories", "List connected repositories"],
  ["code-audit scans", "List scans"],
  ["code-audit start", "Start a scan of the production branch"],
  ["code-audit request", "Check a pending scan request"],
  ["code-audit get", "Read a scan and its progress"],
  ["code-audit issues", "Read scan findings"],
  ["code-audit unlock", "Spend credits to unlock a report"],
  ["inbox list", "List Inbox findings"],
  ["inbox get", "Read a finding"],
  ["inbox update", "Change a finding's status"],
  ["inbox github-issue", "Create a GitHub issue for a finding"],
];
const resourceEffects = (spec: ResourceCommand): string[] => {
  const effects =
    spec.method === "GET" ? [] : ["Writes take effect immediately."];
  if (
    spec.command === "code-audit" &&
    ["start", "unlock"].includes(spec.action)
  ) {
    effects.push("Can spend organization credits.");
  }
  if (spec.command === "api-key" && ["create", "roll"].includes(spec.action)) {
    effects.push("Returns a secret once. Store it securely.");
  }
  if (spec.action === "github-issue") {
    effects.push("Creates an issue on GitHub.");
  }
  return effects;
};
const resourceMetadata = (spec: ResourceCommand): CommandMetadata => {
  const key = `${spec.command} ${spec.action}`.trim();
  const write = spec.method !== "GET";
  const names = ["token", "auth", ...spec.fields];
  if (spec.scoped) {
    names.push("organization");
  }
  if (spec.paginated) {
    names.push("limit", "cursor");
  }
  if (write && spec.fields.length && spec.command !== "org") {
    names.push("data");
  }
  let family = spec.command;
  if (family === "org") {
    family = "organizations";
  }
  if (family === "project") {
    family = "projects";
  }
  if (family === "member" || family === "invitation") {
    family = "members";
  }
  if (family === "api-key") {
    family = "api-keys";
  }
  const scopes =
    spec.command === "region" ? [] : [`${family}.${write ? "write" : "read"}`];
  const keyAllowed =
    spec.command === "region" ||
    spec.command === "project" ||
    (!write && ["org", "api-key", "inbox", "billing"].includes(spec.command));
  const usage = `inth ${key}${spec.path.includes(":id") ? " <id>" : ""}${spec.required.map((name) => ` --${name} <${name}>`).join("")}`;
  const effects = resourceEffects(spec);
  return {
    action: spec.action,
    authentication: keyAllowed
      ? "browser-or-agent-or-api-key"
      : "browser-or-agent",
    command: spec.command,
    description: descriptions.find((entry) => entry[0] === key)?.[1] ?? key,
    effects,
    examples: [usage, `${usage} --json`],
    options: commandOptions(names, spec.required, spec.command),
    paginated: spec.paginated,
    scopes,
    usage,
  };
};
const localExamples = (
  command: string,
  action: string,
  positional: string
): string[] => {
  if (command === "login") {
    return [
      "inth login",
      "inth login --email <email> --json",
      "inth login --email <email> --scopes organizations.read,organizations.write,projects.read,projects.write --json",
      "inth login --complete --wait --json",
    ];
  }
  if (command === "mcp") {
    return [
      `inth mcp ${action} --agent codex --scope project`,
      `inth mcp ${action} --agent cursor --scope global --json`,
    ];
  }
  return [`inth ${command}${action ? ` ${action}` : ""}${positional}`];
};
const localCommand = (
  command: string,
  action: string,
  description: string,
  names: string[],
  authentication: string,
  effects: string[],
  positional = ""
): CommandMetadata => ({
  action,
  authentication,
  command,
  description,
  effects,
  examples: localExamples(command, action, positional),
  options: commandOptions(names),
  paginated: false,
  scopes: [],
  usage: `inth ${command}${action ? ` ${action}` : ""}${positional}`,
});
export const COMMAND_METADATA: CommandMetadata[] = [
  {
    action: "",
    authentication: "none",
    command: "skills",
    description: "Browse and install Inth agent skills",
    effects: [
      "Opens a native picker when no source or skill is specified. The bundled catalog works offline.",
      "Installation requires Node.js and npm. An explicit source bypasses the picker.",
      "Runs npx skills@1.5.25 add and forwards installer options. Installs files in your project or home directory.",
      "Installer output is text. --json is supported with --list or --help.",
    ],
    examples: [
      "inth skills",
      "inth skills c15t/skills --skill c15t",
      "inth skills owner/repo --agent claude-code --global --yes",
      "inth skills --list",
      "inth skills --list --json",
    ],
    options: [
      option("help", "boolean", "Show help for this command"),
      option("non-interactive", "boolean", "Require --yes, --all, or --list"),
      option("skill", "string[]", "Skill names to install"),
      option("agent", "string[]", "Agents supported by the skills installer"),
      option("global", "boolean", "Install in your home directory"),
      option("yes", "boolean", "Skip installer confirmation prompts"),
      option(
        "list",
        "boolean",
        "List Inth skills offline, or inspect an explicit repository"
      ),
      option("copy", "boolean", "Copy files instead of creating symlinks"),
      option(
        "all",
        "boolean",
        "Install all skills to all agents without prompts"
      ),
    ],
    paginated: false,
    scopes: [],
    usage: "inth skills [owner/repo]",
  },
  localCommand(
    "login",
    "",
    "Sign in or create an account",
    [
      "token",
      "organization",
      "no-browser",
      "email",
      "scopes",
      "complete",
      "wait",
      "timeout",
      "yes",
    ],
    "none",
    [
      "With --email, sends the email and requested permissions to Inth and returns an approval URL and code. The person signs in or creates their account in the browser.",
      "Show the approval link, then run inth login --complete --wait --json in the background. Successful sign-in selects this connection for subsequent commands.",
      "Without --email, opens interactive browser sign-in and saves a default organization.",
    ]
  ),
  localCommand(
    "signup",
    "",
    "Create an account through browser approval",
    ["email", "scopes", "complete", "wait", "timeout", "yes"],
    "none",
    [
      "Sends the email and requested permissions to Inth. The person creates and verifies their account in the browser, then approves access.",
      "Show the approval link, then run inth login --complete --wait --json in the background. Existing accounts can sign in on the same page.",
    ],
    " --email <email> --json"
  ),
  localCommand(
    "logout",
    "",
    "Revoke the selected CLI session and remove saved credentials",
    ["token", "auth"],
    "browser-or-agent",
    ["Revokes the selected saved session."]
  ),
  localCommand(
    "whoami",
    "",
    "Read identity, organizations, and capabilities",
    ["token", "auth", "organization"],
    "browser-or-agent-or-api-key",
    []
  ),
  localCommand(
    "auth",
    "status",
    "Show local credential status without checking validity",
    ["token", "auth", "organization"],
    "none",
    []
  ),
  localCommand(
    "auth",
    "refresh",
    "Refresh the selected saved sign-in",
    ["token", "auth"],
    "browser-or-agent",
    ["Replaces saved credentials."]
  ),
  localCommand(
    "auth",
    "start",
    "Start resumable auth.md approval",
    ["email", "scopes", "yes"],
    "none",
    [
      "Sends the email and requested scopes to Inth. Saves the pending claim in the OS credential store.",
    ],
    " --email <email> --yes"
  ),
  localCommand(
    "auth",
    "complete",
    "Finish approval and select the connection; add --wait to wait automatically",
    ["wait", "timeout"],
    "agent",
    ["Consumes the single-use claim after human approval."]
  ),
  localCommand(
    "auth",
    "retry",
    "Replace the pending approval code",
    [],
    "agent",
    ["Invalidates the previous approval code."]
  ),
  localCommand(
    "auth",
    "organizations",
    "List organizations through the auth.md discovery API",
    [],
    "agent",
    []
  ),
  ...RESOURCE_COMMANDS.map(resourceMetadata),
  localCommand(
    "api",
    "",
    "Make a raw API request",
    ["token", "auth", "organization", "method", "data"],
    "browser-or-agent-or-api-key",
    [
      "POST, PATCH, and DELETE can change data immediately. Required scopes depend on the endpoint.",
    ],
    " <path>"
  ),
  localCommand(
    "switch",
    "",
    "Set your default organization",
    ["token", "auth", "organization"],
    "browser-or-agent-or-api-key",
    ["Changes the saved default organization."],
    " [organization-id-or-slug]"
  ),
  localCommand(
    "link",
    "",
    "Save an organization default for this directory",
    ["token", "auth", "organization"],
    "browser-or-agent-or-api-key",
    ["Writes .inth/project.json."],
    " [organization-id-or-slug]"
  ),
  localCommand(
    "mcp",
    "setup",
    "Configure Inth MCP in a coding client",
    ["agent", "scope", "dry-run"],
    "client-oauth",
    ["Writes client configuration. Sign in through the client after setup."]
  ),
  localCommand(
    "mcp",
    "list",
    "Show Inth MCP configuration",
    ["agent", "scope"],
    "none",
    []
  ),
  localCommand(
    "mcp",
    "remove",
    "Remove Inth MCP from a coding client",
    ["agent", "scope", "dry-run"],
    "none",
    ["Removes only the Inth server entry."]
  ),
  localCommand("telemetry", "enable", "Enable usage telemetry", [], "none", [
    "Saves your telemetry preference and a random installation ID.",
  ]),
  localCommand("telemetry", "disable", "Disable usage telemetry", [], "none", [
    "Disables telemetry and removes the installation ID.",
  ]),
  localCommand(
    "telemetry",
    "status",
    "Show whether CLI telemetry is enabled",
    [],
    "none",
    []
  ),
];
