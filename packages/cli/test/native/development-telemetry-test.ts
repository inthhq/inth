import { parseArguments } from "../../src/arguments.ts";
import { sentryCapture } from "../../src/native/native-bindings.ts";
import { reportUnexpectedError } from "../../src/native/native-sentry.ts";
import { NativeTelemetry } from "../../src/native/native-telemetry.ts";

const [directory, endpoint, mode] = process.argv.slice(2);
if (!directory || !endpoint || !mode) {
  throw new Error("Missing test arguments.");
}
const telemetry = new NativeTelemetry(directory, false);
if (mode === "enabled") {
  telemetry.setEnabled(true);
}
if (telemetry.enabled() || telemetry.installationId() || telemetry.notice()) {
  throw new Error("Development builds must not initialize telemetry.");
}
if (await telemetry.userId("test-token", "", `${endpoint}/me`)) {
  throw new Error("Development builds must not look up telemetry identity.");
}
if (await telemetry.send("{}", `${endpoint}/posthog`)) {
  throw new Error("Development builds must not send usage events.");
}
const dsn = `${endpoint.replaceAll(/^http:\/\//gu, "http://public@")}/1`;
if (
  await reportUnexpectedError(
    new TypeError("test error"),
    false,
    parseArguments(["api", "/test"]),
    directory,
    "",
    dsn
  )
) {
  throw new Error("Development builds must not report errors.");
}
let captured = false;
const status = sentryCapture(
  dsn,
  "inth-cli@test",
  "api",
  "TypeError",
  "{}",
  "cli:test",
  directory,
  () => {
    captured = true;
  }
);
if (status === 0 || captured) {
  throw new Error(
    "Direct native captures must also be disabled in development."
  );
}
console.log("Development telemetry disabled.");
