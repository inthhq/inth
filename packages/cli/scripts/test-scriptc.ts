/* eslint-disable no-await-in-loop -- Fixtures share build/native outputs and the keychain, so steps run one at a time. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { performance } from "node:perf_hooks";

import {
  verifyHelp,
  verifyStatelessBypass,
  verifyUsageErrors,
} from "./command-checks.ts";
import {
  verifyCliState,
  verifyFixtureSuites,
  verifyIdentity,
  verifyOrganization,
  verifyOutput,
  verifyProfile,
  verifyResources,
  verifyTelemetryFixture,
  verifyTerminals,
  verifyUnattendedUi,
  verifyWindowsFixtures,
} from "./fixture-checks.ts";
import { verifyJson } from "./json-checks.ts";
import { verifyMcp } from "./mcp-checks.ts";
import { binary, fixture, root, target } from "./native-test-support.ts";
import { verifyDevelopmentTelemetry, verifySentry } from "./sentry-checks.ts";
import { verifySkills } from "./skills-checks.ts";
import { verifyTelemetry } from "./telemetry-checks.ts";
import { verifyTransport } from "./transport-checks.ts";

// Native subprocesses must never send production analytics.
process.env.INTH_TELEMETRY_DISABLED = "1";

if (target.platform !== process.platform || target.arch !== process.arch) {
  throw new Error(
    "Run native tests on the destination OS and architecture. Use pnpm build for cross-compilation."
  );
}

const buildFixtures = (): void => {
  const build = spawnSync(
    process.execPath,
    [path.join(root, "scripts/build-scriptc.ts"), "--tests"],
    { stdio: "inherit" }
  );
  assert.equal(build.status, 0, "Static build failed.");
  const developmentPackage = spawnSync(
    process.execPath,
    [path.join(root, "scripts/package-native.ts")],
    { encoding: "utf-8", timeout: 5000 }
  );
  assert.notEqual(developmentPackage.status, 0);
  assert.match(
    developmentPackage.stderr,
    /Cannot package a development build/u
  );
};

interface Step {
  name: string;
  run: () => void | Promise<void>;
}

const windows = process.platform === "win32";
const steps: Step[] = [
  {
    name: "Build fixtures and reject development packaging",
    run: buildFixtures,
  },
  { name: "Sentry reporting", run: () => verifySentry(fixture("sentry-test")) },
  { name: "Telemetry commands", run: () => verifyTelemetry(binary, false) },
  { name: "JSON output", run: () => verifyJson(binary) },
  { name: "MCP setup", run: () => verifyMcp(binary) },
  { name: "Skills", run: () => verifySkills(binary) },
  { name: "Help", run: verifyHelp },
  { name: "Usage errors", run: verifyUsageErrors },
  { name: "Stateless API-key bypass", run: verifyStatelessBypass },
  {
    name: "Development telemetry fixture",
    run: () =>
      verifyDevelopmentTelemetry(fixture("development-telemetry-test")),
  },
  ...(windows
    ? [
        {
          name: "Windows console and credentials fixtures",
          run: verifyWindowsFixtures,
        },
      ]
    : []),
  { name: "Resource and resource-output fixtures", run: verifyResources },
  ...(windows ? [] : [{ name: "Terminal selectors", run: verifyTerminals }]),
  { name: "output-test scenarios", run: verifyOutput },
  { name: "identity-test scenarios", run: verifyIdentity },
  { name: "organization-test scenarios", run: verifyOrganization },
  { name: "profile-test scenarios", run: verifyProfile },
  { name: "ui-test unattended", run: verifyUnattendedUi },
  { name: "cli-test state directory", run: verifyCliState },
  { name: "mcp, keychain, auth, and agent fixtures", run: verifyFixtureSuites },
  { name: "telemetry-test", run: verifyTelemetryFixture },
  {
    name: "transport-test",
    run: () => verifyTransport(fixture("transport-test")),
  },
];

for (const step of steps) {
  const started = performance.now();
  try {
    await step.run();
  } catch (error) {
    console.error(`Step failed: ${step.name}`);
    throw error;
  }
  console.log(`${step.name} (${Math.round(performance.now() - started)} ms)`);
}
