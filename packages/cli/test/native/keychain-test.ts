import { randomUUID } from "node:crypto";

import {
  browserUrlValid,
  openBrowser,
} from "../../src/native/native-bindings.ts";
import { NativeKeychain } from "../../src/native/native-keychain.ts";

const entry = new NativeKeychain("com.inth.cli.native-test", randomUUID());
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
  const large = JSON.stringify({
    accessToken: "a".repeat(6000),
    refreshToken: "🔑".repeat(1500),
  });
  entry.write(large);
  if (entry.read() !== large) {
    throw new Error("Large session round trip failed.");
  }
  entry.write(`${large} `);
  if (entry.read() !== `${large} `) {
    throw new Error("Large session rotation failed.");
  }
  entry.write("small-again");
  if (entry.read() !== "small-again") {
    throw new Error("Large-to-small rotation failed.");
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
for (const url of [
  "https://example.com/login?login_hint=person@example.com",
  "https://example.com/@person",
  "https://example.com/",
]) {
  if (browserUrlValid(url) !== 1) {
    throw new Error("Valid browser URL rejected.");
  }
}
