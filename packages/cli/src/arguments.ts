import { CliError } from "./cli-error.ts";
import { COMMAND_METADATA, OPTION_METADATA } from "./command-metadata.ts";
import { terminalText } from "./organizations.ts";
import {
  buildResourceRequest,
  rawApiRequest,
  RESOURCE_COMMANDS,
} from "./resource-commands.ts";

export interface CliArguments {
  command: string;
  argument: string;
  id: string;
  values: { name: string; value: string }[];
  token?: string;
  authMode?: string;
  name?: string;
  slug?: string;
  organization?: string;
  noBrowser: boolean;
  json: boolean;
  nonInteractive: boolean;
  help: boolean;
  version: boolean;
}

const validateCommandOptions = (result: CliArguments): void => {
  const { command } = result;
  for (const entry of result.values) {
    if (
      !(command === "api" && ["method", "data"].includes(entry.name)) &&
      !(
        command === "auth" &&
        result.argument === "complete" &&
        ["wait", "timeout"].includes(entry.name)
      ) &&
      !(
        command === "auth" &&
        result.argument === "start" &&
        ["email", "scopes", "yes"].includes(entry.name)
      )
    ) {
      throw new CliError(
        "usage_error",
        `--${entry.name} is not available with ${command}.`
      );
    }
  }
  if (command === "api") {
    if (!result.argument) {
      throw new CliError(
        "usage_error",
        "Usage: inth api /v1/<path> [--method <method>] [--data <json>]"
      );
    }
    rawApiRequest(result);
  }
};

const validateMcpArguments = (result: CliArguments, count: number): void => {
  if (count > 2 || !["", "setup", "list", "remove"].includes(result.argument)) {
    throw new CliError(
      "usage_error",
      "Usage: inth mcp [setup|list|remove] [--agent <client>] [--scope project|global]"
    );
  }
  if (result.token || result.organization || result.noBrowser) {
    throw new CliError(
      "usage_error",
      "MCP uses client OAuth. Token, organization, and browser-login flags do not apply."
    );
  }
  for (const entry of result.values) {
    const spec = OPTION_METADATA.find((item) => item.name === entry.name);
    if (
      !["agent", "scope", "dry-run"].includes(entry.name) ||
      (entry.name === "dry-run" && result.argument === "list")
    ) {
      throw new CliError(
        "usage_error",
        `--${entry.name} is not available with this MCP command.`
      );
    }
    if (spec?.values.length && !spec.values.includes(entry.value)) {
      throw new CliError(
        "usage_error",
        `--${entry.name} must be one of: ${spec.values.join(", ")}.`
      );
    }
  }
};
const validateTelemetryArguments = (
  result: CliArguments,
  count: number
): void => {
  if (
    count !== 2 ||
    !["enable", "disable", "status"].includes(result.argument) ||
    result.token ||
    result.organization ||
    result.noBrowser ||
    result.values.length
  ) {
    throw new CliError(
      "usage_error",
      "Usage: inth telemetry <enable|disable|status> [--json]"
    );
  }
};
const validateCredentialMode = (result: CliArguments): void => {
  if (result.authMode && !["browser", "agent"].includes(result.authMode)) {
    throw new CliError("usage_error", "--auth must be browser or agent.");
  }
  if (result.authMode && ["mcp", "login"].includes(result.command)) {
    throw new CliError(
      "usage_error",
      "Use inth auth start for agent sign-in. --auth does not apply to login or MCP."
    );
  }
};
const validateAuthArguments = (result: CliArguments): void => {
  const timeout = result.values.find(
    (entry) => entry.name === "timeout"
  )?.value;
  if (
    timeout !== undefined &&
    (!result.values.some((entry) => entry.name === "wait") ||
      !/^\d+$/u.test(timeout) ||
      Number(timeout) < 1 ||
      Number(timeout) > 3600)
  ) {
    throw new CliError(
      "usage_error",
      "Use --timeout with --wait, from 1 to 3600 seconds."
    );
  }
  if (
    result.command === "auth" &&
    ![
      "status",
      "refresh",
      "start",
      "complete",
      "retry",
      "organizations",
    ].includes(result.argument)
  ) {
    throw new CliError(
      "usage_error",
      "Usage: inth auth <start|complete|retry|status|refresh|organizations>"
    );
  }
  if (
    result.command === "auth" &&
    ["start", "complete", "retry", "organizations"].includes(result.argument)
  ) {
    if (result.authMode === "browser" || result.organization) {
      throw new CliError(
        "usage_error",
        "This auth.md command does not accept browser or organization overrides."
      );
    }
    result.authMode = "agent";
  }
  if (
    result.command === "auth" &&
    result.argument === "start" &&
    (!result.values.some((entry) => entry.name === "email") ||
      !result.values.some((entry) => entry.name === "yes"))
  ) {
    throw new CliError(
      "usage_error",
      "Use inth auth start --email <email> [--scopes <scopes>] --yes. --yes confirms sending that email and the requested scopes to Inth for approval."
    );
  }
};
const validateArguments = (result: CliArguments, count: number): void => {
  if (result.version || !result.command) {
    return;
  }
  if (result.help) {
    if (
      !COMMAND_METADATA.some(
        (entry) =>
          entry.command === result.command &&
          (!result.argument ||
            !entry.action ||
            entry.action === result.argument)
      )
    ) {
      throw new CliError(
        "usage_error",
        `Unknown command "${terminalText(`${result.command} ${result.argument}`.trim())}". Run inth --help.`
      );
    }
    return;
  }
  validateCredentialMode(result);
  if (result.command === "mcp") {
    validateMcpArguments(result, count);
    return;
  }
  if (result.command === "telemetry") {
    validateTelemetryArguments(result, count);
    return;
  }
  const resource = RESOURCE_COMMANDS.some(
    (entry) => entry.command === result.command
  );
  if (count > (resource ? 3 : 2)) {
    throw new CliError("usage_error", "Too many arguments. Run inth --help.");
  }
  const { command } = result;
  if (command === "status" || command === "refresh") {
    throw new CliError(
      "usage_error",
      `Unknown command "${command}". Did you mean "inth auth ${command}"?`
    );
  }
  if (result.noBrowser && command !== "login") {
    throw new CliError(
      "usage_error",
      "--no-browser is only available with login."
    );
  }
  if (resource) {
    buildResourceRequest(result);
    return;
  }
  if (
    !["login", "logout", "auth", "api", "switch", "link", "whoami"].includes(
      command
    )
  ) {
    throw new CliError(
      "usage_error",
      'Unknown command. Run "inth --help" for available commands.'
    );
  }
  if (["login", "logout", "whoami"].includes(command) && result.argument) {
    throw new CliError(
      "usage_error",
      `Usage: inth ${command}${command === "login" ? " [--no-browser] [--organization <id>]" : ""}`
    );
  }
  validateAuthArguments(result);
  validateCommandOptions(result);
};
const normalizeAccountSignIn = (result: CliArguments): void => {
  if (
    result.help ||
    result.version ||
    !["login", "signup"].includes(result.command)
  ) {
    return;
  }
  const email = result.values.some((entry) => entry.name === "email");
  const complete = result.values.some((entry) => entry.name === "complete");
  if (!email && !complete && result.command === "login") {
    return;
  }
  if (
    result.argument ||
    result.authMode === "browser" ||
    result.organization ||
    result.noBrowser
  ) {
    throw new CliError(
      "usage_error",
      "Use inth login --email <email> --json, or inth login --complete --json."
    );
  }
  if (
    complete &&
    result.values.some(
      (entry) => !["complete", "wait", "timeout"].includes(entry.name)
    )
  ) {
    throw new CliError(
      "usage_error",
      "Use inth login --complete without email, scopes, or approval options."
    );
  }
  if (!email && !complete) {
    throw new CliError(
      "usage_error",
      "Use inth signup --email <email> --json. The person creates their account on the approval page."
    );
  }
  result.command = "auth";
  result.argument = complete ? "complete" : "start";
  result.values = result.values.filter((entry) => entry.name !== "complete");
  if (!complete && !result.values.some((entry) => entry.name === "yes")) {
    result.values.push({ name: "yes", value: "true" });
  }
};
const setOption = (
  result: CliArguments,
  option: string,
  value: string
): void => {
  if (option === "token") {
    if (result.token !== undefined) {
      throw new CliError("usage_error", "Use --token only once.");
    }
    result.token = value;
  } else if (option === "auth") {
    if (result.authMode) {
      throw new CliError("usage_error", "Use --auth only once.");
    }
    result.authMode = value;
  } else if (option === "organization") {
    if (result.organization !== undefined) {
      throw new CliError("usage_error", "Use --organization only once.");
    }
    result.organization = value;
  } else {
    if (result.values.some((entry) => entry.name === option)) {
      throw new CliError("usage_error", `Use --${option} only once.`);
    }
    result.values.push({ name: option, value });
    if (option === "name") {
      result.name = value;
    }
    if (option === "slug") {
      result.slug = value;
    }
  }
};

