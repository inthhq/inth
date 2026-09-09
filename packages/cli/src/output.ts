import { CliError } from "./cli-error.ts";
import { diagnosticStep } from "./error-diagnostics.ts";
import { COMMANDS, OPTIONS, formatHelp, helpCommands } from "./help.ts";
import { HttpError } from "./http-error.ts";
import { VERSION } from "./version.ts";

// Callers serialize typed command data or validated API JSON before passing it here.
export const printResult = (
  json: boolean,
  message: string,
  data: string
): void => {
  diagnosticStep("output_write");
  if (json) {
    console.log(`{"schemaVersion":2,"ok":true,"data":${data}}`);
  } else if (message) {
    console.log(message);
  }
};
export const printHelp = (
  json: boolean,
  version: boolean,
  command = "",
  action = "",
  columns = 80
): void => {
  if (version) {
    printResult(
      json,
      VERSION,
      JSON.stringify({ name: "inth", version: VERSION })
    );
    return;
  }
  const help = formatHelp(command, action, columns);
  printResult(
    json,
    help,
    JSON.stringify({
      commandDefinitions: helpCommands(command, action),
      commands: COMMANDS,
      help,
      name: "inth",
      options: OPTIONS,
      version: VERSION,
    })
  );
};
export const reportError = (
  json: boolean,
  error: Error,
  cancelled: boolean
): number => {
  let code = "command_failed";
  let { message } = error;
  let apiCode: string | null = null;
  let httpStatus: number | null = null;
  let requestId: string | null = null;
  if (error instanceof CliError) {
    ({ code, httpStatus, requestId } = error);
  } else if (error instanceof HttpError) {
    httpStatus = error.status;
    ({ apiCode } = error);
    ({ requestId } = error);
    code = "http_error";
    if (httpStatus === 400 && error.code === "invalid_scope") {
      code = "invalid_scope";
    } else if (httpStatus === 401) {
      code = "authentication_required";
    } else if (httpStatus === 403) {
      code =
        error.code === "INSUFFICIENT_SCOPE"
          ? "insufficient_scope"
          : "access_denied";
    } else if (httpStatus === 429) {
      code = "rate_limited";
    }
  }
  if (cancelled) {
    code = "cancelled";
    message = "Cancelled.";
    apiCode = null;
  }
  if (json) {
    console.log(
      JSON.stringify({
        error: { apiCode, code, httpStatus, message, requestId },
        ok: false,
        schemaVersion: 2,
      })
    );
  } else {
    console.error(`Error: ${message}`);
  }
  return cancelled || code === "cancelled" ? 130 : 1;
};
export const requireInteractiveLogin = (interactive: boolean): void => {
  if (!interactive) {
    throw new CliError(
      "interaction_required",
      "Browser login requires an interactive terminal. Run inth login in a terminal first, or supply an organization API key through INTH_TOKEN."
    );
  }
};
