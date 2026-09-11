import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { agentEnvironment } from "../../../src/agent-environment.ts";
import { launch } from "../cli.ts";
import type { CliProcess } from "../cli.ts";
import { startMockAuthServer } from "./server.ts";
import type { MockAuthServer } from "./server.ts";

let server: MockAuthServer;
test.beforeAll(async () => {
  server = await startMockAuthServer();
  // The CLI rejects origins that are not local HTTPS addresses.
  agentEnvironment(server.apiOrigin, server.dashboardOrigin, "agent");
});
test.afterAll(async () => {
  await server?.close();
});

test("browser approval resumes native CLI setup against the mock API", async ({
  page,
}) => {
  const account = randomUUID();
  const email = `cli-e2e-${account}@example.com`;
  const directory = await mkdtemp(path.join(tmpdir(), "inth-agent-e2e-"));
  const environment = {
    INTH_DEV_API_ORIGIN: server.apiOrigin,
    INTH_DEV_DASHBOARD_ORIGIN: server.dashboardOrigin,
    NODE_EXTRA_CA_CERTS: server.caPath,
  };
  const processes: CliProcess[] = [];
  const run = (args: string[]) => {
    const process = launch(directory, account, args, environment);
    processes.push(process);
    return process;
  };
  const command = async (args: string[]) => {
    const result = await run(args).result;
    expect(result.code, result.stderr || result.stdout).toBe(0);
    expect(result.stdout.trim().split("\n")).toHaveLength(1);
    return JSON.parse(result.stdout);
  };
  try {
    const started = await command(["login", "--email", email]);
    expect(started.data.status).toBe("pending");
    expect(started.data.userCode).toMatch(/^\d{6}$/u);
    expect(
      started.data.verificationUri.startsWith(server.dashboardOrigin)
    ).toBe(true);
    expect(started.data.nextStep.command).toBe(
      "inth login --complete --wait --json"
    );
    // A replacement code must come from the claim endpoint and keep the claim pending.
    const retried = await command(["auth", "retry"]);
    expect(retried.data.status).toBe("pending");
    expect(retried.data.userCode).toMatch(/^\d{6}$/u);
    expect(retried.data.userCode).not.toBe(started.data.userCode);
    const waiter = run(["login", "--complete", "--wait", "--timeout", "90"]);
    let approvalRequests = 0;
    page.on("request", (request) => {
      if (request.url().endsWith("/agent/identity/claim/complete")) {
        approvalRequests += 1;
      }
    });
    await page.goto(retried.data.verificationUri);
    await expect(
      page.getByRole("heading", { exact: true, name: "Authorize this agent" })
    ).toBeVisible();
    await expect(
      page.getByText(retried.data.userCode, { exact: true })
    ).toBeVisible();
    await expect(page.getByText(email, { exact: false })).toBeVisible();
    await expect(page.locator('input[inputmode="numeric"]')).toHaveCount(0);
    // Wait for a pending poll so the interrupt lands between polls rather than mid-exchange.
    await expect
      .poll(() => server.counters.pendingExchanges)
      .toBeGreaterThan(0);
    expect(server.counters.exchanges).toBe(0);
    expect(approvalRequests).toBe(0);
    expect(waiter.finished()).toBe(false);
    expect(waiter.output()).toBe("");

    // Interrupting the terminal must preserve the link and allow a new process to wait.
    waiter.child.kill("SIGINT");
    const interrupted = await waiter.result;
    expect(interrupted.code).not.toBe(0);
    expect(JSON.parse(interrupted.stdout).error.code).toBe("cancelled");
    const resumed = run(["login", "--complete", "--wait", "--timeout", "60"]);
    await page
      .getByRole("button", { exact: true, name: "Authorize agent" })
      .click();
    await expect(
      page.getByRole("heading", { exact: true, name: "Agent authorized" })
    ).toBeVisible();
    const completed = await resumed.result;
    expect(completed.code, completed.stderr || completed.stdout).toBe(0);
    expect(completed.stdout.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(completed.stdout).data.status).toBe("authenticated");
    expect(approvalRequests).toBe(1);
    expect(server.counters.approvals).toBe(1);
    expect(server.counters.exchanges).toBe(1);
    const status = await command(["auth", "status"]);
    expect(status.data.status).toBe("authenticated");
    expect(status.data.nextStep.command).toBe("inth whoami --json");
    expect(status.data.nextStep.instruction).toBe(
      "Signed in. This connection is selected for subsequent CLI commands."
    );
    // Explicit renewal exchanges the identity assertion for a new access token.
    const refreshed = await command(["auth", "refresh"]);
    expect(refreshed.data.status).toBe("authenticated");
    expect(server.counters.renewals).toBe(1);
    const identity = await command(["whoami"]);
    expect(identity.data.data.principal.userId).toBe(server.userId);
    expect(identity.data.data.scopes).toEqual(["organizations.read"]);
    expect(server.counters.identityRequests).toBe(1);
    expect(
      JSON.parse(
        await readFile(path.join(directory, "connection.json"), "utf-8")
      )
    ).toEqual({ auth: "agent" });
    const loggedOut = await command(["logout"]);
    expect(loggedOut.data.signedOut).toBe(true);
    // The assertion and the access token are revoked separately.
    expect(server.counters.revocations).toBe(2);
    const signedOut = await run(["whoami"]).result;
    expect(signedOut.code).not.toBe(0);
    expect(JSON.parse(signedOut.stdout).error.code).toBe(
      "authentication_required"
    );
  } finally {
    for (const process of processes) {
      if (!process.finished()) {
        process.child.kill("SIGTERM");
      }
    }
    await Promise.allSettled(processes.map((process) => process.result));
    await launch(directory, account, ["logout", "--auth", "agent"], environment)
      .result;
    await rm(directory, { force: true, recursive: true });
  }
});
