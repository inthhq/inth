import { describe, expect, it } from "vitest";

import { CliError } from "../src/cli-error.ts";
import { HttpError } from "../src/http-error.ts";
import { sentryEndpoint, unexpectedErrorType } from "../src/sentry.ts";

describe("unexpected error reporting", () => {
  it("excludes handled command, HTTP, cancellation, and connectivity failures", () => {
    for (const error of [
      new CliError("usage_error", "Invalid argument"),
      new CliError("authentication_required", "Sign in"),
      new HttpError(500, "server_error", "Request failed"),
      new Error("Could not reach inth. Check your connection and try again."),
      new Error("EACCES: /private/file"),
    ]) {
      expect(unexpectedErrorType(error, false)).toBe("");
    }
    expect(unexpectedErrorType(new TypeError("secret"), true)).toBe("");
  });

  it("reports fixed exception types without forwarding messages or custom names", () => {
    expect(
      unexpectedErrorType(new TypeError("token=secret /Users/someone"), false)
    ).toBe("TypeError");
    const error = new Error("private response body");
    error.name = "private-project-name";
    expect(unexpectedErrorType(error, false)).toBe("Error");
  });

  it("builds an authenticated envelope URL and preserves a self-hosted prefix", () => {
    expect(sentryEndpoint("https://abc123@o1.ingest.de.sentry.io/42")).toBe(
      "https://o1.ingest.de.sentry.io/api/42/envelope/?sentry_key=abc123&sentry_version=7"
    );
    expect(sentryEndpoint("https://abc123@sentry.example/prefix/42")).toBe(
      "https://sentry.example/prefix/api/42/envelope/?sentry_key=abc123&sentry_version=7"
    );
  });

  it("rejects missing, malformed, insecure, and secret-bearing DSNs", () => {
    for (const dsn of [
      "",
      "invalid",
      "http://abc@remote.example/1",
      "https://abc:secret@host/1",
      "https://abc@host/no-project",
      "https://abc@host/1?secret=value",
      "https://abc@host/1#fragment",
    ]) {
      expect(sentryEndpoint(dsn)).toBe("");
    }
    expect(sentryEndpoint("http://public@127.0.0.1:1234/1")).toContain(
      "127.0.0.1:1234/api/1/envelope/"
    );
  });
});
