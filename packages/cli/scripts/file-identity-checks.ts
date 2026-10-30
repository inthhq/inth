import assert from "node:assert/strict";
import {
  lstatSync,
  mkdtempSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { run } from "./native-test-support.ts";

const token = (info: { dev: bigint; ino: bigint }): string =>
  `${BigInt.asUintN(64, info.dev)}:${BigInt.asUintN(64, info.ino)}`;

export const verifyFileIdentity = (
  fixture: string,
  precisionFixture: string
): void => {
  const boundary = 2n ** 53n;
  const maximum = 2n ** 64n - 1n;
  const identities = [boundary, boundary + 1n, maximum];
  const tokens = identities.map((inode) => {
    const result = run(precisionFixture, [
      maximum.toString(),
      inode.toString(),
    ]);
    const actual = result.stdout.trim();
    assert.equal(actual, `${maximum}:${inode}`);
    return actual;
  });
  assert.equal(new Set(tokens).size, identities.length);
  const directory = mkdtempSync(path.join(tmpdir(), "inth-file-identity-"));
  try {
    const source = path.join(directory, "document.txt");
    const unicode = path.join(directory, "document-🍋.txt");
    const replacement = path.join(directory, "replacement.txt");
    writeFileSync(source, "original file");
    writeFileSync(unicode, "unicode file");
    writeFileSync(replacement, "other file");
    const initial = token(statSync(source, { bigint: true }));
    const other = token(statSync(replacement, { bigint: true }));
    assert.notEqual(initial, other);
    let symlink = path.join(directory, "link.txt");
    let dangling = path.join(directory, "dangling.txt");
    try {
      symlinkSync(source, symlink, "file");
      symlinkSync(path.join(directory, "missing.txt"), dangling, "file");
    } catch (error) {
      if (
        !(
          process.platform === "win32" &&
          error instanceof Error &&
          "code" in error &&
          error.code === "EPERM"
        )
      ) {
        throw error;
      }
      symlink = "";
      dangling = "";
    }
    const linkIdentity = symlink
      ? token(lstatSync(symlink, { bigint: true }))
      : "";
    const danglingIdentity = dangling
      ? token(lstatSync(dangling, { bigint: true }))
      : "";
    const result = run(fixture, [
      source,
      replacement,
      unicode,
      symlink,
      dangling,
    ]);
    assert.deepEqual(JSON.parse(result.stdout), {
      afterRename: initial,
      danglingIdentity,
      initial,
      linkIdentity,
      linkTarget: symlink ? initial : "",
      missing: !!dangling,
      opened: initial,
      other,
      replaced: other,
      unicodeIdentity: token(statSync(unicode, { bigint: true })),
    });
    console.log(
      "Native file identity preserves uint64 precision and matches Node BigInt stats for paths, descriptors, replacements and symlinks."
    );
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
};
