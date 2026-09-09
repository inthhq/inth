import { parseArguments } from "../../src/arguments.ts";
import { CliError } from "../../src/cli-error.ts";
import {
  diagnosticStep,
  startErrorDiagnostics,
} from "../../src/error-diagnostics.ts";
import { HttpError } from "../../src/http-error.ts";
import { NativeKeychain } from "../../src/native/native-keychain.ts";
import { reportUnexpectedError } from "../../src/native/native-sentry.ts";
import { NativeStore } from "../../src/native/native-store.ts";

const [directory, dsn, mode] = process.argv.slice(2);
if (!directory || !dsn || !mode) {
  throw new Error("Missing test arguments.");
}
startErrorDiagnostics();
diagnosticStep("argument_parse");
diagnosticStep("resource_format");
let failure: Error = new TypeError(
  "private-input /private/secret-file token=private-token"
);
if (mode === "usage") {
  failure = new CliError("usage_error", "private-input");
}
if (mode === "http") {
  failure = new HttpError(500, "server_error", "private-input");
}
if (mode === "network") {
  failure = new Error(
    "Could not reach inth. Check your connection and try again."
  );
}
if (mode === "credential-lock") {
  const store = new NativeStore(
    new NativeKeychain("unused", "unused"),
    `${directory}/missing/credentials.lock`
  );
  let failed = false;
  try {
    await store.exclusive(() =>
      Promise.reject(new Error("Must not acquire the missing lock."))
    );
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }
    failure = error;
    failed = true;
  }
  if (!failed) {
    throw new Error("Expected credential lock failure.");
  }
}
if (mode === "other-operation") {
  diagnosticStep("api_decode");
}
const result = await reportUnexpectedError(
  failure,
  mode === "cancelled",
  parseArguments(["api", "/private-input"]),
  directory,
  mode === "anonymous" ? "" : "usr_test_verified",
  mode === "no-dsn" ? "" : dsn
);
console.log(result ? "sent" : "skipped");
// The command's original failure remains a failure.
process.exit(1);
