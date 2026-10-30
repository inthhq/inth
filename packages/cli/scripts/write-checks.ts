import assert from "node:assert/strict";
/* eslint-disable no-await-in-loop -- Run native scenarios serially against their own request counters. */
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";

import { v2WriteCases } from "../test/fixtures/agent-access-v2-writes.ts";

const caseIndex = (scenario: string, count: number): number => {
  if (scenario === "all") {
    return count;
  }
  if (scenario === "approval") {
    return 13 + count;
  }
  if (scenario === "refresh") {
    return 22;
  }
  if (scenario.startsWith("image")) {
    return 28;
  }
  return scenario === "pending" ? 49 : 40;
};
export const verifyWrites = async (binary: string): Promise<void> => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "inth-native-writes-")
  );
  const image = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 128, 255]);
  await writeFile(path.join(directory, "image.png"), image);
  let scenario = "all";
  let count = 0;
  let original = Buffer.alloc(0);
  const failures: string[] = [];
  const server = createServer(async (request, response) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk));
      }
      const body = Buffer.concat(chunks);
      const url = new URL(request.url ?? "/", "http://fixture.test");
      const expected = v2WriteCases[caseIndex(scenario, count)];
      assert.ok(expected);
      count += 1;
      assert.equal(url.pathname, expected.path);
      assert.equal(request.method, expected.method);
      assert.equal(
        url.searchParams.get("organizationId"),
        expected.scoped ? "org_123" : null
      );
      assert.match(
        request.headers.authorization ?? "",
        /^Bearer native-(?:write|refreshed)-token$/u
      );
      assert.equal(request.headers.cookie, undefined);
      if (expected.image) {
        assert.deepEqual(body, image);
        assert.equal(request.headers["content-type"], "image/png");
      } else {
        assert.deepEqual(
          body.length ? JSON.parse(body.toString()) : undefined,
          expected.body ? JSON.parse(expected.body) : undefined
        );
      }
      if (scenario.includes("refresh")) {
        if (count === 1) {
          original = body;
        } else {
          assert.deepEqual(body, original);
        }
        if (count === 1) {
          response.writeHead(401);
          response.end('{"error":{"code":"UNAUTHORIZED"}}');
          return;
        }
        assert.equal(
          request.headers.authorization,
          "Bearer native-refreshed-token"
        );
      }
      if (scenario.endsWith("rate")) {
        response.writeHead(429, { "Retry-After": "0" });
        response.end("{}");
        return;
      }
      if (scenario === "lost") {
        response.destroy();
        return;
      }
      if (scenario === "image-redirect") {
        response.writeHead(307, { Location: "/not-authorized" });
        response.end();
        return;
      }
      response.setHeader("Content-Type", "application/json");
      response.end(
        scenario === "pending"
          ? '{"success":true,"data":{"status":"pending"}}'
          : expected.response
      );
    } catch (error) {
      failures.push(
        error instanceof Error ? error.message : "Fixture assertion failed"
      );
      response.destroy();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  // eslint-disable-next-line anti-slop/no-runtime-typeof -- A local TCP fixture has a numeric port.
  assert.ok(address && typeof address !== "string");
  try {
    for (const name of [
      "all",
      "approval",
      "refresh",
      "image-refresh",
      "rate",
      "lost",
      "image-rate",
      "image-redirect",
      "pending",
      "validation",
    ]) {
      scenario = name;
      count = 0;
      const child: ChildProcess = spawn(
        binary,
        [`http://127.0.0.1:${address.port}`, directory, name],
        {
          env: { ...process.env, INTH_TELEMETRY_DISABLED: "1" },
          stdio: ["ignore", "pipe", "pipe"],
        }
      );
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk;
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk;
      });
      const timer = setTimeout(() => child.kill("SIGKILL"), 30_000);
      // SAFETY: Node ChildProcess exit emits its numeric exit code or null.
      const exit: [number | null] = (await once(child, "exit")) as [
        number | null,
      ];
      const [code] = exit;
      clearTimeout(timer);
      assert.equal(
        code,
        name === "pending" ? 2 : 0,
        `${name}: ${stderr}\n${stdout}`
      );
      let expectedCount = 1;
      if (name === "all") {
        expectedCount = 50;
      } else if (name === "validation") {
        expectedCount = 0;
      } else if (name.includes("refresh") || name === "approval") {
        expectedCount = 2;
      }
      assert.equal(count, expectedCount);
      assert.equal(JSON.parse(stdout).passed, true);
      if (name === "approval") {
        const saved = path.join(directory, "approval.json");
        assert.deepEqual(
          JSON.parse(await readFile(saved, "utf-8")),
          JSON.parse(v2WriteCases[14]?.body ?? "")
        );
        if (process.platform !== "win32") {
          const savedInfo = await stat(saved);
          // eslint-disable-next-line no-bitwise -- Verify private POSIX file permissions.
          assert.equal(savedInfo.mode & 0o777, 0o600);
        }
      }
    }
    assert.deepEqual(failures, []);
  } finally {
    server.closeAllConnections();
    // eslint-disable-next-line promise/avoid-new -- Node HTTP server shutdown exposes a callback API.
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
    await rm(directory, { force: true, recursive: true });
  }
};
