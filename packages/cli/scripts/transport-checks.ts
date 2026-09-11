import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";

import { z } from "zod";

import { userIdentity, keyIdentity } from "../test/fixtures/identity.ts";

type Guard = (work: () => void) => void;

const readBody = (
  request: IncomingMessage,
  guard: Guard,
  handle: (body: string) => void
): void => {
  let body = "";
  request.on("data", (chunk) => {
    body += chunk;
  });
  request.on("end", () => guard(() => handle(body)));
};

export const verifyTransport = async (fixture: string): Promise<void> => {
  let identityRequests = 0;
  let telemetryRequests = 0;
  let claims = 0;
  let registrations = 0;
  let retries = 0;
  let redirects = 0;
  let hung = 0;
  let deadlineRequests = 0;
  let bearer = 0;
  const handlerFailures: string[] = [];
  const handleTelemetryRequest = (
    request: IncomingMessage,
    response: ServerResponse,
    guard: Guard
  ): boolean => {
    if (request.url === "/telemetry/me") {
      identityRequests += 1;
      assert.equal(request.method, "GET");
      const token = request.headers.authorization;
      assert.ok(
        token === "Bearer browser-first" || token === "Bearer browser-second"
      );
      response.end(
        JSON.stringify({
          ...userIdentity,
          data: {
            ...userIdentity.data,
            principal: {
              type: "oauth",
              userId:
                token === "Bearer browser-first" ? "user-one" : "user-two",
            },
          },
        })
      );
    } else if (request.url === "/telemetry/key") {
      response.end(JSON.stringify(keyIdentity));
    } else if (request.url === "/telemetry/invalid") {
      response.end(
        '{"success":true,"data":{"principal":{"type":"oauth","userId":42}}}'
      );
    } else if (request.url === "/telemetry") {
      telemetryRequests += 1;
      assert.equal(request.method, "POST");
      assert.equal(request.headers.authorization, undefined);
      readBody(request, guard, (body) => {
        const event = JSON.parse(body);
        assert.equal(event.event, "cli_command_completed");
        assert.equal(event.properties.command, "mcp list");
        assert.equal(event.properties.source, "cli");
        assert.equal(event.properties.$process_person_profile, false);
        response.end("{}");
      });
    } else {
      return false;
    }
    return true;
  };
  const handleRequest = (
    request: IncomingMessage,
    response: ServerResponse,
    guard: Guard
  ): void => {
    if (handleTelemetryRequest(request, response, guard)) {
      return;
    }
    if (request.url?.startsWith("/mutation/")) {
      assert.equal(request.method, request.url.slice("/mutation/".length));
      assert.equal(request.headers.authorization, "Bearer inth_transport_test");
      readBody(request, guard, (body) => {
        if (request.method === "PATCH") {
          assert.equal(request.headers["content-type"], "application/json");
          assert.deepEqual(JSON.parse(body), { description: null });
        } else {
          assert.equal(body, "");
        }
        response.writeHead(204);
        response.end();
      });
    } else if (request.url === "/register") {
      registrations += 1;
      assert.equal(request.method, "POST");
      assert.equal(request.headers.authorization, undefined);
      assert.equal(request.headers["content-type"], "application/json");
      response.writeHead(201);
      response.end("{}");
    } else if (request.url === "/claim") {
      claims += 1;
      assert.equal(request.method, "POST");
      assert.equal(request.headers.authorization, undefined);
      response.writeHead(429, { "Retry-After": "60" });
      response.end('{"error":"slow_down"}');
    } else if (request.url === "/create") {
      assert.equal(request.method, "POST");
      assert.equal(request.headers.authorization, "Bearer inth_transport_test");
      assert.equal(request.headers["content-type"], "application/json");
      readBody(request, guard, (body) => {
        assert.deepEqual(JSON.parse(body), {
          name: "Acme Team",
          slug: "acme",
        });
        response.writeHead(201);
        response.end("{}");
      });
    } else if (request.url === "/bearer") {
      if (request.headers.authorization === "Bearer inth_transport_test") {
        bearer += 1;
      }
      response.writeHead(bearer === 1 ? 200 : 401);
      response.end("{}");
    } else if (request.url === "/rate-limit") {
      retries += 1;
      response.writeHead(retries === 1 ? 429 : 200, {
        "Retry-After": "Wed, 21 Oct 2015 07:28:00 GMT",
      });
      response.end("{}");
    } else if (request.url === "/redirect") {
      response.writeHead(302, { Location: "/redirect-target" });
      response.end();
    } else if (request.url === "/redirect-target") {
      redirects += 1;
      response.end("should not be reached");
    } else if (request.url === "/malformed") {
      response.writeHead(200, { "X-Request-Id": "native-malformed" });
      response.end('{"token_endpoint":false}');
    } else if (request.url === "/disconnect") {
      request.socket.destroy();
    } else if (request.url === "/hang" || request.url === "/deadline-hang") {
      response.writeHead(200);
      response.write("{");
      if (request.url === "/deadline-hang") {
        deadlineRequests += 1;
      } else {
        hung += 1;
      }
    } else {
      response.writeHead(404);
      response.end();
    }
  };
  const server = createServer((request, response) => {
    const guard: Guard = (work) => {
      try {
        work();
      } catch (error) {
        handlerFailures.push(
          `${request.method} ${request.url}: ${error instanceof Error ? error.message : String(error)}`
        );
        response.writeHead(500);
        response.end();
      }
    };
    guard(() => handleRequest(request, response, guard));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const identityDirectory = await mkdtemp(
    path.join(os.tmpdir(), "inth-identity-cache-")
  );
  try {
    const { port } = z.object({ port: z.number() }).parse(server.address());
    const child = spawn(
      fixture,
      [`http://127.0.0.1:${port}`, path.join(identityDirectory, "state")],
      { stdio: "inherit", timeout: 8000 }
    );
    const [status] = await once(child, "exit");
    assert.deepEqual(
      handlerFailures,
      [],
      "Native HTTP handler expectations failed."
    );
    assert.equal(status, 0, "Native HTTP checks failed or timed out.");
    assert.equal(claims, 1);
    assert.equal(registrations, 1);
    assert.equal(retries, 2);
    assert.equal(redirects, 0);
    assert.equal(hung, 3);
    // The short approval deadline can expire before the request is sent.
    assert.ok(deadlineRequests <= 1);
    assert.equal(identityRequests, 2);
    assert.equal(telemetryRequests, 1);
    assert.equal(bearer, 1);
  } finally {
    const closed = once(server, "close");
    server.closeAllConnections();
    server.close();
    await closed;
    await rm(identityDirectory, { force: true, recursive: true });
  }
};
