/* eslint-disable no-await-in-loop -- Each scenario verifies the cumulative request count and saved preference. */
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";

import { z } from "zod";

const frame = z.object({
  function: z.string().optional(),
  instruction_addr: z.string(),
});
const eventSchema = z
  .object({
    contexts: z
      .object({
        cli: z
          .object({
            build_revision: z.string(),
            elapsed_ms: z.number().nonnegative(),
            interactive: z.boolean(),
            json: z.boolean(),
            last_operation: z.string(),
            original_stack_available: z.literal(false),
            recent_operations: z.array(z.string()).max(12),
            stack_origin: z.literal("report_site"),
          })
          .strict(),
        os: z
          .object({ name: z.string(), version: z.string().optional() })
          .strict(),
        runtime: z.object({ name: z.literal("Scriptc") }).strict(),
      })
      .strict(),
    culprit: z.string(),
    debug_meta: z.object({
      images: z
        .array(
          z.object({ code_file: z.string(), debug_file: z.string().optional() })
        )
        .min(1),
    }),
    dist: z.string(),
    environment: z.literal("production"),
    exception: z.object({
      values: z
        .array(
          z.object({
            mechanism: z.object({
              description: z.string(),
              handled: z.literal(true),
              type: z.literal("inth.caught"),
            }),
            stacktrace: z.object({ frames: z.array(frame).min(1) }),
            type: z.string(),
            value: z.string(),
          })
        )
        .min(1),
    }),
    fingerprint: z.array(z.string()),
    release: z.string(),
    tags: z
      .object({
        arch: z.literal(process.arch),
        command: z.literal("api"),
        error_code: z.string(),
        last_operation: z.string(),
        os: z.literal(process.platform),
        source: z.literal("cli"),
      })
      .strict(),
    user: z.object({ id: z.string() }),
  })
  .passthrough();

