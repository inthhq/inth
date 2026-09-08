import { afterEach, describe, expect, it, vi } from "vitest";

import { run } from "../experiments/node/commands.ts";
import { formatResource } from "../experiments/node/resource-output.ts";
import { OrganizationContext } from "../experiments/node/state.ts";
import { parseArguments } from "../src/arguments.ts";
import { textWidth } from "../src/display.ts";
import {
  billingBody,
  outputCases,
  projectsBody,
} from "./fixtures/resource-output.ts";

const plain = { color: false, columns: 120 };
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("human resource output", () => {
  it.each(outputCases)("formats $args without JSON syntax", (example) => {
    const text = formatResource(
      parseArguments(example.args),
      example.body,
      plain
    );
    for (const expected of example.expected) {
      expect(text).toContain(expected);
    }
    expect(text).not.toContain('"success"');
    expect(text).not.toContain("[object Object]");
    expect(text).not.toContain("\u001B");
  });
  it.each(outputCases)(
    "preserves $args payload exactly in JSON mode",
    (example) => {
      expect(
        formatResource(
          parseArguments([...example.args, "--json"]),
          example.body,
          { color: true, columns: 20 }
        )
      ).toBe(example.body);
    }
  );
  it("shows unlimited credits instead of a misleading zero balance", () => {
    const text = formatResource(
      parseArguments(["billing"]),
      billingBody,
      plain
    );
    expect(text).toMatch(/Credits\s+Unlimited/u);
    expect(text).not.toMatch(/Credits\s+0/u);
    expect(text).toMatch(/Auto top-up\s+Not configured/u);
  });
  it("uses aligned tables when they fit and labelled rows at narrow widths", () => {
    const options = parseArguments(["project", "list"]);
    expect(formatResource(options, projectsBody, plain)).toMatch(
      /Name\s+Slug\s+ID/u
    );
    const narrow = formatResource(options, projectsBody, {
      color: false,
      columns: 24,
    });
    expect(narrow).toContain("Website");
    for (const line of narrow.split("\n")) {
      expect(textWidth(line)).toBeLessThan(24);
    }
    expect(narrow).not.toMatch(/Name\s+Slug\s+ID/u);
  });
  it("strips server terminal controls and wraps Unicode labels", () => {
    const body = JSON.stringify({
      data: [
        {
          id: "prj_123",
          name: "\u001B[31m東京開発チーム".repeat(3),
          slug: "website",
        },
      ],
      success: true,
    });
    const text = formatResource(parseArguments(["project", "list"]), body, {
      color: false,
      columns: 32,
    });
    expect(text).not.toContain("\u001B");
    for (const line of text.split("\n")) {
      expect(textWidth(line)).toBeLessThan(32);
    }
  });
  it("keeps one-time secrets and opaque cursors intact on a single line", () => {
    const key = `inth_${"a".repeat(100)}`;
    const text = formatResource(
      parseArguments(["api-key", "roll", "key_123"]),
      JSON.stringify({ data: { id: "key_123", key }, success: true }),
      { color: false, columns: 24 }
    );
    expect(text.split("\n")).toContain(key);
    expect(
      formatResource(
        parseArguments(["project", "list"]),
        projectsBody,
        plain
      ).split("\n")
    ).toContain("cursor+/=");
  });
  it("keeps raw API output as JSON without --json", () => {
    expect(
      formatResource(parseArguments(["api", "/v1/billing"]), billingBody, plain)
    ).toBe(billingBody);
  });
  it("formats empty mutation responses and rejects malformed data", () => {
    expect(
      formatResource(
        parseArguments(["project", "delete", "prj_123"]),
        "",
        plain
      )
    ).toContain("Project deleted");
    expect(() =>
      formatResource(
        parseArguments(["billing"]),
        '{"success":true,"data":{"credits":{"remaining":"bad","unlimited":true}}}',
        plain
      )
    ).toThrow("Cannot format");
  });
  it("runs billing with formatted output by default and the full envelope with --json", async () => {
    vi.stubEnv("INTH_TOKEN", "inth_fixture");
    vi.spyOn(OrganizationContext.prototype, "resolve").mockResolvedValue(
      "org_123"
    );
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(() => Promise.resolve(new Response(billingBody)))
    );
    const stdout = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(["billing"], new AbortController().signal);
    expect(stdout.mock.lastCall?.[0]).toMatch(/Credits\s+Unlimited/u);
    await run(["billing", "--json"], new AbortController().signal);
    expect(JSON.parse(stdout.mock.lastCall?.[0] ?? "")).toEqual({
      data: JSON.parse(billingBody),
      ok: true,
      schemaVersion: 1,
    });
  });
});
