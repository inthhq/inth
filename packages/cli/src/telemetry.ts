import type { CliArguments } from "./arguments.ts";
import { CliError } from "./cli-error.ts";
import { COMMAND_METADATA } from "./command-metadata.ts";
import { style, wrapText } from "./display.ts";
import { VERSION } from "./help.ts";
import { HttpError } from "./http-error.ts";
import type { MeResponse } from "./identity.ts";

// Public ingestion token, not a personal or project secret API key.
export const TELEMETRY_TOKEN =
  "phc_mJDMqXTzmVVuYuPfmgMVQaeuvWvkLYfvPTixg6eijN6r";
export const TELEMETRY_URL = "https://eu.i.posthog.com/i/v0/e/";
export const TELEMETRY_TIMEOUT_MS = 1500;

export const telemetryUserId = (identity: MeResponse): string => {
  const { principal } = identity.data;
  if (!identity.success || !["oauth", "session"].includes(principal.type)) {
    return "";
  }
  const id = principal.userId ?? "";
  return /^[A-Za-z0-9_-]{1,200}$/u.test(id) ? id : "";
};

export const formatTelemetryNotice = (columns = 80, color = false): string => {
  const width = Math.max(20, columns - 1);
  const introduction = wrapText(
    "We collect usage telemetry to improve our services.",
    width
  );
  const command = "inth telemetry disable";
  const environment = "INTH_TELEMETRY_DISABLED=1";
  const optOut = `To opt out, run \`${command}\` or set ${environment}.`;
  const separator = optOut.length <= width ? " or set " : "\nor set ";
  return `${introduction}\nTo opt out, run \`${style(command, "1", color)}\`${separator}${style(environment, "1", color)}.\n`;
};

export const telemetryCommand = (options: CliArguments): string => {
  if (
    options.help ||
    options.version ||
    !options.command ||
    options.command === "telemetry"
  ) {
    return "";
  }
  if (options.command === "mcp" && !options.argument) {
    return "mcp setup";
  }
  const entry = COMMAND_METADATA.find(
    (item) =>
      item.command === options.command &&
      (!item.action || item.action === options.argument)
  );
  return entry ? `${entry.command} ${entry.action}`.trim() : "";
};

export const telemetryError = (error: Error): string => {
  if (error instanceof HttpError) {
    if (error.status === 401) {
      return "authentication_required";
    }
    if (error.status === 403) {
      return "access_denied";
    }
    return error.status === 429 ? "rate_limited" : "http_error";
  }
  if (
    error instanceof CliError &&
    [
      "usage_error",
      "authentication_required",
      "interaction_required",
      "invalid_response",
      "invalid_config",
      "cancelled",
      "access_denied",
      "invalid_scope",
      "insufficient_scope",
    ].includes(error.code)
  ) {
    return error.code;
  }
  return "command_failed";
};

export const telemetryPayload = (
  options: CliArguments,
  installationId: string,
  duration: number,
  errorCode: string,
  interactive: boolean,
  userId = ""
): string => {
  const command = telemetryCommand(options);
  if (!command) {
    return "";
  }
  const agent =
    options.values.find((entry) => entry.name === "agent")?.value ?? "";
  let outcome = errorCode ? "error" : "success";
  if (errorCode === "cancelled") {
    outcome = "cancelled";
  }
  return JSON.stringify({
    api_key: TELEMETRY_TOKEN,
    distinct_id: userId || `cli:${installationId}`,
    event: "cli_command_completed",
    properties: {
      $geoip_disable: true,
      $lib: "inth-cli",
      $lib_version: VERSION,
      $process_person_profile: Boolean(userId),
      arch: process.arch,
      cli_version: VERSION,
      command,
      duration_ms: Math.max(0, Math.round(duration)),
      error_code: errorCode || null,
      interactive,
      json: options.json,
      mcp_client:
        options.command === "mcp" &&
        ["codex", "claude-code", "cursor", "vscode", "opencode"].includes(agent)
          ? agent
          : null,
      os: process.platform,
      outcome,
      schema_version: 1,
      source: "cli",
    },
  });
};

// The optional destination is for native loopback tests; it is never configurable by users.
export const sendTelemetry = async (
  body: string,
  destination = TELEMETRY_URL
): Promise<boolean> => {
  if (!body) {
    return false;
  }
  try {
    const response = await fetch(destination, {
      body,
      headers: { "Content-Type": "application/json" },
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(TELEMETRY_TIMEOUT_MS),
    });
    await response.text();
    return response.ok;
  } catch {
    return false;
  }
};
