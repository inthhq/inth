/* eslint-disable prefer-named-capture-group -- Scriptc supports indexed captures; URL credential members are unsupported. */
import { CliError } from "./cli-error.ts";
import { HttpError } from "./http-error.ts";

// Public ingestion DSN for the CLI project, not a Sentry API credential.
export const SENTRY_DSN =
  "https://c864364d96d30f891218fef7d50c90af@o4508976703209472.ingest.de.sentry.io/4512055296065616";
export const SENTRY_TIMEOUT_MS = 1000;

// Error messages can contain tokens, paths, response bodies, or user input.
// Report a fixed category instead of forwarding the original message.
export const unexpectedErrorType = (
  error: Error,
  cancelled: boolean
): string => {
  if (cancelled || error instanceof CliError || error instanceof HttpError) {
    return "";
  }
  if (
    ["AbortError", "TimeoutError"].includes(error.name) ||
    error.message ===
      "Could not reach inth. Check your connection and try again." ||
    /^(?:ENOENT|EACCES|EPERM|ENOSPC|EROFS|EMFILE|ENFILE|EPIPE|ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT):/u.test(
      error.message
    )
  ) {
    return "";
  }
  return ["TypeError", "RangeError", "ReferenceError", "SyntaxError"].includes(
    error.name
  )
    ? error.name
    : "Error";
};

export const sentryEndpoint = (dsn: string): string => {
  try {
    const match =
      /^(https?):\/\/([a-zA-Z0-9]+)@([^/?#@]+)((?:\/[a-zA-Z0-9_-]+)*)\/([0-9]+)$/u.exec(
        dsn
      );
    if (!match) {
      return "";
    }
    const url = new URL(`${match[1]}://${match[3]}`);
    if (
      url.protocol !== "https:" &&
      !(url.protocol === "http:" && url.hostname === "127.0.0.1")
    ) {
      return "";
    }
    return `${url.protocol}//${url.host}${match[4]}/api/${match[5]}/envelope/?sentry_key=${match[2]}&sentry_version=7`;
  } catch {
    return "";
  }
};

export const sendSentryEnvelope = async (
  endpoint: string,
  body: string
): Promise<boolean> => {
  if (!endpoint || !body) {
    return false;
  }
  try {
    const response = await fetch(endpoint, {
      body,
      headers: { "Content-Type": "application/x-sentry-envelope" },
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(SENTRY_TIMEOUT_MS),
    });
    await response.text();
    return response.ok;
  } catch {
    return false;
  }
};
