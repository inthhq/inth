import { closeSync, openSync, renameSync } from "node:fs";

import { nativeFileIdentity } from "../../src/native/native-file-identity.ts";

const [source, replacement, unicode, symlink = "", dangling = ""] =
  process.argv.slice(2);
if (!source || !replacement || !unicode) {
  throw new Error("Expected source, replacement and Unicode file paths.");
}
const initial = nativeFileIdentity(source, -1, true);
const other = nativeFileIdentity(replacement, -1, true);
const unicodeIdentity = nativeFileIdentity(unicode, -1, true);
const descriptor = openSync(source, "r");
let opened = "";
let afterRename = "";
let linkIdentity = "";
let linkTarget = "";
let danglingIdentity = "";
let missing = false;
try {
  opened = nativeFileIdentity("", descriptor, true);
  if (symlink) {
    linkIdentity = nativeFileIdentity(symlink, -1, false);
    linkTarget = nativeFileIdentity(symlink, -1, true);
  }
  if (dangling) {
    danglingIdentity = nativeFileIdentity(dangling, -1, false);
    try {
      nativeFileIdentity(dangling, -1, true);
    } catch (error) {
      missing = error instanceof Error && error.message.startsWith("ENOENT:");
    }
  }
  if (process.platform !== "win32") {
    renameSync(source, `${source}.owned`);
    renameSync(replacement, source);
    afterRename = nativeFileIdentity("", descriptor, true);
  }
} finally {
  closeSync(descriptor);
}
if (process.platform === "win32") {
  // The CRT descriptor can prevent renaming its open file on Windows.
  renameSync(source, `${source}.owned`);
  renameSync(replacement, source);
  afterRename = nativeFileIdentity(`${source}.owned`, -1, true);
}
console.log(
  JSON.stringify({
    afterRename,
    danglingIdentity,
    initial,
    linkIdentity,
    linkTarget,
    missing,
    opened,
    other,
    replaced: nativeFileIdentity(source, -1, true),
    unicodeIdentity,
  })
);