const consumeOption = (
  result: CliArguments,
  args: string[],
  index: number,
  arg: string
): number => {
  const equals = arg.indexOf("=");
  const option = (equals === -1 ? arg : arg.slice(0, equals)).slice(2);
  if (
    !arg.startsWith("--") ||
    !OPTION_METADATA.some(
      (entry) => entry.name === option && entry.type !== "boolean"
    )
  ) {
    throw new CliError(
      "usage_error",
      `Unknown option "${terminalText(equals === -1 ? arg : arg.slice(0, equals))}". Run inth ${result.command ? `${terminalText(result.command)} ` : ""}--help for available options.`
    );
  }
  if (equals === -1 && index + 1 >= args.length) {
    throw new CliError("usage_error", `Provide a value for --${option}.`);
  }
  const value = equals === -1 ? args[index + 1] : arg.slice(equals + 1);
  if (
    value === undefined ||
    value.startsWith("--") ||
    (!value && option !== "description")
  ) {
    throw new CliError("usage_error", `Provide a value for --${option}.`);
  }
  setOption(result, option, value);
  return equals === -1 ? index + 1 : index;
};

export const parseArguments = (args: string[]): CliArguments => {
  const result: CliArguments = {
    argument: "",
    command: "",
    help: false,
    id: "",
    json: false,
    noBrowser: false,
    nonInteractive: false,
    values: [],
    version: false,
  };
  const positional: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if (arg === "--version" || arg === "-v") {
      result.version = true;
    } else if (arg === "--no-browser") {
      result.noBrowser = true;
    } else if (["--dry-run", "--yes", "--complete", "--wait"].includes(arg)) {
      setOption(result, arg.slice(2), "true");
    } else if (arg === "--json") {
      result.json = true;
    } else if (arg === "--non-interactive") {
      result.nonInteractive = true;
    } else if (arg.startsWith("-")) {
      index = consumeOption(result, args, index, arg);
    } else {
      positional.push(arg);
    }
  }
  result.command = positional[0] ?? "";
  result.argument = positional[1] ?? "";
  result.id = positional[2] ?? "";
  normalizeAccountSignIn(result);
  validateArguments(result, positional.length);
  return result;
};
