import { afterEach, describe, expect, it, vi } from "vitest";

import { CliError } from "../src/cli-error.ts";
import { HttpError } from "../src/http-error.ts";
import { printResult, reportError } from "../src/output.ts";

afterEach(() => vi.restoreAllMocks());
describe("machine output", () => {
  it("preserves API objects and pagination without mixing in human output", () => {
    const stdout = vi.spyOn(console, "log").mockImplementation(() => {});
    const stderr = vi.spyOn(console, "error").mockImplementation(() => {});
    printResult(
      true,
      "Human message",
      '{"data":[{"id":"one"}],"pagination":{"nextCursor":"next"}}'
    );
    expect(stdout).toHaveBeenCalledExactlyOnceWith(
      '{"schemaVersion":1,"ok":true,"data":{"data":[{"id":"one"}],"pagination":{"nextCursor":"next"}}}'
    );
    expect(stderr).not.toHaveBeenCalled();
  });
  it("represents a successful empty response as null", () => {
    const stdout = vi.spyOn(console, "log").mockImplementation(() => {});
    printResult(true, "", "null");
    expect(stdout).toHaveBeenCalledExactlyOnceWith(
      '{"schemaVersion":1,"ok":true,"data":null}'
    );
  });
  it("returns structured HTTP status and a sanitized request ID", () => {
    const stdout = vi.spyOn(console, "log").mockImplementation(() => {});
    const stderr = vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = reportError(
      true,
      new HttpError(429, "unknown-sensitive-body", "req-123\n"),
      false
    );
    expect(exit).toBe(1);
    expect(stdout).toHaveBeenCalledTimes(1);
    expect(JSON.parse(stdout.mock.lastCall?.[0] ?? "")).toEqual({
      error: {
        code: "rate_limited",
        httpStatus: 429,
        message: "Request failed: HTTP 429. Request ID: req-123",
        requestId: "req-123",
      },
      ok: false,
      schemaVersion: 1,
    });
    expect(stderr).not.toHaveBeenCalled();
  });
  it("distinguishes missing capabilities from other forbidden requests", () => {
    const stdout = vi.spyOn(console, "log").mockImplementation(() => {});
    reportError(
      true,
      new HttpError(403, "INSUFFICIENT_SCOPE", "scope-id"),
      false
    );
    expect(JSON.parse(stdout.mock.lastCall?.[0] ?? "").error).toMatchObject({
      code: "insufficient_scope",
      httpStatus: 403,
      message: expect.stringContaining("inth login again"),
      requestId: "scope-id",
    });
    reportError(true, new HttpError(403, "FORBIDDEN", null), false);
    expect(JSON.parse(stdout.mock.lastCall?.[0] ?? "").error.code).toBe(
      "access_denied"
    );
  });
  it("reports rejected OAuth scopes as a registration error", () => {
    const stdout = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(
      reportError(
        true,
        new HttpError(400, "invalid_scope", "scope-request"),
        false
      )
    ).toBe(1);
    expect(JSON.parse(stdout.mock.lastCall?.[0] ?? "").error).toMatchObject({
      code: "invalid_scope",
      httpStatus: 400,
      message: expect.stringContaining("inth-cli client registration"),
      requestId: "scope-request",
    });
  });
  it("uses cancellation exit status for Escape without an abort signal", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      reportError(
        false,
        new CliError("cancelled", "Organization selection cancelled."),
        false
      )
    ).toBe(130);
  });
  it("retains refresh revocation details and identifies cancellation", () => {
    const stdout = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(
      reportError(
        true,
        new CliError(
          "authentication_required",
          "Sign in again",
          400,
          "refresh-id"
        ),
        false
      )
    ).toBe(1);
    expect(JSON.parse(stdout.mock.lastCall?.[0] ?? "")).toEqual({
      error: {
        code: "authentication_required",
        httpStatus: 400,
        message: "Sign in again",
        requestId: "refresh-id",
      },
      ok: false,
      schemaVersion: 1,
    });
    expect(
      reportError(true, new Error("Private cancellation reason"), true)
    ).toBe(130);
    expect(JSON.parse(stdout.mock.lastCall?.[0] ?? "")).toEqual({
      error: {
        code: "cancelled",
        httpStatus: null,
        message: "Cancelled.",
        requestId: null,
      },
      ok: false,
      schemaVersion: 1,
    });
  });
});
