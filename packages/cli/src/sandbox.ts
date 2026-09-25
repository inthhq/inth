import { CliError } from "./cli-error.ts";

// Messages thrown when the state directory cannot be written.
const STATE_FAILURES = new Set([
  "Cannot acquire the credential lock.",
  "Cannot create a private credential directory.",
  "Cannot create a private organization configuration directory.",
  "Cannot save organization configuration.",
  "Cannot save the selected connection. Retry sign-in completion.",
]);
const NETWORK_FAILURE =
  "Could not reach inth. Check your connection and try again.";

// Cursor sets CURSOR_SANDBOX for agent commands it runs in its sandbox.
export const agentSandbox = (cursor?: string): string =>
  cursor ? "Cursor" : "";

// Explain failures that an agent sandbox causes, so agents stop retrying them.
export const sandboxError = (
  error: Error,
  sandbox: string,
  stateDirectory: string
): Error => {
  if (!sandbox || error instanceof CliError) {
    return error;
  }
  if (STATE_FAILURES.has(error.message)) {
    return new CliError(
      "sandbox_restricted",
      `${error.message} ${sandbox}'s agent sandbox blocks writes to ${stateDirectory}, where Inth keeps sign-in locks and settings. Run this command outside the sandbox.`
    );
  }
  if (error.message === NETWORK_FAILURE) {
    return new CliError(
      "sandbox_restricted",
      `Could not reach inth from ${sandbox}'s agent sandbox. Run this command outside the sandbox.`
    );
  }
  return error;
};
