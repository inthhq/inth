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
    if (command !== "api" || !["method", "data"].includes(entry.name)) {
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
  if (result.command === "mcp") {
    validateMcpArguments(result, count);
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
  if (command === "auth" && !["status", "refresh"].includes(result.argument)) {
    throw new CliError("usage_error", "Usage: inth auth <status|refresh>");
  }
  validateCommandOptions(result);
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
    } else if (arg === "--dry-run") {
      setOption(result, "dry-run", "true");
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
  validateArguments(result, positional.length);
  return result;
};
