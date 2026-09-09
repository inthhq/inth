import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { z } from "zod";

const root = fileURLToPath(new URL("../", import.meta.url));
const experiment = path.join(root, "experiments", "sentry-native");
const source = path.join(root, "build", "sentry-native-source");
const output = path.join(root, "build", "sentry-native-sdk");
const commit = "724479b549a299ea8363994306b36a00c754fcba";
const require = createRequire(import.meta.url);
if (process.platform !== "darwin") {
  throw new Error("This probe currently verifies macOS only.");
}
const run = (command: string, args: string[], cwd = root) => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf-8",
    timeout: 120_000,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} failed: ${result.stderr || result.stdout || result.error}`
    );
  }
  return result.stdout.trim();
};
await mkdir(output, { recursive: true });
if (!existsSync(source)) {
  run("git", [
    "clone",
    "--depth",
    "1",
    "--branch",
    "0.16.2",
    "https://github.com/getsentry/sentry-native.git",
    source,
  ]);
}
assert.equal(run("git", ["rev-parse", "HEAD"], source), commit);
assert.equal(run("git", ["status", "--porcelain"], source), "");
run("cmake", [
  "-S",
  source,
  "-B",
  output,
  "-DSENTRY_BACKEND=inproc",
  "-DSENTRY_BUILD_SHARED_LIBS=OFF",
  "-DSENTRY_BUILD_TESTS=OFF",
  "-DSENTRY_BUILD_EXAMPLES=OFF",
  "-DSENTRY_TRANSPORT=curl",
  "-DCMAKE_BUILD_TYPE=RelWithDebInfo",
]);
run("cmake", ["--build", output, "--parallel", "8"]);
run("cc", [
  "-Wall",
  "-Wextra",
  "-Werror",
  "-g",
  "-fno-omit-frame-pointer",
  "-DSENTRY_BUILD_STATIC",
  "-I",
  path.join(source, "include"),
  "-c",
  path.join(experiment, "probe.c"),
  "-o",
  path.join(output, "probe.o"),
]);
const manifest = path.join(output, "ffi.json");
await writeFile(
  manifest,
  JSON.stringify({
    ffi_format: 3,
    functions: ["Init", "Capture", "Close", "Crash"].map((name) => ({
      name: `sentryProbe${name}`,
      params: name === "Init" ? ["string", "string"] : [],
      returns: "i32",
      symbol: `inth_sentry_probe_${name.toLowerCase()}`,
    })),
    libraries: [path.join(output, "probe.o"), path.join(output, "libsentry.a")],
    system_libraries: ["curl"],
  })
);
run(process.execPath, [
  require.resolve("typescript/bin/tsc"),
  "-p",
  path.join(experiment, "tsconfig.json"),
]);
const binary = path.join(output, "probe");
run(process.execPath, [
  require.resolve("scriptc/dist/bootstrap.js"),
  "build",
  path.join(experiment, "probe.ts"),
  "--ffi",
  manifest,
  "-o",
  binary,
]);
console.log("Built Sentry native SDK and static Scriptc probe.");

const frameSchema = z.object({
  function: z.string().optional(),
  instruction_addr: z.string(),
});
const eventSchema = z.object({
  event_id: z.string(),
  exception: z.object({
    values: z
      .array(
        z.object({
          stacktrace: z.object({ frames: z.array(frameSchema).min(1) }),
          type: z.string(),
          value: z.string().optional(),
        })
      )
      .min(1),
  }),
  release: z.literal("inth-cli@native-probe"),
  tags: z.object({ command: z.literal("probe") }),
  user: z.object({ id: z.literal("cli:synthetic-probe") }),
});
const envelopes: string[] = [];
let stall = false;
const server = createServer(async (request, response) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }
  envelopes.push(Buffer.concat(chunks).toString("utf-8"));
  if (!stall) {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end("{}");
  }
});
const listening = once(server, "listening");
server.listen(0, "127.0.0.1");
await listening;
const address = z.object({ port: z.number() }).parse(server.address());
const databaseRoot = await mkdtemp(path.join(output, "test-"));
const launch = (mode: string, database: string, disabled = false) => {
  const completion = Promise.withResolvers<{
    code: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
    elapsed_ms: number;
  }>();
  const started = performance.now();
  const child = spawn(binary, [mode, "raw-input-must-not-be-captured"], {
    env: {
      ...process.env,
      INTH_TELEMETRY_DISABLED: disabled ? "1" : "0",
      PROBE_DATABASE: path.join(databaseRoot, database),
      PROBE_DSN: `http://public@127.0.0.1:${address.port}/1`,
      PROBE_SECRET: "secret-env-must-not-be-captured",
    },
    timeout: 10_000,
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  child.once("error", completion.reject);
  child.once("close", (code, signal) => {
    completion.resolve({
      code,
      elapsed_ms: performance.now() - started,
      signal,
      stderr,
      stdout,
    });
  });
  return completion.promise;
};
// The SDK emits JSON envelope items here, without binary attachments or compression.
const readEvent = (body: string) => {
  for (const line of body.split("\n")) {
    if (!line) {
      continue;
    }
    const result = eventSchema.safeParse(JSON.parse(line));
    if (result.success) {
      return result.data;
    }
  }
  throw new Error("No exception with native stack frames in envelope.");
};
try {
  const disabled = await launch("capture", "disabled", true);
  assert.equal(disabled.code, 0);
  assert.equal(disabled.stdout.trim(), "disabled");
  assert.equal(envelopes.length, 0);
  assert.ok(!existsSync(path.join(databaseRoot, "disabled")));

  const capture = await launch("capture", "capture");
  assert.equal(capture.code, 0, capture.stderr);
  assert.equal(capture.stdout.trim(), "flush=0");
  assert.equal(envelopes.length, 1);
  const captured = readEvent(z.string().parse(envelopes[0]));
  const [capturedException] = captured.exception.values;
  assert.ok(capturedException);
  assert.equal(capturedException.type, "ProbeError");
  assert.ok(
    capturedException.stacktrace.frames.some(
      (frame) => frame.function === "inth_sentry_probe_capture"
    )
  );

  const beforeCrash = envelopes.length;
  const crash = await launch("crash", "crash");
  assert.equal(crash.signal, "SIGABRT", crash.stderr);
  const deliveredBeforeRestart = envelopes.length > beforeCrash;
  const queuedCount = envelopes.length;
  const disabledRecovery = await launch("idle", "crash", true);
  assert.equal(disabledRecovery.code, 0);
  assert.equal(disabledRecovery.stdout.trim(), "disabled");
  assert.equal(envelopes.length, queuedCount);
  // Also tests SDK recovery from the crash database on the next CLI invocation.
  const recovery = await launch("idle", "crash");
  assert.equal(recovery.code, 0, recovery.stderr);
  assert.equal(envelopes.length, beforeCrash + 1);
  const crashed = readEvent(z.string().parse(envelopes[beforeCrash]));
  const [crashedException] = crashed.exception.values;
  assert.ok(crashedException);
  assert.equal(crashedException.type, "SIGABRT");
  assert.ok(
    crashedException.stacktrace.frames.some(
      (frame) => frame.function === "inth_sentry_probe_crash"
    )
  );

  stall = true;
  const timeout = await launch("capture", "timeout");
  assert.equal(timeout.code, 0, timeout.stderr);
  assert.equal(envelopes.length, beforeCrash + 2);
  assert.ok(timeout.elapsed_ms < 2500, `Shutdown took ${timeout.elapsed_ms}ms`);
  const payload = envelopes.join("\n");
  assert.ok(!payload.includes("raw-input-must-not-be-captured"));
  assert.ok(!payload.includes("secret-env-must-not-be-captured"));
  await writeFile(path.join(databaseRoot, "envelopes.txt"), payload);
  const binaryStat = await stat(binary);
  const report = {
    backend: "inproc",
    binary_bytes: binaryStat.size,
    capture_exit_ms: Math.round(capture.elapsed_ms),
    capture_frames: capturedException.stacktrace.frames,
    compiler: "scriptc@0.0.36",
    crash_delivered_before_restart: deliveredBeforeRestart,
    crash_frames: crashedException.stacktrace.frames,
    crash_type: crashedException.type,
    dynamic_runtime: false,
    env_opt_out: "passed",
    live_sentry_delivery: "not tested",
    platform: `${process.platform}-${process.arch}`,
    raw_argument_and_env_sentinels_absent: true,
    sdk: "sentry-native@0.16.2",
    source_commit: commit,
    stalled_server_exit_ms: Math.round(timeout.elapsed_ms),
  };
  await writeFile(
    path.join(experiment, "assessment.json"),
    `${JSON.stringify(report, null, 2)}\n`
  );
  console.log(
    "Native exception, crash, environment opt-out, and bounded shutdown checks passed."
  );
} finally {
  server.closeAllConnections();
  await promisify(server.close.bind(server))();
}
