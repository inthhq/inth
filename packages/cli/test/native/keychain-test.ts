import { randomUUID } from "node:crypto";

import { openBrowser } from "../../src/native/native-bindings.ts";
import { NativeKeychain } from "../../src/native/native-keychain.ts";

const entry = new NativeKeychain("com.inth.cli.scriptc-test", randomUUID());
try {
  if (entry.read() !== null) {
    throw new Error("Fresh test credential already exists.");
  }
  const first = "test-only-\u0000-🔑";
  entry.write(first);
  if (entry.read() !== first) {
    throw new Error("Keychain round trip failed.");
  }
  entry.write("rotated-test-only");
  if (entry.read() !== "rotated-test-only") {
    throw new Error("Keychain update failed.");
  }
  entry.clear();
  if (entry.read() !== null) {
    throw new Error("Keychain deletion failed.");
  }
  entry.clear();
  console.log("Static Scriptc Keychain create/read/rotate/delete passed.");
} finally {
  entry.clear();
}

for (const url of [
  "-a",
  "file:///tmp/example",
  "https://",
  "https://user:password@example.com/",
  "https://example.com/#fragment",
  "https://example.com/\n",
  "https://example.com/\u001B[31m",
]) {
  if (openBrowser(url) !== -1) {
    throw new Error("Unsafe URL passed the browser FFI boundary.");
  }
}
