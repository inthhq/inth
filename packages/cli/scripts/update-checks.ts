import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { z } from "zod";

const checkOutput = z.object({
  data: z.object({
    automatic: z.boolean(),
    currentVersion: z.string(),
    installMethod: z.string(),
    latestVersion: z.string(),
    updateAvailable: z.boolean(),
    updateCommand: z.string().nullable(),
  }),
  ok: z.literal(true),
  schemaVersion: z.literal(2),
});

const errorOutput = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
  ok: z.literal(false),
});

// Serves a dist-tags document and records request paths.
const registry = async (body: string) => {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url ?? "");
    response.setHeader("content-type", "application/json");
    response.end(body);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  // SAFETY: A server listening on a TCP host and port reports an AddressInfo.
  const { port } = server.address() as AddressInfo;
  return {
    close: async () => {
      server.close();
      await once(server, "close");
    },
    requests,
    url: `http://127.0.0.1:${port}`,
  };
};

const RUN_TIMEOUT_MS = 10_000;

const closed = async (child: ChildProcess): Promise<number | null> => {
  const [code] = await once(child, "close");
  return code;
};

const expired = async (signal: AbortSignal): Promise<"timeout"> => {
  await delay(RUN_TIMEOUT_MS, undefined, { signal });
  return "timeout";
};

// spawnSync would block the in-process registry, so the CLI runs
// asynchronously. Commands run without a shell, so the timeout kills the
// process that owns the output pipes and paths need no quoting.
const runCli = async (
  command: string,
  args: string[],
  registryUrl: string,
  state: string
) => {
  const child = spawn(command, args, {
    env: {
      ...process.env,
      APPDATA: state,
      HOME: state,
      INTH_NPM_REGISTRY: registryUrl,
      INTH_TELEMETRY_DISABLED: "1",
      USERPROFILE: state,
      XDG_STATE_HOME: state,
    },
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const stop = new AbortController();
  const status = await Promise.race([closed(child), expired(stop.signal)]);
  stop.abort();
  if (status === "timeout") {
    child.kill();
    assert.fail(`${command} did not finish within ${RUN_TIMEOUT_MS} ms.`);
  }
  return { status, stderr, stdout };
};

/**
 * Checks install-method detection and the registry request for one layout.
 * `launcher` holds arguments that precede the CLI's own, such as the npm
 * launcher script when `command` is Node.
 */
export const verifyUpdateCheck = async (
  command: string,
  launcher: string[],
  method: string,
  automatic: boolean
): Promise<void> => {
  const state = await mkdtemp(path.join(os.tmpdir(), "inth-update-check-"));
  const available = await registry('{"latest":"99.0.0"}');
  const invalid = await registry('{"latest":"not-a-version"}');
  try {
    const checked = await runCli(
      command,
      [...launcher, "update", "--check", "--json"],
      available.url,
      state
    );
    assert.equal(checked.status, 0, checked.stderr);
    const { data } = checkOutput.parse(JSON.parse(checked.stdout));
    assert.equal(data.installMethod, method);
    assert.equal(data.automatic, automatic);
    assert.equal(data.latestVersion, "99.0.0");
    assert.equal(data.updateAvailable, true);
    assert.deepEqual(available.requests, ["/-/package/@inth/cli/dist-tags"]);

    const rejected = await runCli(
      command,
      [...launcher, "update", "--check", "--json"],
      invalid.url,
      state
    );
    assert.equal(rejected.status, 1);
    assert.equal(
      errorOutput.parse(JSON.parse(rejected.stdout)).error.code,
      "invalid_response"
    );

    if (!automatic) {
      const update = await runCli(
        command,
        [...launcher, "update"],
        available.url,
        state
      );
      assert.equal(update.status, 1);
      assert.match(update.stderr, /^Error: /u);
    }
    console.log(
      `Native update check: ${method} installation detected, registry version parsed.`
    );
  } finally {
    await Promise.all([available.close(), invalid.close()]);
    await rm(state, { force: true, recursive: true });
  }
};
