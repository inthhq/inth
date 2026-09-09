import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
// eslint-disable-next-line unicorn/import-style -- Scriptc requires named node:path imports.
import { dirname, join } from "node:path";

import { API_ORIGIN } from "../auth-types.ts";
import type { MeResponse } from "../identity.ts";
import {
  formatTelemetryNotice,
  sendTelemetry,
  TELEMETRY_URL,
  telemetryUserId,
  TELEMETRY_TIMEOUT_MS,
} from "../telemetry.ts";
import {
  prepareDirectory,
  productionBuild,
  writeConfig,
} from "./native-bindings.ts";

export const telemetryDisabled = (
  disabled: string | undefined,
  ci: string | undefined
): boolean =>
  Boolean(
    (disabled && disabled !== "0" && disabled !== "false") ||
    (ci && ci !== "0" && ci !== "false")
  );

const validId = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
    value
  );

export class NativeTelemetry {
  private readonly directory: string;
  private readonly disabled: boolean;
  constructor(directory: string, disabled: boolean) {
    this.directory = directory;
    this.disabled = disabled || productionBuild() !== 1;
  }
  enabled(): boolean {
    if (this.disabled) {
      return false;
    }
    const value = this.preference();
    return value === "" || validId(value);
  }
  async send(body: string, destination = TELEMETRY_URL): Promise<boolean> {
    return this.enabled() ? await sendTelemetry(body, destination) : false;
  }
  installationId(): string {
    if (this.disabled) {
      return "";
    }
    const value = this.preference();
    if (value === "") {
      try {
        const id = randomUUID();
        this.save(id);
        return id;
      } catch {
        return "";
      }
    }
    return validId(value) ? value : "";
  }
  private preference(): string {
    try {
      return (
        readFileSync(join(this.directory, "telemetry"), "utf-8").trim() ||
        "disabled"
      );
    } catch (error) {
      // Only missing state enables the default. Unreadable state may contain an opt-out.
      return error instanceof Error && error.message.startsWith("ENOENT:")
        ? ""
        : "disabled";
    }
  }
  notice(columns = 80, color = false): string {
    if (this.disabled || !validId(this.preference())) {
      return "";
    }
    const filename = join(this.directory, "telemetry-notice");
    try {
      readFileSync(filename, "utf-8");
      return "";
    } catch (error) {
      if (!(error instanceof Error && error.message.startsWith("ENOENT:"))) {
        return "";
      }
    }
    if (writeConfig(filename, "shown") !== 0) {
      return "";
    }
    return formatTelemetryNotice(columns, color);
  }
  async userId(
    token: string,
    knownUserId = "",
    endpoint = `${API_ORIGIN}/v1/me`
  ): Promise<string> {
    if (!token || !this.enabled()) {
      return "";
    }
    let userId = knownUserId;
    try {
      const fingerprint = createHash("sha256").update(token).digest("hex");
      const filename = join(this.directory, "telemetry-identity");
      if (!userId) {
        try {
          // SAFETY: Scriptc checks the cached record's field types at runtime.
          const cached = JSON.parse(readFileSync(filename, "utf-8")) as {
            fingerprint: string;
            userId: string;
          };
          if (
            cached.fingerprint === fingerprint &&
            /^[A-Za-z0-9_-]{1,200}$/u.test(cached.userId)
          ) {
            return cached.userId;
          }
        } catch {
          // Missing or invalid cache entries are resolved from the API.
        }
        const response = await fetch(endpoint, {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
          redirect: "error",
          signal: AbortSignal.timeout(TELEMETRY_TIMEOUT_MS),
        });
        if (!response.ok) {
          return "";
        }
        // SAFETY: Scriptc validates the API identity record before the principal is used.
        const identity = JSON.parse(await response.text()) as MeResponse;
        userId = telemetryUserId(identity);
      }
      if (!/^[A-Za-z0-9_-]{1,200}$/u.test(userId)) {
        return "";
      }
      writeConfig(filename, JSON.stringify({ fingerprint, userId }));
      return userId;
    } catch {
      return "";
    }
  }
  clearIdentity(): void {
    // Overwrite cached identity without making credentials or command success depend on cleanup.
    writeConfig(join(this.directory, "telemetry-identity"), "");
  }
  setEnabled(enabled: boolean): void {
    const previous = this.preference();
    let value = "disabled";
    if (enabled) {
      value = validId(previous) ? previous : randomUUID();
    }
    this.save(value);
    if (!enabled) {
      this.clearIdentity();
    }
  }
  private save(value: string): void {
    mkdirSync(dirname(this.directory), { recursive: true });
    if (
      prepareDirectory(this.directory) !== 0 ||
      writeConfig(join(this.directory, "telemetry"), value) !== 0
    ) {
      throw new Error("Cannot save telemetry preference.");
    }
  }
}