export const verifyDevelopmentTelemetry = async (
  binary: string
): Promise<void> => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "inth-development-check-")
  );
  let requests = 0;
  const server = createServer((_request, response) => {
    requests += 1;
    response.end("{}");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = z.object({ port: z.number() }).parse(server.address());
  try {
    for (const mode of ["fresh", "enabled"]) {
      const state = path.join(directory, mode);
      const result = await promisify(execFile)(
        binary,
        [state, `http://127.0.0.1:${address.port}`, mode],
        {
          env: {
            ...process.env,
            CI: "",
            INTH_TELEMETRY_DISABLED: "0",
            NODE_ENV: "production",
          },
          timeout: 8000,
        }
      );
      assert.equal(result.stdout.trim(), "Development telemetry disabled.");
      assert.equal(result.stderr, "");
      if (mode === "fresh") {
        await assert.rejects(readdir(state), { code: "ENOENT" });
      } else {
        assert.deepEqual(await readdir(state), ["telemetry"]);
      }
    }
    assert.equal(
      requests,
      0,
      "Development builds must make no telemetry requests."
    );
    console.log(
      "Development builds: no PostHog, identity lookup, Sentry capture, notice, or automatic state."
    );
  } finally {
    server.closeAllConnections();
    await promisify(server.close.bind(server))();
    await rm(directory, { force: true, recursive: true });
  }
};

export const verifySentry = async (binary: string): Promise<void> => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "inth-sentry-check-"));
  const bodies: string[] = [];
  let mode = "ok";
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.from(chunk));
    }
    bodies.push(Buffer.concat(chunks).toString("utf-8"));
    assert.equal(
      request.url,
      "/api/1/envelope/?sentry_key=public&sentry_version=7"
    );
    assert.equal(
      request.headers["content-type"],
      "application/x-sentry-envelope"
    );
    if (mode === "stall") {
      return;
    }
    response.writeHead(mode === "redirect" ? 302 : 200, {
      Location: "/must-not-follow",
    });
    response.end("{}");
  });
  const listening = once(server, "listening");
  server.listen(0, "127.0.0.1");
  await listening;
  const address = z.object({ port: z.number() }).parse(server.address());
  const dsn = `http://public@127.0.0.1:${address.port}/1`;
  const launch = async (
    scenario: string,
    disabled = "",
    ci = "",
    endpoint = dsn
  ) => {
    const state = path.join(directory, scenario);
    const started = performance.now();
    const child = spawn(binary, [state, endpoint, scenario], {
      env: {
        ...process.env,
        CI: ci,
        INTH_TELEMETRY_DISABLED: disabled,
        SENTRY_SECRET_TEST: "private-environment-secret",
      },
      timeout: 8000,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const [code] = await once(child, "close");
    assert.equal(code, 1, stderr);
    assert.equal(stderr, "");
    const files = await readdir(state).catch(() => []);
    assert.deepEqual(
      files.filter((name) => name.startsWith("sentry-")),
      []
    );
    return {
      elapsed: performance.now() - started,
      state,
      stdout: stdout.trim(),
    };
  };
  try {
    for (const scenario of [
      "usage",
      "http",
      "network",
      "cancelled",
      "no-dsn",
    ]) {
      const result = await launch(scenario);
      assert.equal(result.stdout, "skipped");
      await assert.rejects(readdir(result.state), { code: "ENOENT" });
    }
    for (const [disabled, ci] of [
      ["1", ""],
      ["true", ""],
      ["", "true"],
    ]) {
      const result = await launch("environment", disabled, ci);
      assert.equal(result.stdout, "skipped");
    }
    for (const preference of ["disabled", "corrupt-preference", ""]) {
      const state = path.join(directory, "preference");
      await mkdir(state, { recursive: true });
      await writeFile(path.join(state, "telemetry"), preference);
      const result = await launch("preference");
      assert.equal(result.stdout, "skipped");
    }
    assert.equal(
      bodies.length,
      0,
      "Excluded errors initialized a sending SDK."
    );
    const unexpected = await launch("unexpected");
    assert.equal(unexpected.stdout, "sent");
    assert.equal(bodies.length, 1);
    const envelope = z.string().parse(bodies[0]);
    const event = eventSchema.parse(
      JSON.parse(envelope.trim().split("\n").at(-1) || "null")
    );
    assert.equal(event.user.id, "usr_test_verified");
    assert.deepEqual(event.fingerprint, [
      "inth-cli-v1",
      "api",
      "TypeError",
      "unexpected_error",
      "resource_format",
    ]);
    assert.equal(
      event.exception.values[0]?.value,
      "Unexpected error after entering resource_format. Original message omitted."
    );
    assert.deepEqual(event.contexts.cli.recent_operations, [
      "argument_parse",
      "resource_format",
    ]);
    assert.equal(event.contexts.cli.last_operation, "resource_format");
    assert.equal(event.culprit, "resource_format");
    assert.equal(event.contexts.cli.json, false);
    assert.equal(event.contexts.cli.interactive, false);
    assert.equal(event.contexts.cli.build_revision, event.dist);
    assert.match(event.dist, /^(?:[0-9a-f]{40}|unknown)(?:\.dirty)?$/u);
    assert.match(event.release, /^inth-cli@/u);
    for (const key of ["extra", "breadcrumbs", "server_name", "request"]) {
      assert.ok(!(key in event));
    }
    for (const image of event.debug_meta.images) {
      assert.ok(!/[\\/]/u.test(image.code_file));
      assert.ok(!/[\\/]/u.test(image.debug_file || ""));
    }
    for (const secret of [
      "private-input",
      "private-token",
      "secret-file",
      "private-environment-secret",
      directory,
      os.homedir(),
    ]) {
      assert.ok(!envelope.includes(secret));
    }
    const anonymousResult = await launch("anonymous");
    assert.equal(anonymousResult.stdout, "sent");
    const anonymous = eventSchema.parse(
      JSON.parse(
        z.string().parse(bodies[1]).trim().split("\n").at(-1) || "null"
      )
    );
    assert.match(anonymous.user.id, /^cli:[0-9a-f-]{36}$/u);
    assert.deepEqual(anonymous.fingerprint, event.fingerprint);
    const lockResult = await launch("credential-lock");
    assert.equal(lockResult.stdout, "sent");
    const lock = eventSchema.parse(
      JSON.parse(
        z.string().parse(bodies[2]).trim().split("\n").at(-1) || "null"
      )
    );
    assert.equal(
      lock.exception.values[0]?.value,
      "Cannot acquire the credential lock."
    );
    assert.equal(lock.tags.error_code, "credential_lock_acquire");
    assert.equal(lock.tags.last_operation, "credential_lock");
    assert.deepEqual(lock.fingerprint, [
      "inth-cli-v1",
      "api",
      "Error",
      "credential_lock_acquire",
      "credential_lock",
    ]);
    assert.notDeepEqual(lock.fingerprint, event.fingerprint);
    // Save the locally captured, scrubbed report for manual inspection.
    await writeFile(
      path.join(path.dirname(binary), "sentry-event-example.json"),
      `${JSON.stringify(JSON.parse(z.string().parse(bodies[2]).trim().split("\n").at(-1) || "null"), null, 2)}\n`
    );
    const otherResult = await launch("other-operation");
    assert.equal(otherResult.stdout, "sent");
    const other = eventSchema.parse(
      JSON.parse(
        z.string().parse(bodies[3]).trim().split("\n").at(-1) || "null"
      )
    );
    assert.notDeepEqual(other.fingerprint, event.fingerprint);
    assert.equal(other.tags.last_operation, "api_decode");
    mode = "redirect";
    const redirect = await launch("redirect");
    assert.equal(redirect.stdout, "skipped");
    assert.equal(bodies.length, 5, "Followed a telemetry redirect.");
    mode = "stall";
    const stalled = await launch("stall");
    assert.equal(stalled.stdout, "skipped");
    assert.ok(
      stalled.elapsed < 3000,
      `Reporting delayed exit for ${stalled.elapsed}ms`
    );
    assert.equal(bodies.length, 6, "Retried a failed report.");
    for (const body of bodies) {
      for (const secret of [
        "private-input",
        "private-token",
        "secret-file",
        "private-environment-secret",
        directory,
        os.homedir(),
      ]) {
        assert.ok(!body.includes(secret));
      }
    }
    console.log(
      "Native Sentry: lazy capture, scrubbed payload, opt-out, identity, redirects, cleanup, and timeout passed."
    );
  } finally {
    server.closeAllConnections();
    await promisify(server.close.bind(server))();
    await rm(directory, { force: true, recursive: true });
  }
};
