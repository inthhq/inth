import { existsSync, readFileSync, writeFileSync } from "node:fs";
// eslint-disable-next-line unicorn/import-style -- Scriptc requires named node:path imports.
import { join } from "node:path";

import { parseArguments } from "../../src/arguments.ts";
import { writeConfig } from "../../src/native/native-bindings.ts";
import {
  NativeTelemetry,
  telemetryDisabled,
} from "../../src/native/native-telemetry.ts";
import { telemetryPayload } from "../../src/telemetry.ts";

const check = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};
const [directory] = process.argv.slice(2);
if (!directory) {
  throw new Error("Missing telemetry test directory.");
}
const telemetry = new NativeTelemetry(directory, false);
check(telemetry.enabled(), "Telemetry must default to enabled.");
check(
  !existsSync(join(directory, "telemetry")),
  "Status created telemetry state."
);
check(
  new NativeTelemetry(directory, true).installationId() === "",
  "Environment override initialized telemetry."
);
check(
  !existsSync(join(directory, "telemetry")),
  "Environment override created telemetry state."
);
const first = telemetry.installationId();
check(
  first.length === 36,
  "Default telemetry did not create an installation ID."
);
check(
  new NativeTelemetry(directory, false).installationId() === first,
  "Installation ID did not persist between invocations."
);
check(
  new NativeTelemetry(directory, true).notice() === "",
  "Disabled telemetry displayed a notice."
);
check(
  telemetry.notice() ===
    "We collect usage telemetry to improve our services.\nTo opt out, run `inth telemetry disable` or set INTH_TELEMETRY_DISABLED=1.\n",
  "First-run notice wording or spacing changed."
);
check(telemetry.notice() === "", "First-run notice was repeated.");
telemetry.setEnabled(true);
check(
  telemetry.installationId() === first,
  "Enabling again changed the installation ID."
);
check(
  new NativeTelemetry(directory, true).installationId() === "",
  "Environment override did not disable telemetry."
);
check(
  telemetryDisabled("1", "") && telemetryDisabled("", "true"),
  "Environment and CI opt-out failed."
);
check(
  !telemetryDisabled("0", "false"),
  "False environment flags disabled telemetry."
);
new NativeTelemetry(directory, true).setEnabled(true);
check(
  telemetry.installationId() === first,
  "Environment override changed the saved installation ID."
);
check(
  (await telemetry.userId("browser-token", "user-one")) === "user-one",
  "Verified user ID was not cached."
);
check(
  (await telemetry.userId("browser-token", "", "http://127.0.0.1:1")) ===
    "user-one",
  "Cached user ID required another lookup."
);
check(
  !readFileSync(join(directory, "telemetry-identity"), "utf-8").includes(
    "browser-token"
  ),
  "Identity cache stored a credential."
);
check(
  (await telemetry.userId("another-token", "", "http://127.0.0.1:1")) === "",
  "Another credential inherited the cached identity."
);
check(
  (await new NativeTelemetry(directory, true).userId(
    "browser-token",
    "user-one"
  )) === "",
  "Disabled telemetry resolved an identity."
);
telemetry.setEnabled(false);
check(
  !telemetry.enabled() && telemetry.installationId() === "",
  "Opt-out left telemetry enabled."
);
check(
  new NativeTelemetry(directory, false).installationId() === "",
  "Next invocation ignored opt-out."
);
check(telemetry.notice() === "", "Opted-out installation displayed a notice.");
check(
  !readFileSync(join(directory, "telemetry"), "utf-8").includes(first),
  "Opt-out retained the installation ID."
);
check(
  readFileSync(join(directory, "telemetry-identity"), "utf-8") === "",
  "Opt-out retained the cached user ID."
);
telemetry.setEnabled(true);
check(
  telemetry.installationId() !== first,
  "Re-enabling reused the removed installation ID."
);
check(
  writeConfig(join(directory, "telemetry"), "private-invalid-state") === 0,
  "Cannot write malformed telemetry state."
);
check(
  telemetry.installationId() === "",
  "Malformed telemetry state was trusted."
);
const blocked = join(directory, "blocked");
writeFileSync(blocked, "Cannot store state inside a file.");
check(
  new NativeTelemetry(join(blocked, "state"), false).installationId() === "",
  "Unavailable state caused telemetry to start."
);
const body = telemetryPayload(
  parseArguments(["api", "/v1/private-path", "--token", "secret-token"]),
  first,
  12,
  "",
  false
);
check(
  body.includes('"command":"api"') &&
    !body.includes("private-path") &&
    !body.includes("secret-token"),
  "Telemetry included private arguments."
);
console.log(
  "Native telemetry: default-on, first-run notice, persistence, opt-out, environment overrides, and payload privacy passed."
);
