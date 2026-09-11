/* eslint-disable no-await-in-loop -- Check each configuration output in order. */
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, readFile, stat, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { z } from "zod";

import { userIdentity, keyIdentity } from "../test/fixtures/identity.ts";
import { binary, fixture, run, script } from "./native-test-support.ts";

const forward = (name: string, timeout: number): void => {
  const result = run(fixture(name), [], { timeout });
  console.log(result.stdout.trim());
};

const python = (name: string, args: string[], timeout: number): void => {
  const result = run("python3", [script(name), ...args], { timeout });
  console.log(result.stdout.trim());
};

export const verifyWindowsFixtures = (): void => {
  for (const name of ["windows-console-test", "windows-credentials-test"]) {
    forward(name, 30_000);
  }
};

export const verifyResources = (): void => {
  forward("resource-test", 10_000);
  forward("resource-output-test", 10_000);
};

export const verifyTerminals = (): void => {
  python("test-selector.py", [fixture("ui-test")], 20_000);
  python("test-mcp-ui.py", [binary], 20_000);
  python("test-skills-ui.py", [binary], 30_000);
};

export const verifyOutput = (): void => {
  for (const scenario of [
    {
      code: "rate_limited",
      httpStatus: 429,
      name: "http",
      requestId: "req-123",
      status: 1,
    },
    {
      code: "invalid_scope",
      httpStatus: 400,
      name: "scope",
      requestId: "scope-request",
      status: 1,
    },
    {
      code: "authentication_required",
      httpStatus: 400,
      name: "refresh",
      requestId: "refresh-id",
      status: 1,
    },
    {
      code: "cancelled",
      httpStatus: null,
      name: "cancel",
      requestId: null,
      status: 130,
    },
  ]) {
    const result = run(fixture("output-test"), [scenario.name], {
      status: scenario.status,
    });
    assert.equal(result.stderr, "");
    const value = z
      .object({
        error: z.object({
          code: z.string(),
          httpStatus: z.number().nullable(),
          requestId: z.string().nullable(),
        }),
        ok: z.literal(false),
        schemaVersion: z.literal(2),
      })
      .parse(JSON.parse(result.stdout));
    assert.equal(value.error.code, scenario.code);
    assert.equal(value.error.requestId, scenario.requestId);
    assert.equal(value.error.httpStatus, scenario.httpStatus);
    assert.doesNotMatch(
      result.stdout,
      /private-error-body|Private cancellation/u
    );
  }
  const successful = run(fixture("output-test"), []);
  assert.equal(successful.stderr, "");
  assert.deepEqual(JSON.parse(successful.stdout), {
    data: { data: [{ id: "one" }], pagination: { nextCursor: "next" } },
    ok: true,
    schemaVersion: 2,
  });
};

export const verifyIdentity = (): void => {
  const identity = fixture("identity-test");
  for (const scenario of [
    "user",
    "key",
    "malformed",
    "missing",
    "failed",
    "scopes",
    "missing-capabilities",
  ]) {
    const success = scenario === "user" || scenario === "key";
    const response = run(identity, [scenario, "--json"], {
      status: success ? 0 : 1,
    });
    assert.equal(response.stderr, "");
    const value = JSON.parse(response.stdout);
    if (success) {
      assert.deepEqual(value, {
        data: scenario === "user" ? userIdentity : keyIdentity,
        ok: true,
        schemaVersion: 2,
      });
    } else {
      assert.equal(value.error.code, "invalid_response");
      assert.equal(value.error.requestId, "whoami-id");
    }
  }
  const futureIdentity = run(identity, ["future", "--json"]);
  assert.equal(
    JSON.parse(futureIdentity.stdout).data.data.principal.type,
    "service"
  );
  const identityFailure = run(identity, ["malformed"], { status: 1 });
  assert.equal(identityFailure.stdout, "");
  assert.match(identityFailure.stderr, /whoami-id/u);
  const identityText = run(identity, ["user"]);
  assert.match(identityText.stdout, /User …-one · Browser login/u);
  if (process.platform !== "win32") {
    run("python3", [script("test-identity-output.py"), identity], {
      inherit: true,
      timeout: 15_000,
    });
  }
  console.log(
    "Static whoami: user and API-key identities, schema validation, request IDs, human and JSON output passed."
  );
};

export const verifyOrganization = (): void => {
  for (const scenario of [
    "success",
    "refresh",
    "key",
    "scope",
    "conflict",
    "limit",
    "malformed",
    "failed",
  ]) {
    run(fixture("organization-test"), [scenario], { inherit: true });
  }
};

export const verifyProfile = (): void => {
  for (const scenario of [
    "success",
    "key",
    "refresh",
    "mismatch",
    "malformed",
    "unsafe",
  ]) {
    run(fixture("profile-test"), [scenario], { inherit: true });
  }
};

export const verifyUnattendedUi = (): void => {
  const unattended = run(fixture("ui-test"), [], { status: 1 });
  assert.match(unattended.stderr, /--organization/u);
};

export const verifyCliState = async (): Promise<void> => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "inth-cli-test-"));
  try {
    if (process.platform !== "win32") {
      await mkdir(path.join(directory, "state"), { mode: 0o700 });
    }
    await mkdir(path.join(directory, "project"), { mode: 0o700 });
    const result = run(fixture("cli-test"), [directory], { timeout: 10_000 });
    console.log(result.stdout.trim());
    for (const [filename, id] of [
      ["state/config.json", "org-two"],
      ["project/.inth/project.json", "org-one"],
    ]) {
      assert.ok(filename && id);
      const info = await stat(path.join(directory, filename));
      if (process.platform !== "win32") {
        assert.equal(info.mode % 0o1000, 0o600);
      }
      assert.deepEqual(
        JSON.parse(await readFile(path.join(directory, filename), "utf-8")),
        { organizationId: id }
      );
    }
    const stateFiles = await readdir(path.join(directory, "state"));
    assert.deepEqual(stateFiles.toSorted(), [
      "config.json",
      "connection.json",
      "credentials.lock",
    ]);
    assert.deepEqual(
      JSON.parse(
        await readFile(
          path.join(directory, "state", "connection.json"),
          "utf-8"
        )
      ),
      { auth: "agent" }
    );
    const connectionInfo = await stat(
      path.join(directory, "state", "connection.json")
    );
    if (process.platform !== "win32") {
      assert.equal(connectionInfo.mode % 0o1000, 0o600);
    }
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
};

export const verifyFixtureSuites = (): void => {
  for (const name of ["mcp-test", "keychain-test", "auth-test", "agent-test"]) {
    forward(name, 30_000);
  }
};

export const verifyTelemetryFixture = async (): Promise<void> => {
  const telemetryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "inth-telemetry-test-")
  );
  try {
    // Let the CLI create its private state directory. Node's temporary parent
    // inherits a Windows ACL that the native state checks correctly reject.
    const result = run(fixture("telemetry-test"), [
      path.join(telemetryDirectory, "state"),
    ]);
    console.log(result.stdout.trim());
  } finally {
    await rm(telemetryDirectory, { force: true, recursive: true });
  }
};
