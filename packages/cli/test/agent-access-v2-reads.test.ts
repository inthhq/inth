import { describe, expect, it } from "vitest";

import { validateV2ReadOptions } from "../src/agent-access-v2-reads.ts";
import { parseArguments } from "../src/arguments.ts";
import type { CliArguments } from "../src/arguments.ts";
import { CliError } from "../src/cli-error.ts";

const options = (
  values: { name: string; value: string }[] = [],
  command = "billing",
  argument = "ledger"
): CliArguments => ({
  argument,
  command,
  help: false,
  id: "",
  json: true,
  noBrowser: false,
  nonInteractive: true,
  values,
  version: false,
});
const ledger = (since: string, until?: string): CliArguments =>
  options([
    { name: "since", value: since },
    ...(until === undefined ? [] : [{ name: "until", value: until }]),
  ]);

describe("credit ledger date inputs", () => {
  it.each([
    "2024-02-29T23:59:59Z",
    "2000-02-29T00:00:00.123456Z",
    "2026-10-29T09:30:00+05:30",
    "2026-10-29T09:30:00-08:00",
  ])("accepts the timezone-qualified timestamp %s", (value) => {
    expect(() => validateV2ReadOptions(ledger(value))).not.toThrow();
  });

  it.each([
    "",
    "2026-10-29",
    "2026-10-29T09:30:00",
    "2026-10-29T09:30:00z",
    "2023-02-29T00:00:00Z",
    "1900-02-29T00:00:00Z",
    "2026-04-31T00:00:00Z",
    "2026-00-01T00:00:00Z",
    "2026-13-01T00:00:00Z",
    "2026-01-00T00:00:00Z",
    "2026-01-01T24:00:00Z",
    "2026-01-01T00:60:00Z",
    "2026-01-01T00:00:60Z",
    "2026-01-01T00:00:00+24:00",
    "2026-01-01T00:00:00+00:60",
    " 2026-01-01T00:00:00Z",
    "2026-01-01T00:00:00Z\n",
    `2026-01-01T00:00:00.${"1".repeat(8192)}Z`,
  ])("rejects an invalid date %j before HTTP", (value) => {
    expect(() =>
      parseArguments(["billing", "ledger", "--since", value])
    ).toThrowError(CliError);
    expect(() =>
      parseArguments(["billing", "ledger", "--until", value])
    ).toThrowError(CliError);
  });

  it("compares instants across timezones and allows an inclusive single instant", () => {
    expect(() =>
      validateV2ReadOptions(
        ledger("2026-10-29T12:00:00+02:00", "2026-10-29T10:00:00Z")
      )
    ).not.toThrow();
    expect(() =>
      validateV2ReadOptions(
        ledger("2026-10-29T09:00:00-02:00", "2026-10-29T10:00:00Z")
      )
    ).toThrowError(CliError);
  });

  it("leaves an omitted date window for the server to bind to the cursor", () => {
    const input = options([{ name: "cursor", value: "returned-cursor" }]);
    const before = structuredClone(input);
    validateV2ReadOptions(input);
    expect(input).toEqual(before);
  });
});

describe("read selectors and opaque continuations", () => {
  it.each(["", " ", ".", "..", "org\n123", "x".repeat(256)])(
    "rejects an invalid organization override %j",
    (organization) => {
      expect(() =>
        parseArguments(["billing", "ledger", "--organization", organization])
      ).toThrowError(CliError);
    }
  );

  it.each(["", "x".repeat(4097)])("rejects an invalid cursor %j", (value) => {
    expect(() =>
      parseArguments(["billing", "ledger", "--cursor", value])
    ).toThrowError(CliError);
  });

  it("keeps bounded cursors opaque rather than interpreting their encoding", () => {
    const input = parseArguments([
      "billing",
      "ledger",
      "--cursor",
      "opaque+/=".repeat(400),
    ]);
    const before = structuredClone(input);
    validateV2ReadOptions(input);
    expect(input).toEqual(before);
  });

  it("rejects an unknown usage product", () => {
    expect(() =>
      parseArguments(["billing", "ledger", "--product", "consent"])
    ).toThrowError(CliError);
  });

  it("validates project selectors on inventory reads", () => {
    expect(() =>
      parseArguments([
        "website-audit",
        "cookie-inventory",
        "--project",
        "project one",
      ])
    ).toThrowError(CliError);
  });

  it("validates the scan ID even when the quote command permits API credentials", () => {
    expect(() =>
      parseArguments(["code-audit", "quote", "scan\u001B[31m123"])
    ).toThrowError(CliError);
  });
});
