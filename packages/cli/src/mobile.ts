import type { CliArguments } from "./arguments.ts";
import { CliError } from "./cli-error.ts";
import { terminalText } from "./organizations.ts";

export const MOBILE_SETUP_USAGE =
  "Usage: inth mobile setup --backend-url <url> --privacy-policy-url <url> [--categories <list>] [--overwrite] [--dry-run] [--json]";

/** Arguments for `inth mobile setup`, which runs without sign-in. */
export interface MobileSetupArguments {
  /** "" until checked; the project URL from the Inth dashboard. */
  backendUrl: string;
  privacyPolicyUrl: string;
  /** Comma-separated, or "" for the defaults. */
  categories: string;
  overwrite: boolean;
  dryRun: boolean;
}

const VALUE_OPTIONS = new Set([
  "backend-url",
  "privacy-policy-url",
  "categories",
]);

const setValue = (
  mobile: MobileSetupArguments,
  option: string,
  value: string
): void => {
  if (value === "" || value.startsWith("--")) {
    throw new CliError("usage_error", `Provide a value for --${option}.`);
  }
  const seen =
    (option === "backend-url" && mobile.backendUrl !== "") ||
    (option === "privacy-policy-url" && mobile.privacyPolicyUrl !== "") ||
    (option === "categories" && mobile.categories !== "");
  if (seen) {
    throw new CliError("usage_error", `Use --${option} only once.`);
  }
  if (option === "backend-url") {
    mobile.backendUrl = value;
  } else if (option === "privacy-policy-url") {
    mobile.privacyPolicyUrl = value;
  } else {
    mobile.categories = value;
  }
};

/**
 * Parse the arguments after `inth mobile`, including the shared flags the
 * main parser would otherwise consume.
 * @param result The arguments parsed so far; receives the action, --help,
 * --json and --non-interactive.
 * @param args The arguments after `mobile`.
 * @returns The setup arguments.
 * @throws {CliError} usage_error for an unknown action or option.
 */
export const parseMobileArguments = (
  result: CliArguments,
  args: string[]
): MobileSetupArguments => {
  const mobile: MobileSetupArguments = {
    backendUrl: "",
    categories: "",
    dryRun: false,
    overwrite: false,
    privacyPolicyUrl: "",
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    const equals = arg.indexOf("=");
    const option = (equals === -1 ? arg : arg.slice(0, equals)).slice(2);
    if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if (arg === "--json") {
      result.json = true;
    } else if (arg === "--non-interactive") {
      result.nonInteractive = true;
    } else if (arg === "--dry-run") {
      mobile.dryRun = true;
    } else if (arg === "--overwrite") {
      mobile.overwrite = true;
    } else if (arg.startsWith("--") && VALUE_OPTIONS.has(option)) {
      if (equals === -1) {
        index += 1;
        setValue(mobile, option, args[index] ?? "");
      } else {
        setValue(mobile, option, arg.slice(equals + 1));
      }
    } else if (arg.startsWith("-")) {
      throw new CliError(
        "usage_error",
        `Unknown option "${terminalText(equals === -1 ? arg : arg.slice(0, equals))}". Run inth mobile setup --help.`
      );
    } else if (arg === "setup" && result.argument === "") {
      result.argument = arg;
    } else {
      throw new CliError("usage_error", MOBILE_SETUP_USAGE);
    }
  }
  if (result.argument === "" && !result.help) {
    throw new CliError("usage_error", MOBILE_SETUP_USAGE);
  }
  return mobile;
};
