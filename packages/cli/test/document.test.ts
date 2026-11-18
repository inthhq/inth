import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
// eslint-disable-next-line unicorn/import-style -- Matches the native sources.
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { parseArguments } from "../src/arguments.ts";
import { hashDocument } from "../src/document.ts";

const EMPTY =
  "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
// CRLF text, then bytes that are not UTF-8 and span more than one 64 KiB read.
const text = new TextEncoder().encode("Privacy policy\r\nVersion 2\r\n");
const FIXTURE = new Uint8Array(text.length + 70_000);
FIXTURE.set(text);
for (let index = 0; index < 70_000; index += 1) {
  FIXTURE[text.length + index] = index % 251;
}
const FIXTURE_HASH =
  "sha256:263db960f76e2c1e34a9774ef85730cd7eba491e9b8141de87d4f5f2b5d32f86";

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
      bytes: 70_027,
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
  ])("rejects %j", (args) => {
    expect(() => parseArguments(args)).toThrow(
      expect.objectContaining({ code: "usage_error" })
    );
  });
});
