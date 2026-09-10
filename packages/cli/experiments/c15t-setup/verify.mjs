import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { parseArgs } from "node:util";

import { chromium, expect } from "@playwright/test";
import { build } from "esbuild";

const { values } = parseArgs({
  options: {
    browser: { default: "chrome", type: "string" },
    cli: { default: "inth", type: "string" },
    project: { type: "string" },
  },
});
assert.ok(
  values.project,
  "Provide --project <id> for a disposable hosted project."
);
assert.ok(
  ["chrome", "chromium"].includes(values.browser),
  "Use --browser chrome or chromium."
);

// Use the CLI's credential handling. Never extract tokens or forward them to the browser.
const result = spawnSync(
  values.cli,
  ["project", "get", values.project, "--json"],
  {
    encoding: "utf-8",
    timeout: 60_000,
  }
);
assert.ifError(result.error);
assert.equal(
  result.status,
  0,
  `CLI project lookup failed: ${result.stdout || result.stderr}`
);
const envelope = JSON.parse(result.stdout);
assert.equal(envelope.ok, true);
assert.equal(envelope.data.success, true);
const project = envelope.data.data;
assert.equal(project.id, values.project);
assert.ok(
  project.consent?.backendUrl,
  "The project has no hosted consent backend URL."
);
assert.ok(
  project.consent.trustedOrigins.includes("localhost:4173"),
  "Add localhost:4173 to the disposable project's trusted origins."
);
const backend = new URL(project.consent.backendUrl);
assert.equal(backend.protocol, "https:");
assert.equal(backend.username + backend.password, "");

const bundle = await build({
  absWorkingDir: import.meta.dirname,
  bundle: true,
  define: {
    "process.env.C15T_BACKEND_URL": JSON.stringify(backend.href),
    "process.env.NODE_ENV": '"production"',
  },
  entryPoints: ["app.jsx"],
  jsx: "automatic",
  outfile: "app.js",
  write: false,
});
const assets = new Map(
  bundle.outputFiles.map((file) => [
    file.path.endsWith(".css") ? "/app.css" : "/app.js",
    file.contents,
  ])
);
const html =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>c15t setup check</title><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>';
const server = createServer((request, response) => {
  const { pathname } = new URL(request.url, "http://localhost:4173");
  response.setHeader("Cache-Control", "no-store");
  if (pathname === "/") {
    response.setHeader("Content-Type", "text/html");
    response.end(html);
  } else if (pathname === "/measurement.js") {
    response.setHeader("Content-Type", "application/javascript");
    response.end("window.measurementLoaded = true;");
  } else if (assets.has(pathname)) {
    response.setHeader(
      "Content-Type",
      pathname.endsWith(".css") ? "text/css" : "application/javascript"
    );
    response.end(assets.get(pathname));
  } else {
    response.writeHead(404).end();
  }
});

let browser;
try {
  server.listen(4173, "127.0.0.1");
  await once(server, "listening");
  browser = await chromium.launch(
    values.browser === "chrome" ? { channel: "chrome" } : {}
  );
  const page = await browser.newPage();
  page.setDefaultTimeout(15_000);
  const backendResponses = [];
  const failures = [];
  let measurementRequests = 0;
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("request", (request) => {
    if (request.url() === "http://localhost:4173/measurement.js") {
      measurementRequests += 1;
    }
  });
  page.on("requestfailed", (request) => {
    if (new URL(request.url()).origin === backend.origin) {
      failures.push("Hosted backend request failed.");
    }
  });
  page.on("response", (response) => {
    if (new URL(response.url()).origin === backend.origin) {
      backendResponses.push({
        path: new URL(response.url()).pathname,
        status: response.status(),
      });
    }
  });
  const save = () =>
    page.waitForResponse(
      (response) =>
        new URL(response.url()).origin === backend.origin &&
        new URL(response.url()).pathname.endsWith("/subjects") &&
        response.request().method() === "POST"
    );
  const accept = page.getByRole("button", { exact: true, name: "Accept All" });
  const reject = page.getByRole("button", { exact: true, name: "Reject All" });
  const preferences = page.getByRole("button", {
    exact: true,
    name: "Privacy settings",
  });
  const state = page.locator("#consents");
  const settled = async () => {
    await page.waitForLoadState("networkidle");
    await expect(state).toBeVisible();
  };

  await page.goto("http://localhost:4173");
  await expect(accept).toBeVisible();
  await settled();
  assert.equal(measurementRequests, 0, "Measurement loaded before consent.");

  const rejected = save();
  await reject.click();
  const rejectionResponse = await rejected;
  assert.equal(
    rejectionResponse.status(),
    200,
    "Reject did not reach the hosted backend."
  );
  await expect(accept).toBeHidden();
  await page.reload();
  await settled();
  await expect(state).toContainText('"measurement":false');
  await expect(accept).toBeHidden();
  assert.equal(measurementRequests, 0, "Measurement loaded after rejecting.");

  await preferences.click();
  await expect(accept).toBeVisible();
  const accepted = save();
  await accept.click();
  const acceptanceResponse = await accepted;
  assert.equal(
    acceptanceResponse.status(),
    200,
    "Accept did not reach the hosted backend."
  );
  await expect.poll(() => measurementRequests).toBe(1);
  await expect(state).toContainText('"measurement":true');
  await page.reload();
  await settled();
  await expect.poll(() => measurementRequests).toBe(2);
  await expect(accept).toBeHidden();

  await preferences.click();
  const revoked = save();
  await reject.click();
  const revocationResponse = await revoked;
  assert.equal(
    revocationResponse.status(),
    200,
    "Revocation did not reach the hosted backend."
  );
  await expect(state).toContainText('"measurement":false');
  await page.reload();
  await settled();
  assert.equal(
    measurementRequests,
    2,
    "Measurement loaded again after revocation."
  );
  await expect(state).toContainText('"measurement":false');
  assert.deepEqual(failures, []);
  assert.ok(
    backendResponses.some((response) => response.path.endsWith("/init"))
  );
  assert.ok(
    backendResponses.every(
      (response) => response.status >= 200 && response.status < 300
    )
  );
  console.log(
    JSON.stringify(
      {
        backendResponses,
        checks: [
          "hosted initialization",
          "blocked before consent",
          "reject persisted",
          "preferences reopened",
          "accept loads script",
          "accept persisted",
          "revocation blocks subsequent load",
        ],
        ok: true,
        projectId: project.id,
      },
      null,
      2
    )
  );
} finally {
  try {
    await browser?.close();
  } finally {
    server.closeAllConnections();
    await server[Symbol.asyncDispose]();
  }
}
