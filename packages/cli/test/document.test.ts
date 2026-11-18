import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
// eslint-disable-next-line unicorn/import-style -- Matches the native sources.
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { EMPTY, FIXTURE, FIXTURE_HASH } from "../scripts/document-checks.ts";
import { parseArguments } from "../src/arguments.ts";
import { hashDocument } from "../src/document.ts";

const directories: string[] = [];
const file = (name: string, contents: string | Uint8Array): string => {
  const directory = mkdtempSync(join(tmpdir(), "inth-document-"));
  directories.push(directory);
  const path = join(directory, name);
  writeFileSync(path, contents);
  return path;
};
const hash = async (path: string): Promise<string> => {
  const result = await hashDocument(path, new AbortController().signal);
  return result.hash;
};

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("hashDocument", () => {
  it("hashes an empty file", async () => {
    expect(await hash(file("empty.md", ""))).toBe(EMPTY);
  });

  it("hashes every byte as given, across reads", async () => {
    const path = file("policy.bin", FIXTURE);
    expect(await hashDocument(path, new AbortController().signal)).toEqual({
      bytes: FIXTURE.byteLength,
      hash: FIXTURE_HASH,
      path,
    });
  });

  it("fails with a usage error naming a missing file", async () => {
    const path = join(tmpdir(), "inth-document-missing", "policy.md");
    await expect(
      hashDocument(path, new AbortController().signal)
    ).rejects.toMatchObject({
      code: "usage_error",
      message: `File not found: ${path}`,
    });
  });
});

describe("inth document hash arguments", () => {
  it("accepts a path or - for stdin, with shared flags on either side", () => {
    expect(parseArguments(["document", "hash", "policy.md"]).document).toEqual({
      path: "policy.md",
    });
    const piped = parseArguments(["--json", "document", "hash", "-"]);
    expect(piped.document).toEqual({ path: "-" });
    expect(piped.json).toBe(true);
    expect(piped.argument).toBe("hash");
  });

  it("shows help without a path", () => {
    const parsed = parseArguments(["document", "hash", "--help"]);
    expect(parsed.help).toBe(true);
    expect(parsed.command).toBe("document");
  });

  it.each([
    [["document"]],
    [["document", "hash"]],
    [["document", "hash", "a.md", "b.md"]],
    [["document", "publish", "a.md"]],
    [["document", "hash", "a.md", "--organization", "org_123"]],
    [["--organization", "org_123", "document", "hash", "a.md"]],
    [["--auth", "agent", "document", "hash", "a.md"]],
    [["--token", "inth_test", "document", "hash", "a.md"]],
    [["--no-browser", "document", "hash", "a.md"]],
  ])("rejects %j", (args) => {
    expect(() => parseArguments(args)).toThrow(
      expect.objectContaining({ code: "usage_error" })
    );
  });
});
