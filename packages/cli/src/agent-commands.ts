import type { AgentAuth } from "./agent-auth.ts";
import type { CliArguments } from "./arguments.ts";
import { CAPABILITIES } from "./auth-types.ts";
import { CliError } from "./cli-error.ts";
import { printResult } from "./output.ts";

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

export const requestedAgentScopes = (value?: string): string[] => {
  const scopes = (value ?? "organizations.read")
    .split(",")
    .map((scope) => scope.trim());
  if (scopes.some((scope) => !CAPABILITIES.includes(scope))) {
    throw new CliError(
      "usage_error",
      `Choose comma-separated scopes from: ${CAPABILITIES.join(", ")}.`
    );
  }
  return [...new Set(scopes)];
};

export const runAgentCommand = async (
  options: CliArguments,
  auth: AgentAuth
): Promise<boolean> => {
  if (
    options.authMode !== "agent" ||
    !["auth", "logout"].includes(options.command)
  ) {
    return false;
  }
  if (options.command === "logout") {
    await auth.logout();
    printResult(
      options.json,
      "Auth.md credentials removed and the saved access token revoked.",
      JSON.stringify({ credentialSource: "auth.md", signedOut: true })
    );
    return true;
  }
  let output = "";
  if (options.argument === "start") {
    output = await auth.start(
      options.values.find((entry) => entry.name === "email")?.value ?? "",
      requestedAgentScopes(
        options.values.find((entry) => entry.name === "scopes")?.value
      )
    );
  } else if (options.argument === "complete") {
    output = await auth.complete();
  } else if (options.argument === "retry") {
    output = await auth.retry();
  } else if (options.argument === "organizations") {
    output = await auth.organizations();
  } else {
    if (options.argument === "refresh") {
      await auth.accessToken(undefined, true);
    }
    output = await auth.status();
  }
  // Only the sanitized status or organization response reaches stdout.
  printResult(
    options.json,
    JSON.stringify(JSON.parse(output), null, 2),
    output
  );
  return true;
};

export const runSelectedAgentCommand = async (
  options: CliArguments,
  getAgent: () => Promise<AgentAuth>
): Promise<boolean> => {
  if (
    options.authMode !== "agent" ||
    !["auth", "logout"].includes(options.command)
  ) {
    return false;
  }
  return runAgentCommand(options, await getAgent());
};
