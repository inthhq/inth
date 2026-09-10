import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import { agentEnvironment } from "../../src/agent-environment.ts";

const api = process.env.INTH_DEV_API_ORIGIN;
const dashboard = process.env.INTH_DEV_DASHBOARD_ORIGIN;
const logPath = process.env.INTH_E2E_API_LOG;
if (!api || !dashboard || !logPath) {
  throw new Error(
    "Set INTH_DEV_API_ORIGIN, INTH_DEV_DASHBOARD_ORIGIN and INTH_E2E_API_LOG to the running local API. See docs/agent-auth-integration.md."
  );
}
agentEnvironment(api, dashboard, "agent");
const binary = fileURLToPath(
  new URL(
    `../../build/native/agent-e2e${process.platform === "win32" ? ".exe" : ""}`,
    import.meta.url
  )
);
const otpLog = logPath;
const origin = dashboard;

const launch = (directory: string, account: string, args: string[]) => {
  const child = spawn(binary, [directory, account, ...args, "--json"], {
    env: { ...process.env, INTH_TELEMETRY_DISABLED: "1", INTH_TOKEN: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  let finished = false;
  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  // eslint-disable-next-line promise/avoid-new -- Adapt child-process completion and spawn errors.
  const result = new Promise<{
    code: number | null;
    stdout: string;
    stderr: string;
  }>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      finished = true;
      resolve({ code, stderr, stdout });
    });
  });
  return { child, finished: () => finished, output: () => stdout, result };
};

