import { describe, expect, it } from "vitest";

import { validateWriteSchema } from "../src/agent-access-write-input.ts";
import { parseArguments } from "../src/arguments.ts";
import { buildResourceRequest } from "../src/resource-commands.ts";
import { billingQuote, writeUuid } from "./fixtures/agent-access-v2-writes.ts";

const quoteInput = (startsAt: string) => ({
  approvedQuote: {
    ...billingQuote,
    nextCycle: { startsAt, total: 1200 },
  },
  input: { checkoutAttemptId: writeUuid, plan: "starter", product: "inth" },
});

describe("resource identifiers", () => {
  it.each([
    "resource_\u0085x",
    "resource_\u009Fx",
    "resource_\u00A0x",
    "resource_\u2003x",
  ])("rejects controls and whitespace in chat and project ID %j", (id) => {
    for (const args of [
      ["chat", "get", id],
      ["chat", "start", "--message", "hello", "--inbox-item", id],
      ["consent", "config-get", "--project", id],
    ]) {
      expect(() => buildResourceRequest(parseArguments(args))).toThrow();
    }
  });

  it("preserves opaque IDs by encoding URL punctuation", () => {
    const request = buildResourceRequest(
      parseArguments(["chat", "get", "chat/a?b#c"])
    );
    expect(request.path).toBe("/v1/agent-chats/chat%2Fa%3Fb%23c");
  });
});

describe("timestamps in ledger filters and approved billing quotes", () => {
  it.each([
    "2024-02-29T23:59:59Z",
    "2024-02-29T23:59:59.1Z",
    "2024-02-29T23:59:59.12+05:30",
    "2000-02-29T00:00:00.123456789Z",
    "2026-10-29T09:30:00+05:30",
    "2026-10-29T09:30:00-08:00",
  ])("accepts valid instant %s", (timestamp) => {
    expect(() =>
      parseArguments(["billing", "ledger", "--since", timestamp])
    ).not.toThrow();
    expect(() =>
      validateWriteSchema("BillingPlanChangeInput", quoteInput(timestamp))
    ).not.toThrow();
  });

  it("compares fractional instants across timezone offsets", () => {
    expect(() =>
      parseArguments([
        "billing",
        "ledger",
        "--since",
        "2026-01-01T00:00:00.12+00:00",
        "--until",
        "2026-01-01T00:00:00.119Z",
      ])
    ).toThrow();
    expect(() =>
      parseArguments([
        "billing",
        "ledger",
        "--since",
        "2026-01-01T00:00:00.1209+00:00",
        "--until",
        "2026-01-01T00:00:00.12Z",
      ])
    ).not.toThrow();
  });

  it.each([
    "2026-01-01T24:00:00Z",
    "2023-02-29T00:00:00Z",
    "1900-02-29T00:00:00Z",
    "2026-04-31T00:00:00Z",
    "2026-01-01T00:00:60Z",
    "2026-01-01T00:00:00+24:00",
    "2026-01-01T00:00:00.1234567890Z",
    "2026-01-01T00:00:00",
  ])("rejects invalid timestamp %s", (timestamp) => {
    expect(() =>
      parseArguments(["billing", "ledger", "--since", timestamp])
    ).toThrow();
    expect(() =>
      validateWriteSchema("BillingPlanChangeInput", quoteInput(timestamp))
    ).toThrow();
  });
});
