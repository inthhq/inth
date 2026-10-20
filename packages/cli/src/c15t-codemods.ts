import type { CliArguments } from "./arguments.ts";
import { CliError } from "./cli-error.ts";
import type { CodemodOptions } from "./native/c15t-codemods/command.ts";

export const C15T_CODEMODS_USAGE =
  "Usage: inth c15t codemods <names...> [--dry-run] [--json] | --list [--json]";

export const c15tCodemodsHelp = (): string =>
  [
    "Rewrite c15t v2 source files for c15t v3 in a hosted app.",
    "",
    C15T_CODEMODS_USAGE,
    "",
    "Codemods run in the order --list shows, whatever order you name them in.",
    "Where an app uses offline or custom mode, inth leaves that code alone and adds a TODO(c15t v3) comment.",
    "No sign-in or Inth project is needed. Only files in this app change.",
    "",
    "Options:",
    "  --list             List the codemods and whether each applies to the installed c15t",
    "  --dry-run          Report the changes without writing files",
    "  --json             Print the result as JSON; progress goes to stderr",
    "  --non-interactive  Accepted for scripts; codemods never prompt",
    "",
    "Examples:",
    "  inth c15t codemods --list",
    "  inth c15t codemods packages-to-c15t consent-provider-options --dry-run",
    "  inth c15t codemods packages-to-c15t --json",
  ].join("\n");

/**
 * Parse the arguments after `inth c15t codemods`, including the shared flags
 * the main parser would otherwise consume.
 * @param result The arguments parsed so far; receives --help, --json and
 * --non-interactive.
 * @param args The arguments after `codemods`.
 * @returns The codemods to run and how.
 * @throws {CliError} usage_error for an unknown option, or for names with
 * --list.
 */
export const parseCodemodsArguments = (
  result: CliArguments,
  args: string[]
): CodemodOptions => {
  const codemods: CodemodOptions = { dryRun: false, list: false, names: [] };
  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if (arg === "--json") {
      result.json = true;
    } else if (arg === "--non-interactive") {
      result.nonInteractive = true;
    } else if (arg === "--dry-run") {
      codemods.dryRun = true;
    } else if (arg === "--list") {
      codemods.list = true;
    } else if (arg.startsWith("-")) {
      throw new CliError(
        "usage_error",
        `Unknown option "${arg}". Run inth c15t codemods --help.`
      );
    } else if (!codemods.names.includes(arg)) {
      codemods.names.push(arg);
    }
  }
  if (codemods.list && codemods.names.length > 0) {
    throw new CliError(
      "usage_error",
      "--list takes no codemod names. Run inth c15t codemods --list on its own."
    );
  }
  return codemods;
};
