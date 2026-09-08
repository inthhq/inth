import { CliError } from "./cli-error.ts";
import { COMMANDS, HELP, OPTIONS, VERSION } from "./help.ts";
import { HttpError } from "./http-error.ts";

// Callers serialize typed command data or validated API JSON before passing it here.
export const printResult = (
  json: boolean,
  message: string,
  data: string
): void => {
  if (json) {
    console.log(`{"schemaVersion":1,"ok":true,"data":${data}}`);
  } else if (message) {
    console.log(message);
  }
};
export const printHelp = (json: boolean, version: boolean): void => {
  if (version) {
    printResult(
      json,
      VERSION,
      JSON.stringify({ name: "inth", version: VERSION })
    );
    return;
  }
  printResult(
    json,
    HELP,
    JSON.stringify({
      commands: COMMANDS,
      help: HELP,
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
  let httpStatus: number | null = null;
  let requestId: string | null = null;
  if (error instanceof CliError) {
    ({ code, httpStatus, requestId } = error);
  } else if (error instanceof HttpError) {
    httpStatus = error.status;
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
  }
  if (json) {
    console.log(
      JSON.stringify({
        error: { code, httpStatus, message, requestId },
        ok: false,
        schemaVersion: 1,
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
