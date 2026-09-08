import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import {
  mkdtemp,
  mkdir,
  rm,
  readFile,
  stat,
  readdir,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { userIdentity, keyIdentity } from "../test/fixtures/identity.ts";
import { verifyJson } from "./json-checks.ts";
import { verifyMcp } from "./mcp-checks.ts";
import { nativeTarget } from "./native-target.ts";
import { verifyTelemetry } from "./telemetry-checks.ts";

// Native subprocesses must never send production analytics.
process.env.INTH_TELEMETRY_DISABLED = "1";

const root = fileURLToPath(new URL("../", import.meta.url));
const target = nativeTarget(
  process.platform,
  process.arch,
  process.env.SCRIPTC_TARGET,
  process.env.SCRIPTC_CC
);
if (target.platform !== process.platform || target.arch !== process.arch) {
  throw new Error(
    "Run native tests on the destination OS and architecture. Use pnpm build for cross-compilation."
  );
}
const build = spawnSync(
  process.execPath,
  [path.join(root, "scripts/build-scriptc.ts"), "--tests"],
  { stdio: "inherit" }
);
assert.equal(build.status, 0, "Static build failed.");
const executable = (name: string): string =>
  name + (process.platform === "win32" ? ".exe" : "");
const binary = path.join(root, "dist", executable("inth"));
await verifyTelemetry(binary);
verifyJson(binary);
await verifyMcp(binary);
const help = spawnSync(binary, ["--help"], {
  encoding: "utf-8",
  env: { ...process.env, PATH: "" },
  timeout: 5000,
});
assert.equal(help.status, 0, help.stderr);
assert.match(help.stdout, /auth/u);
assert.equal(help.stderr, "");
for (const scenario of [
  {
    args: ["status"],
    error: 'Unknown command "status". Did you mean "inth auth status"?',
  },
  {
    args: ["refresh"],
    error: 'Unknown command "refresh". Did you mean "inth auth refresh"?',
  },
  {
    args: ["unsupported-command"],
    error: 'Unknown command. Run "inth --help" for available commands.',
  },
  { args: ["auth"], error: "Usage: inth auth <status|refresh>" },
  {
    args: ["auth", "unknown"],
    error: "Usage: inth auth <status|refresh>",
  },
  {
    args: ["login", "--unknown"],
    error: 'Unknown option "--unknown". Run inth --help for available options.',
  },
  { args: ["logout", "extra"], error: "Usage: inth logout" },
]) {
  const invalid = spawnSync(binary, scenario.args, {
    encoding: "utf-8",
    timeout: 5000,
  });
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout, "");
  assert.equal(invalid.stderr, `Error: ${scenario.error}\n`);
}
const blockedHome = await mkdtemp(
  path.join(os.tmpdir(), "inth-stateless-test-")
);
try {
  const blockedParent = path.join(blockedHome, "unavailable");
  await writeFile(
    blockedParent,
    "This is a file, so no state directory can be created inside it."
  );
  await writeFile(
    path.join(blockedHome, "Library"),
    "Unavailable macOS state parent."
  );
  for (const args of [
    ["login"],
    ["auth", "status"],
    ["login", "--token", "inth_flag"],
  ]) {
    const bypass = spawnSync(binary, args, {
      encoding: "utf-8",
      env: {
        ...process.env,
        APPDATA: blockedParent,
        HOME: blockedHome,
        INTH_TOKEN: "inth_test_environment",
        USERPROFILE: blockedHome,
        XDG_STATE_HOME: blockedParent,
      },
      timeout: 5000,
    });
    assert.ifError(bypass.error);
    assert.equal(bypass.status, 0, bypass.stderr);
    assert.match(bypass.stdout, /organization API key/u);
    assert.doesNotMatch(
      bypass.stdout + bypass.stderr,
      /inth_test_environment|inth_flag/u
    );
    assert.equal(bypass.stderr, "");
  }
  const blockedFiles = await readdir(blockedHome);
  assert.deepEqual(blockedFiles.toSorted(), ["Library", "unavailable"]);
} finally {
  await rm(blockedHome, { force: true, recursive: true });
}
const output = path.join(
  root,
  "build",
  process.env.SCRIPTC_TARGET
    ? `native-${process.platform}-${process.arch}`
    : "native"
);
if (process.platform === "win32") {
  for (const name of ["windows-console-test", "windows-credentials-test"]) {
    const result = spawnSync(path.join(output, executable(name)), [], {
      encoding: "utf-8",
      timeout: 30_000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    console.log(result.stdout.trim());
  }
}
const resources = spawnSync(
  path.join(output, executable("resource-test")),
  [],
  {
    encoding: "utf-8",
    timeout: 10_000,
  }
);
assert.equal(resources.status, 0, resources.stderr || resources.stdout);
console.log(resources.stdout.trim());
const resourceOutput = spawnSync(
  path.join(output, executable("resource-output-test")),
  [],
  { encoding: "utf-8", timeout: 10_000 }
);
assert.equal(
  resourceOutput.status,
  0,
  resourceOutput.stderr || resourceOutput.stdout
);
console.log(resourceOutput.stdout.trim());
if (process.platform !== "win32") {
  const selector = spawnSync(
    "python3",
    [
      path.join(root, "scripts/test-selector.py"),
      path.join(output, executable("ui-test")),
    ],
    { encoding: "utf-8", timeout: 20_000 }
  );
  assert.equal(selector.status, 0, selector.stderr || selector.stdout);
  console.log(selector.stdout.trim());
  const mcpUi = spawnSync(
    "python3",
    [path.join(root, "scripts/test-mcp-ui.py"), binary],
    { encoding: "utf-8", timeout: 20_000 }
  );
  assert.equal(mcpUi.status, 0, mcpUi.stderr || mcpUi.stdout);
  console.log(mcpUi.stdout.trim());
}
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
  const result = spawnSync(
    path.join(output, executable("output-test")),
    [scenario.name],
    {
      encoding: "utf-8",
      timeout: 5000,
    }
  );
  assert.equal(result.status, scenario.status);
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
for (const scenario of [
  "user",
  "key",
  "malformed",
  "missing",
  "failed",
  "scopes",
  "missing-capabilities",
]) {
  const response = spawnSync(
    path.join(output, executable("identity-test")),
    [scenario, "--json"],
    { encoding: "utf-8", timeout: 5000 }
  );
  assert.equal(response.stderr, "");
  const success = scenario === "user" || scenario === "key";
  assert.equal(response.status, success ? 0 : 1, response.stdout);
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
  const result = spawnSync(
    path.join(output, executable("organization-test")),
    [scenario],
    {
      stdio: "inherit",
      timeout: 5000,
    }
  );
  assert.equal(result.status, 0, `Native organization ${scenario} failed.`);
}
const futureIdentity = spawnSync(
  path.join(output, executable("identity-test")),
  ["future", "--json"],
  { encoding: "utf-8", timeout: 5000 }
);
assert.equal(futureIdentity.status, 0, futureIdentity.stderr);
assert.equal(
  JSON.parse(futureIdentity.stdout).data.data.principal.type,
  "service"
);
const identityFailure = spawnSync(
  path.join(output, executable("identity-test")),
  ["malformed"],
  { encoding: "utf-8", timeout: 5000 }
);
assert.equal(identityFailure.status, 1);
assert.equal(identityFailure.stdout, "");
assert.match(identityFailure.stderr, /whoami-id/u);
const identityText = spawnSync(
  path.join(output, executable("identity-test")),
  ["user"],
  {
    encoding: "utf-8",
    timeout: 5000,
  }
);
assert.equal(identityText.status, 0, identityText.stderr);
assert.match(identityText.stdout, /User …-one · Browser login/u);
if (process.platform !== "win32") {
  const identityTerminal = spawnSync(
    "python3",
    [
      path.join(root, "scripts/test-identity-output.py"),
      path.join(output, executable("identity-test")),
    ],
    { stdio: "inherit", timeout: 15_000 }
  );
  assert.equal(identityTerminal.status, 0, "Identity terminal output failed.");
}
for (const scenario of [
  "success",
  "key",
  "refresh",
  "mismatch",
  "malformed",
  "unsafe",
]) {
  const profile = spawnSync(
    path.join(output, executable("profile-test")),
    [scenario],
    {
      stdio: "inherit",
      timeout: 5000,
    }
  );
  assert.equal(profile.status, 0, `Native profile ${scenario} failed.`);
}
console.log(
  "Static whoami: user and API-key identities, schema validation, request IDs, human and JSON output passed."
);
const successful = spawnSync(path.join(output, executable("output-test")), [], {
  encoding: "utf-8",
  timeout: 5000,
});
assert.equal(successful.status, 0);
assert.equal(successful.stderr, "");
assert.deepEqual(JSON.parse(successful.stdout), {
  data: { data: [{ id: "one" }], pagination: { nextCursor: "next" } },
  ok: true,
  schemaVersion: 2,
});
const unattended = spawnSync(path.join(output, executable("ui-test")), [], {
  encoding: "utf-8",
  timeout: 5000,
});
assert.equal(unattended.status, 1);
assert.match(unattended.stderr, /--organization/u);
const directory = await mkdtemp(path.join(os.tmpdir(), "inth-cli-test-"));
try {
  if (process.platform !== "win32") {
    await mkdir(path.join(directory, "state"), { mode: 0o700 });
  }
  await mkdir(path.join(directory, "project"), { mode: 0o700 });
  const result = spawnSync(
    path.join(output, executable("cli-test")),
    [directory],
    {
      encoding: "utf-8",
      timeout: 10_000,
    }
  );
  assert.equal(result.status, 0, result.stderr);
  console.log(result.stdout.trim());
  for (const [filename, id] of [
    ["state/config.json", "org-two"],
    ["project/.inth/project.json", "org-one"],
  ]) {
    assert.ok(filename && id);
    // eslint-disable-next-line no-await-in-loop -- Check the two configuration outputs in order.
    const info = await stat(path.join(directory, filename));
    if (process.platform !== "win32") {
      assert.equal(info.mode % 0o1000, 0o600);
    }
    assert.deepEqual(
      // eslint-disable-next-line no-await-in-loop -- Check the two configuration outputs in order.
      JSON.parse(await readFile(path.join(directory, filename), "utf-8")),
      { organizationId: id }
    );
  }
  const stateFiles = await readdir(path.join(directory, "state"));
  assert.deepEqual(stateFiles.toSorted(), ["config.json", "credentials.lock"]);
} finally {
  await rm(directory, { force: true, recursive: true });
}

for (const name of ["mcp-test", "keychain-test", "auth-test"]) {
  const result = spawnSync(path.join(output, executable(name)), [], {
    encoding: "utf-8",
    timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stderr);
  console.log(result.stdout.trim());
}
const telemetryDirectory = await mkdtemp(
  path.join(os.tmpdir(), "inth-telemetry-test-")
);
try {
  const result = spawnSync(
    path.join(output, executable("telemetry-test")),
    [telemetryDirectory],
    {
      encoding: "utf-8",
      timeout: 5000,
    }
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  console.log(result.stdout.trim());
} finally {
  await rm(telemetryDirectory, { force: true, recursive: true });
}
let identityRequests = 0;
let telemetryRequests = 0;
let retries = 0;
let redirects = 0;
let hung = 0;
let bearer = 0;
const handlerFailures: string[] = [];
const server = createServer((request, response) => {
  const guard = (work: () => void): void => {
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
  guard(() => {
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
      let body = "";
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () =>
        guard(() => {
          const event = JSON.parse(body);
          assert.equal(event.event, "cli_command_completed");
          assert.equal(event.properties.command, "mcp list");
          assert.equal(event.properties.source, "cli");
          assert.equal(event.properties.$process_person_profile, false);
          response.end("{}");
        })
      );
    } else if (request.url?.startsWith("/mutation/")) {
      assert.equal(request.method, request.url.slice("/mutation/".length));
      assert.equal(request.headers.authorization, "Bearer inth_transport_test");
      let body = "";
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () =>
        guard(() => {
          if (request.method === "PATCH") {
            assert.equal(request.headers["content-type"], "application/json");
            assert.deepEqual(JSON.parse(body), { description: null });
          } else {
            assert.equal(body, "");
          }
          response.writeHead(204);
          response.end();
        })
      );
    } else if (request.url === "/create") {
      assert.equal(request.method, "POST");
      assert.equal(request.headers.authorization, "Bearer inth_transport_test");
      assert.equal(request.headers["content-type"], "application/json");
      let body = "";
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () =>
        guard(() => {
          assert.deepEqual(JSON.parse(body), {
            name: "Acme Team",
            slug: "acme",
          });
          response.writeHead(201);
          response.end("{}");
        })
      );
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
    } else if (request.url === "/hang") {
      response.writeHead(200);
      response.write("{");
      hung += 1;
    } else {
      response.writeHead(404);
      response.end();
    }
  });
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const identityDirectory = await mkdtemp(
  path.join(os.tmpdir(), "inth-identity-cache-")
);
try {
  const { port } = z.object({ port: z.number() }).parse(server.address());
  const child = spawn(
    path.join(output, executable("transport-test")),
    [`http://127.0.0.1:${port}`, identityDirectory],
    { stdio: "inherit", timeout: 8000 }
  );
  const [status] = await once(child, "exit");
  assert.deepEqual(
    handlerFailures,
    [],
    "Native HTTP handler expectations failed."
  );
  assert.equal(status, 0, "Native HTTP checks failed or timed out.");
  assert.equal(retries, 2);
  assert.equal(redirects, 0);
  assert.equal(hung, 3);
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
