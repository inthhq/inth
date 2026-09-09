/* eslint-disable prefer-named-capture-group -- Scriptc supports indexed regex captures. */
import type { CliArguments } from "./arguments.ts";

// Only code-defined operations are recorded. Never pass arguments, URLs, or data.
const OPERATIONS = new Set([
  "argument_parse",
  "command_setup",
  "credential_read",
  "credential_write",
  "credential_delete",
  "credential_decode",
  "credential_lock",
  "credential_unlock",
  "http_request",
  "http_response",
  "oauth_discovery",
  "oauth_device",
  "oauth_tokens",
  "api_decode",
  "resource_format",
  "output_write",
  "config_read",
  "config_write",
  "mcp_command",
]);

let operations: string[] = [];
let started = Date.now();

export const startErrorDiagnostics = (): void => {
  operations = [];
  started = Date.now();
};

export const diagnosticStep = (operation: string): void => {
  // Keep the runtime allowlist too, including when called outside TypeScript.
  if (!OPERATIONS.has(operation) || operations.at(-1) === operation) {
    return;
  }
  operations.push(operation);
  if (operations.length > 12) {
    operations.shift();
  }
};

const FAILURES = [
  {
    code: "credential_lock_acquire",
    message: "Cannot acquire the credential lock.",
  },
  {
    code: "credential_lock_release",
    message: "Cannot release the credential lock.",
  },
  {
    code: "credential_directory",
    message: "Cannot create a private credential directory.",
  },
  {
    code: "credential_invalid",
    message: "The saved sign-in is invalid. Run inth logout, then inth login.",
  },
  { code: "credential_invalid", message: "Invalid saved credentials." },
  { code: "oauth_discovery_invalid", message: "Invalid OAuth discovery." },
  { code: "oauth_device_invalid", message: "Invalid device authorization." },
  { code: "oauth_tokens_invalid", message: "Invalid token response." },
  { code: "browser_url_invalid", message: "Invalid browser approval URL." },
  {
    code: "organization_selection_invalid",
    message: "Invalid organization selection.",
  },
  {
    code: "organization_config_invalid",
    message:
      "Invalid organization configuration. Run inth switch or inth link to replace it.",
  },
  {
    code: "organization_directory",
    message: "Cannot create a private organization configuration directory.",
  },
  {
    code: "organization_config_write",
    message: "Cannot save organization configuration.",
  },
  {
    code: "telemetry_preference_write",
    message: "Cannot save telemetry preference.",
  },
];

export interface ErrorDiagnostic {
  code: string;
  message: string;
  last_operation: string;
  recent_operations: string[];
  elapsed_ms: number;
}

export const errorDiagnostic = (error: Error): ErrorDiagnostic => {
  const operation = operations.at(-1) ?? "unknown";
  let code = "unexpected_error";
  let message = `Unexpected error after entering ${operation}. Original message omitted.`;
  for (const failure of FAILURES) {
    if (error.message === failure.message) {
      ({ code, message } = failure);
      break;
    }
  }
  // Exact match of our own numeric status message, never a partial redaction.
  const credential =
    /^System credential store (read|write|deletion) failed \((-?[0-9]{1,10})\)\.$/u.exec(
      error.message
    );
  if (
    credential &&
    Number(credential[2]) >= -2_147_483_648 &&
    Number(credential[2]) <= 2_147_483_647
  ) {
    code = `credential_store_${credential[1]}_${Number(credential[2])}`;
    message = `System credential store ${credential[1]} failed (${Number(credential[2])}).`;
  }
  return {
    code,
    elapsed_ms: Math.max(0, Date.now() - started),
    last_operation: operation,
    message,
    recent_operations: [...operations],
  };
};

export const sentryDiagnostic = (
  error: Error,
  options: CliArguments | undefined
): string => {
  const diagnostic = errorDiagnostic(error);
  return JSON.stringify({
    ...diagnostic,
    arch: process.arch,
    interactive:
      !(options?.json || options?.nonInteractive) &&
      Boolean(process.stdin.isTTY && process.stdout.isTTY),
    json: options?.json ?? false,
    os: process.platform,
  });
};
