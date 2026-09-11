import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
// eslint-disable-next-line unicorn/import-style -- Scriptc requires named node:path imports.
import { join } from "node:path";

import type { CliArguments } from "../arguments.ts";
import { sentryDiagnostic } from "../error-diagnostics.ts";
import {
  SENTRY_DSN,
  sentryEndpoint,
  sendSentryEnvelope,
  unexpectedErrorType,
} from "../sentry.ts";
import { telemetryCommand } from "../telemetry.ts";
import { VERSION } from "../version.ts";
import { prepareDirectory, sentryCapture } from "./native-bindings.ts";
import { NativeTelemetry, telemetryDisabled } from "./native-telemetry.ts";

export const reportUnexpectedError = async (
  error: Error,
  cancelled: boolean,
  options: CliArguments | undefined,
  directory: string,
  knownUserId = "",
  dsn = SENTRY_DSN
): Promise<boolean> => {
  let database = "";
  try {
    const type = unexpectedErrorType(error, cancelled);
    const endpoint = sentryEndpoint(dsn);
    if (
      !type ||
      !endpoint ||
      telemetryDisabled(process.env.INTH_TELEMETRY_DISABLED, process.env.CI)
    ) {
      return false;
    }
    const telemetry = new NativeTelemetry(directory, false);
    if (!telemetry.enabled()) {
      return false;
    }
    const installationId = telemetry.installationId();
    if (!installationId) {
      return false;
    }
    database = join(directory, `sentry-${randomUUID()}`);
    if (prepareDirectory(database) !== 0) {
      return false;
    }
    let envelope = "";
    const command = options
      ? telemetryCommand(options) || "unknown"
      : "unknown";
    const userId = /^[A-Za-z0-9_-]{1,200}$/u.test(knownUserId)
      ? knownUserId
      : `cli:${installationId}`;
    const status = sentryCapture(
      dsn,
      `inth-cli@${VERSION}`,
      command,
      type,
      sentryDiagnostic(error, options),
      userId,
      database,
      (value) => {
        envelope = value;
      }
    );
    if (status !== 0) {
      return false;
    }
    // Recheck immediately before sending in case the saved preference changed.
    if (!telemetry.enabled()) {
      return false;
    }
    return await sendSentryEnvelope(endpoint, envelope);
  } catch {
    return false;
  } finally {
    if (database) {
      try {
        rmSync(database, { force: true, recursive: true });
      } catch {
        // Reporting and cleanup must never replace the command's original error.
      }
    }
  }
};
