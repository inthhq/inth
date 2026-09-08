import { describe, expect, it, vi } from "vitest";

import { parseArguments } from "../src/arguments.ts";
import { COMMAND_METADATA } from "../src/command-metadata.ts";
import { wrapText } from "../src/display.ts";
import { formatHelp } from "../src/help.ts";
import { HttpError } from "../src/http-error.ts";
import { reportError } from "../src/output.ts";
import { resourceSummary } from "../src/resource-output.ts";

describe("human help and machine discovery", () => {
  it("shows only the selected command's flags and required inputs", () => {
    const text = formatHelp("project", "create");
    expect(text).toContain("--region");
    expect(text).toContain("Required");
    expect(text).not.toContain("--email");
    expect(text).not.toContain("--cursor");
    expect(text).not.toContain("invitation cancel");
    expect(() => parseArguments(["not-a-command", "--help"])).toThrow(
      "Unknown command"
    );
  });
  it("exposes typed flags, enums, capabilities, and side effects", () => {
    const inbox = COMMAND_METADATA.find(
      (entry) => entry.command === "inbox" && entry.action === "update"
    );
    expect(inbox?.options).toContainEqual(
      expect.objectContaining({
        name: "status",
        required: true,
        type: "string",
        values: ["open", "accepted", "dismissed", "resolved"],
      })
    );
    expect(inbox?.scopes).toEqual(["inbox.write"]);
    expect(inbox?.authentication).toBe("browser");
    expect(inbox?.effects.length).toBeGreaterThan(0);
    expect(inbox?.options).not.toContainEqual(
      expect.objectContaining({ name: "organization" })
    );
  });
  it("identifies a misspelled flag without exposing its value", () => {
    expect(() =>
      parseArguments(["project", "list", "--limti=private-secret"])
    ).toThrow('Unknown option "--limti"');
    try {
      parseArguments(["project", "list", "--limti=private-secret"]);
    } catch (error) {
      expect(String(error)).not.toContain("private-secret");
    }
  });
});

it("wraps prose at words and preserves suggested shell commands on one line", () => {
  expect(wrapText("Read the scan details for more information.", 24)).toBe(
    "Read the scan details\nfor more information."
  );
  const text = resourceSummary(
    parseArguments(["code-audit", "start", "--repository", "repo_123"]),
    {
      data: [
        {
          preparationId: "prep_123",
          repositoryId: "repo_123",
          status: "starting",
        },
      ],
      success: true,
    },
    { color: false, columns: 40 }
  );
  expect(text.split("\n")).toContain(
    "  inth code-audit request prep_123 --repository repo_123"
  );
});

it("keeps server error codes separate from CLI error categories", () => {
  const output = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    for (const apiCode of [
      "INSUFFICIENT_CREDITS",
      "PLAN_LIMIT_REACHED",
      "INVALID_PAYLOAD",
    ]) {
      expect(
        reportError(true, new HttpError(422, apiCode, "request-1"), false)
      ).toBe(1);
      expect(JSON.parse(output.mock.lastCall?.[0] ?? "").error).toMatchObject({
        apiCode,
        code: "http_error",
      });
    }
  } finally {
    output.mockRestore();
  }
});
