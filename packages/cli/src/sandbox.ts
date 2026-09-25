/* eslint-disable prefer-named-capture-group -- Scriptc supports indexed regex captures. */
import { CliError } from "./cli-error.ts";

// Messages thrown only when the state directory cannot be written. Organization
// config messages are excluded because `inth link` also uses them for <cwd>/.inth.
const STATE_FAILURES = new Set([
  "Cannot acquire the credential lock.",
  "Cannot create a private credential directory.",
  "Cannot save the selected connection. Retry sign-in completion.",
]);
const NETWORK_FAILURE =
  "Could not reach inth. Check your connection and try again.";
// Filesystem errors carry the errno and quoted path, as in Node.
const PERMISSION_FAILURE = /^(?:EACCES|EPERM|EROFS): [^']*'([^']+)'/u;

const within = (path: string, directory: string): boolean =>
  path.startsWith(`${directory}/`) || path.startsWith(`${directory}\\`);

// A fresh account can fail while creating a parent of the state directory.
const blocksState = (message: string, stateDirectory: string): boolean => {
  const path = PERMISSION_FAILURE.exec(message)?.[1];
  if (!path) {
    return false;
  }
  return (
    path === stateDirectory ||
    within(stateDirectory, path) ||
    within(path, stateDirectory)
  );
};

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
  const blocked = `${sandbox}'s agent sandbox blocks writes to ${stateDirectory}, where Inth keeps sign-in locks and settings. Run this command outside the sandbox.`;
  if (STATE_FAILURES.has(error.message)) {
    return new CliError("sandbox_restricted", `${error.message} ${blocked}`);
  }
  if (blocksState(error.message, stateDirectory)) {
    return new CliError(
      "sandbox_restricted",
      `Cannot create the CLI state directory. ${blocked}`
    );
  }
  if (error.message === NETWORK_FAILURE) {
    return new CliError(
      "sandbox_restricted",
      `Could not reach inth. ${sandbox}'s agent sandbox may be blocking the connection. Run this command outside the sandbox.`
    );
  }
  return error;
};
