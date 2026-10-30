import { describe, expect, it } from "vitest";

import { parseArguments } from "../src/arguments.ts";
import { buildResourceRequest } from "../src/resource-commands.ts";
import { websiteInput } from "./fixtures/agent-access-v2-writes.ts";

const request = (args: string[]) => buildResourceRequest(parseArguments(args));

describe("write input boundaries", () => {
  it.each([
    { label: "one character", name: "a", valid: false },
    { label: "minimum length", name: "ab", valid: true },
    { label: "maximum length", name: "a".repeat(255), valid: true },
    { label: "overlong", name: "a".repeat(256), valid: false },
  ])("validates organization names at $label", ({ name, valid }) => {
    for (const input of [
      ["--name", name],
      ["--data", JSON.stringify({ name })],
    ]) {
      const run = () =>
        request(["org", "settings-update", "org_123", ...input]);
      if (valid) {
        expect(run().body).toBe(JSON.stringify({ name }));
      } else {
        expect(run).toThrow();
      }
    }
  });

  it.each([
    { label: "empty", name: "", valid: false },
    { label: "minimum length", name: "a", valid: true },
    { label: "maximum length", name: "a".repeat(128), valid: true },
    { label: "overlong", name: "a".repeat(129), valid: false },
    { label: "format control", name: "a\u200Bb", valid: false },
    { label: "control character", name: "a\u0007b", valid: false },
  ])("validates runtime key names at $label", ({ name, valid }) => {
    const run = () =>
      request([
        "consent",
        "runtime-key-create",
        "--project",
        "prj_123",
        "--data",
        JSON.stringify({ name }),
      ]);
    if (valid) {
      expect(run().body).toBe(JSON.stringify({ name }));
    } else {
      expect(run).toThrow();
    }
  });

  it.each(["branchFilters", "ignoredPaths"])(
    "validates repository %s entries",
    (field) => {
      for (const value of ["", "a".repeat(1025)]) {
        expect(() =>
          request([
            "integration",
            "github-repository-update",
            "repo_123",
            "--data",
            JSON.stringify({ [field]: [value] }),
          ])
        ).toThrow();
      }
      for (const values of [[], ["a".repeat(1024)]]) {
        expect(
          request([
            "integration",
            "github-repository-update",
            "repo_123",
            "--data",
            JSON.stringify({ [field]: values }),
          ]).body
        ).toBe(JSON.stringify({ [field]: values }));
      }
    }
  );

  it.each([
    { origin: "not a domain", valid: false },
    { origin: "ftp://example.com", valid: false },
    { origin: "/docs", valid: false },
    { origin: "example.com", valid: true },
    { origin: "https://example.com/path", valid: true },
    { origin: "http://localhost:3000", valid: true },
  ])("validates website origin $origin", ({ origin, valid }) => {
    const body = { ...websiteInput, origin };
    const run = () =>
      request(["website", "create", "--data", JSON.stringify(body), "--yes"]);
    if (valid) {
      expect(run().body).toBe(JSON.stringify(body));
    } else {
      expect(run).toThrow();
    }
  });
});
