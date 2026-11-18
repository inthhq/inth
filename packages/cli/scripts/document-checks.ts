import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { z } from "zod";

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

const resultSchema = z.object({
  data: z.object({
    bytes: z.number(),
    hash: z.string(),
    path: z.string().nullable(),
  }),
  ok: z.literal(true),
});

const errorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
  ok: z.literal(false),
});

export const verifyDocumentHash = async (binary: string): Promise<void> => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "inth-document-"));
  try {
    const hash = (args: string[], input?: Uint8Array) =>
      spawnSync(binary, ["document", "hash", ...args], {
        encoding: "utf-8",
        input,
        timeout: 10_000,
      });
    await Promise.all([
      writeFile(path.join(parent, "empty"), ""),
      writeFile(path.join(parent, "fixture"), FIXTURE),
    ]);

    const empty = hash([path.join(parent, "empty")]);
    assert.equal(empty.status, 0, empty.stderr);
    assert.equal(empty.stdout, `${EMPTY}\n`);

    const file = hash([path.join(parent, "fixture"), "--json"]);
    assert.equal(file.status, 0, file.stdout);
    assert.deepEqual(resultSchema.parse(JSON.parse(file.stdout)).data, {
      bytes: 70_027,
      hash: FIXTURE_HASH,
      path: path.join(parent, "fixture"),
    });

    const piped = hash(["-", "--json"], FIXTURE);
    assert.equal(piped.status, 0, piped.stdout);
    assert.deepEqual(resultSchema.parse(JSON.parse(piped.stdout)).data, {
      bytes: 70_027,
      hash: FIXTURE_HASH,
      path: null,
    });

    const missing = hash([path.join(parent, "missing"), "--json"]);
    assert.equal(missing.status, 1);
    const failure = errorSchema.parse(JSON.parse(missing.stdout)).error;
    assert.equal(failure.code, "usage_error");
    assert.equal(
      failure.message,
      `File not found: ${path.join(parent, "missing")}`
    );

    const directory = hash([parent]);
    assert.equal(directory.status, 1);
    assert.match(directory.stderr, /is not a regular file/u);
  } finally {
    await rm(parent, { force: true, recursive: true });
  }
};
