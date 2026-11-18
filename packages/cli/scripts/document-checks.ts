import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { z } from "zod";

const EMPTY =
  "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const TEST =
  "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

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

// `inth document hash` reads only the file or stdin and needs no sign-in.
export const verifyDocumentHash = async (binary: string): Promise<void> => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "inth-document-"));
  try {
    const hash = (args: string[], input?: string) =>
      spawnSync(binary, ["document", "hash", ...args], {
        encoding: "utf-8",
        input,
        timeout: 10_000,
      });
    const files = {
      crlf: "Terms of service\r\nVersion 3\r\n",
      empty: "",
      lf: "Terms of service\nVersion 3\n",
      test: "test",
    };
    for (const [name, contents] of Object.entries(files)) {
      // eslint-disable-next-line no-await-in-loop -- A handful of tiny fixtures.
      await writeFile(path.join(parent, name), contents);
    }

    const empty = hash([path.join(parent, "empty")]);
    assert.equal(empty.status, 0, empty.stderr);
    assert.equal(empty.stdout, `${EMPTY}\n`);

    const test = hash([path.join(parent, "test"), "--json"]);
    assert.equal(test.status, 0, test.stdout);
    assert.deepEqual(resultSchema.parse(JSON.parse(test.stdout)).data, {
      bytes: 4,
      hash: TEST,
      path: path.join(parent, "test"),
    });

    const piped = hash(["-", "--json"], "test");
    assert.equal(piped.status, 0, piped.stdout);
    assert.deepEqual(resultSchema.parse(JSON.parse(piped.stdout)).data, {
      bytes: 4,
      hash: TEST,
      path: null,
    });

    const lf = hash([path.join(parent, "lf")]);
    const crlf = hash([path.join(parent, "crlf")]);
    assert.equal(lf.status, 0, lf.stderr);
    assert.equal(crlf.status, 0, crlf.stderr);
    assert.notEqual(lf.stdout, crlf.stdout);

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
