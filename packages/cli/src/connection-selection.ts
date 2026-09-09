import type { AgentEnvironment } from "./agent-environment.ts";
import type { CliArguments } from "./arguments.ts";
import { CliError } from "./cli-error.ts";

export const requireAgentCredentialSelection = (
  options: CliArguments,
  key?: string
): void => {
  if (options.authMode === "agent" && key) {
    throw new CliError(
      "usage_error",
      "--auth agent cannot be combined with --token or INTH_TOKEN. Unset the API key to use the approved agent credential."
    );
  }
};

export const parseConnection = (source: string): string => {
  try {
    // SAFETY: Scriptc validates the record; both runtimes check the allowed values.
    const value = JSON.parse(source) as { auth: string };
    if (value.auth === "browser" || value.auth === "agent") {
      return value.auth;
    }
  } catch {
    // An invalid selection must not silently choose another account.
  }
  throw new CliError(
    "invalid_config",
    "Invalid saved connection. Sign in again or select --auth browser or --auth agent explicitly."
  );
};

export const resolveConnection = async (
  options: CliArguments,
  key: string | undefined,
  read: () => Promise<string | undefined>
): Promise<string> => {
  if (options.authMode) {
    return options.authMode;
  }
  if (key || ["login", "mcp", "telemetry"].includes(options.command)) {
    return "browser";
  }
  return (await read()) ?? "browser";
};

export const selectCommandConnection = async (
  options: CliArguments,
  key: string | undefined,
  read: () => Promise<string | undefined>,
  environment: AgentEnvironment
): Promise<void> => {
  options.authMode = await resolveConnection(options, key, read);
  requireAgentCredentialSelection(options, key);
  if (
    environment.apiOrigin !== "https://api.inth.com" &&
    options.authMode !== "agent"
  ) {
    throw new CliError(
      "usage_error",
      "Sign in to this local API first with inth login --email <email> --json, or select --auth agent."
    );
  }
};
