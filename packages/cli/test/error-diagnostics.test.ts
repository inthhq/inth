import { beforeEach, describe, expect, it } from "vitest";

import {
  diagnosticStep,
  errorDiagnostic,
  startErrorDiagnostics,
} from "../src/error-diagnostics.ts";

describe("error diagnostics", () => {
  beforeEach(startErrorDiagnostics);

  it("preserves actionable, code-defined failure messages", () => {
    const acquire = errorDiagnostic(
      new Error("Cannot acquire the credential lock.")
    );
    const release = errorDiagnostic(
      new Error("Cannot release the credential lock.")
    );
    expect(acquire.code).toBe("credential_lock_acquire");
    expect(acquire.message).toBe("Cannot acquire the credential lock.");
    expect(release.code).not.toBe(acquire.code);
    expect(
      errorDiagnostic(
        new Error("System credential store read failed (-25293).")
      )
    ).toMatchObject({
      code: "credential_store_read_-25293",
      message: "System credential store read failed (-25293).",
    });
  });

  it("does not forward arbitrary messages, appended inputs, or oversized status codes", () => {
    for (const message of [
      "token=private-token /Users/private/project",
      "Cannot acquire the credential lock. private-token",
      "System credential store read failed (-25293). private-token",
      "System credential store private-token failed (1).",
      "System credential store read failed (9999999999).",
    ]) {
      expect(errorDiagnostic(new Error(message))).toMatchObject({
        code: "unexpected_error",
        message:
          "Unexpected error after entering unknown. Original message omitted.",
      });
    }
  });

  it("records a bounded sequence of fixed operations and resets between commands", () => {
    diagnosticStep("argument_parse");
    diagnosticStep("command_setup");
    diagnosticStep("credential_read");
    diagnosticStep("credential_read");
    diagnosticStep("private-token /Users/private/project");
    expect(
      errorDiagnostic(new Error("Test failure")).recent_operations
    ).toEqual(["argument_parse", "command_setup", "credential_read"]);
    for (let index = 0; index < 20; index += 1) {
      diagnosticStep("http_request");
      diagnosticStep("http_response");
    }
    const result = errorDiagnostic(new Error("Test failure"));
    expect(result.recent_operations).toHaveLength(12);
    expect(result.last_operation).toBe("http_response");
    expect(result.elapsed_ms).toBeGreaterThanOrEqual(0);
    startErrorDiagnostics();
    expect(
      errorDiagnostic(new Error("Test failure")).recent_operations
    ).toEqual([]);
  });
});