for (const accountState of [
  "New account",
  "Returning account requiring legal acceptance",
  "Returning account with current legal acceptance",
]) {
  test(`${accountState}: browser approval resumes native CLI setup`, async ({
    page,
    context,
  }) => {
    const account = randomUUID();
    const email = `cli-e2e-${account}@inth.com`;
    const directory = await mkdtemp(path.join(tmpdir(), "inth-agent-e2e-"));
    const processes: ReturnType<typeof launch>[] = [];
    const run = (args: string[]) => {
      const process = launch(directory, account, args);
      processes.push(process);
      return process;
    };
    const command = async (args: string[]) => {
      const result = await run(args).result;
      expect(result.code, result.stderr || result.stdout).toBe(0);
      expect(result.stdout.trim().split("\n")).toHaveLength(1);
      return JSON.parse(result.stdout);
    };
    const otp = async (offset: number) => {
      let code = "";
      await expect
        .poll(async () => {
          const log = await readFile(otpLog, "utf-8");
          code =
            [
              ...log
                .slice(offset)
                .matchAll(/\[local auth\] OTP: (?<code>\d{6})/gu),
            ].at(-1)?.[1] ?? "";
          return code;
        })
        .toMatch(/^\d{6}$/u);
      return code;
    };
    try {
      const needsLegalAcceptance =
        accountState === "Returning account requiring legal acceptance";
      if (accountState !== "New account") {
        // Seed returning accounts independently of the browser sign-up flow.
        const beforeSeed = await readFile(otpLog, "utf-8");
        const sent = await context.request.post(
          `${origin}/api/auth/email-otp/send-verification-otp`,
          { data: { email, type: "sign-in" }, headers: { origin } }
        );
        expect(sent.ok()).toBe(true);
        const signedIn = await context.request.post(
          `${origin}/api/auth/sign-in/email-otp`,
          {
            data: { email, otp: await otp(beforeSeed.length) },
            headers: { origin },
          }
        );
        expect(signedIn.ok()).toBe(true);
        const acceptance = await context.request.get(
          `${origin}/api/legal/acceptance`
        );
        const acceptanceBody = await acceptance.json();
        expect(acceptanceBody.accepted).toBe(false);
        expect(acceptanceBody.enforced).toBe(true);
        if (!needsLegalAcceptance) {
          const accepted = await context.request.post(
            `${origin}/api/legal/acceptance`,
            { data: { acceptedVia: "manual" }, headers: { origin } }
          );
          expect(accepted.ok()).toBe(true);
          const acceptedBody = await accepted.json();
          expect(acceptedBody.accepted).toBe(true);
        }
        await context.clearCookies();
        // The dashboard treats accounts created within ten seconds as new.
        const created = Date.now();
        await expect
          .poll(() => Date.now() - created, { timeout: 15_000 })
          .toBeGreaterThan(10_000);
      }
      const started = await command(["login", "--email", email]);
      expect(started.data.status).toBe("pending");
      expect(started.data.nextStep.command).toBe(
        "inth login --complete --wait --json"
      );
      const waiter = run(["login", "--complete", "--wait", "--timeout", "90"]);
      const legalScreens = new Set<string>();
      let approvalRequests = 0;
      page.on("framenavigated", (frame) => {
        if (
          frame === page.mainFrame() &&
          new URL(frame.url()).pathname === "/dashboard/legal"
        ) {
          legalScreens.add(frame.url());
        }
      });
      page.on("request", (request) => {
        if (request.url().endsWith("/agent/identity/claim/complete")) {
          approvalRequests += 1;
        }
      });
      await page.goto(started.data.verificationUri);
      await expect(
        page.getByLabel("Email address", { exact: false })
      ).toHaveValue(email);
      const beforeOtp = await readFile(otpLog, "utf-8");
      const offset = beforeOtp.length;
      await page
        .getByRole("button", { exact: true, name: "Continue with email" })
        .click();
      await expect(
        page.getByText("Enter verification code", { exact: true })
      ).toBeVisible();
      const code = await otp(offset);
      // A wrong email OTP must keep the person on sign-in and the CLI pending.
      const invalidCode = String((Number(code) + 1) % 1_000_000).padStart(
        6,
        "0"
      );
      await page.locator('input[inputmode="numeric"]').fill(invalidCode);
      const rejected = page.waitForResponse((response) =>
        response.url().includes("/sign-in/email-otp")
      );
      await page.getByRole("button", { exact: true, name: "Verify" }).click();
      const rejectedResponse = await rejected;
      expect(rejectedResponse.ok()).toBe(false);
      expect(waiter.finished()).toBe(false);
      await page.locator('input[inputmode="numeric"]').fill(code);
      await page.getByRole("button", { exact: true, name: "Verify" }).click();
      if (needsLegalAcceptance) {
        await expect(
          page.getByRole("heading", {
            exact: true,
            name: "Review legal documents",
          })
        ).toBeVisible({ timeout: 30_000 });
        expect(new URL(page.url()).pathname).toBe("/dashboard/legal");
        const pendingAcceptance = await context.request.get(
          `${origin}/api/legal/acceptance`
        );
        const pendingAcceptanceBody = await pendingAcceptance.json();
        expect(pendingAcceptanceBody.accepted).toBe(false);
        expect(approvalRequests).toBe(0);
        expect(waiter.finished()).toBe(false);
        expect(waiter.output()).toBe("");
        await expect(
          page.getByRole("button", { exact: true, name: "Authorize agent" })
        ).toHaveCount(0);
        await page
          .getByRole("button", { exact: true, name: "I accept and continue" })
          .click();
      }
      await expect(
        page.getByRole("heading", { exact: true, name: "Authorize this agent" })
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        page.getByText(started.data.userCode, { exact: true })
      ).toBeVisible();
      await expect(page.locator('input[inputmode="numeric"]')).toHaveCount(0);
      expect(legalScreens.size).toBe(needsLegalAcceptance ? 1 : 0);
      expect(approvalRequests).toBe(0);
      expect(waiter.finished()).toBe(false);
      expect(waiter.output()).toBe("");
      const acceptance = await context.request.get(
        `${origin}/api/legal/acceptance`
      );
      const acceptanceBody = await acceptance.json();
      expect(acceptanceBody.accepted).toBe(true);

      // Interrupting the terminal must preserve the link and allow a new process to wait.
      waiter.child.kill("SIGINT");
      const interrupted = await waiter.result;
      expect(interrupted.code).not.toBe(0);
      expect(JSON.parse(interrupted.stdout).error.code).toBe("cancelled");
      const resumed = run(["login", "--complete", "--wait", "--timeout", "60"]);
      await page
        .getByRole("button", { exact: true, name: "Authorize agent" })
        .click();
      const completed = await resumed.result;
      expect(completed.code, completed.stderr || completed.stdout).toBe(0);
      expect(completed.stdout.trim().split("\n")).toHaveLength(1);
      expect(JSON.parse(completed.stdout).data.status).toBe("authenticated");
      expect(approvalRequests).toBe(1);
      const status = await command(["auth", "status"]);
      expect(status.data.nextStep.command).toBe("inth whoami --json");
      expect(status.data.nextStep.instruction).toBe(
        "Signed in. This connection is selected for subsequent CLI commands."
      );
      const identity = await command(["whoami"]);
      const sessionResponse = await context.request.get(
        `${origin}/api/auth/get-session`
      );
      const session = await sessionResponse.json();
      expect(session.user.email).toBe(email);
      expect(identity.data.data.principal.userId).toBe(session.user.id);
      expect(
        JSON.parse(
          await readFile(path.join(directory, "connection.json"), "utf-8")
        )
      ).toEqual({ auth: "agent" });
      await command(["logout"]);
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
      await launch(directory, account, ["logout", "--auth", "agent"]).result;
      await rm(directory, { force: true, recursive: true });
    }
  });
}
