import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { OrganizationContext } from "../experiments/node/state.ts";
import { AgentAuth } from "../src/agent-auth.ts";
import { runAgentCommand } from "../src/agent-commands.ts";
import { productionAgentEnvironment } from "../src/agent-environment.ts";
import type { AgentHttp, AgentState, AgentStore } from "../src/agent-types.ts";
import { parseArguments } from "../src/arguments.ts";
import { selectCommandConnection } from "../src/connection-selection.ts";

describe("agent status guidance", () => {
  it.each(["agent", "browser", "missing", "corrupt"])(
    "reports the saved %s selection without changing it",
    async (selection) => {
      const directory = await mkdtemp(path.join(tmpdir(), "inth-status-"));
      const output = vi.spyOn(console, "log").mockImplementation(() => {});
      try {
        const context = new OrganizationContext(directory, directory);
        if (selection === "corrupt") {
          await writeFile(path.join(directory, "connection.json"), "broken");
        } else if (selection !== "missing") {
          await context.selectConnection(selection);
        }
        const options = parseArguments([
          "auth",
          "status",
          ...(selection === "agent" ? [] : ["--auth", "agent"]),
          "--json",
        ]);
        await selectCommandConnection(
          options,
          undefined,
          () => context.selectedConnection(),
          productionAgentEnvironment
        );
        const request = vi.fn<AgentHttp["request"]>();
        const store: AgentStore = {
          clear: vi.fn(),
          exclusive: (work) => work(),
          read: () =>
            Promise.resolve(
              JSON.stringify({
                credentials: {
                  accessToken: "test-access-token",
                  assertion: "test-assertion",
                  assertionExpiresAt: Date.now() + 3_600_000,
                  expiresAt: Date.now() + 900_000,
                  scopes: ["organizations.read"],
                },
              })
            ),
          write: vi.fn(),
        };
        const auth = new AgentAuth(
          {
            clock: { now: Date.now, sleep: vi.fn() },
            error: vi.fn(),
            form: vi.fn(),
            get: vi.fn(),
            post: vi.fn(),
            request,
          },
          store
        );
        const select = vi.fn<() => Promise<void>>();
        expect(
          await runAgentCommand(
            options,
            () => Promise.resolve(auth),
            select,
            () => context.selectedConnection()
          )
        ).toBe(true);
        expect(output).toHaveBeenCalledTimes(1);
        const result = JSON.parse(String(output.mock.calls[0]?.[0]));
        expect(result).toMatchObject({
          data: {
            credentialPresent: true,
            nextStep: {
              command:
                selection === "agent"
                  ? "inth whoami --json"
                  : "inth whoami --auth agent --json",
            },
            status: "authenticated",
            validated: false,
          },
          ok: true,
        });
        expect(result.data.nextStep.instruction).toContain(
          selection === "agent"
            ? "This connection is selected"
            : "Complete sign-in to select this connection"
        );
        expect(select).not.toHaveBeenCalled();
        expect(request).not.toHaveBeenCalled();
        expect(store.write).not.toHaveBeenCalled();
        if (selection === "corrupt") {
          await expect(context.selectedConnection()).rejects.toMatchObject({
            code: "invalid_config",
          });
        } else {
          expect(await context.selectedConnection()).toBe(
            selection === "missing" ? undefined : selection
          );
        }
      } finally {
        output.mockRestore();
        await rm(directory, { force: true, recursive: true });
      }
    }
  );
});

const now = 1_800_000_000_000;
const credentials = {
  accessToken: "saved-access",
  assertion: "saved-assertion",
  assertionExpiresAt: now + 3_600_000,
  expiresAt: now + 900_000,
  scopes: ["organizations.read"],
};
const pending = {
  claimExpiresAt: now + 86_400_000,
  claimToken: "saved-claim",
  email: "person@example.com",
  exchanging: false,
  expiresAt: now + 600_000,
  interval: 5,
  nextPollAt: now + 5000,
  registrationId: "reg_1",
  scopes: ["organizations.read"],
  userCode: "123456",
  verificationUri:
    "https://inth.com/dashboard/agent-auth/claim?claim_attempt_token=cla_test",
};
const states: {
  name: string;
  state: AgentState | null;
  credentialPresent: boolean;
  expiresAt: number | null;
  status: string;
}[] = [
  {
    credentialPresent: true,
    expiresAt: credentials.expiresAt,
    name: "saved credentials",
    state: { credentials },
    status: "authenticated",
  },
  {
    credentialPresent: true,
    expiresAt: now - 1000,
    name: "expired access token with renewable assertion",
    state: { credentials: { ...credentials, expiresAt: now - 1000 } },
    status: "authenticated",
  },
  {
    credentialPresent: true,
    expiresAt: now - 1000,
    name: "fully expired credentials",
    state: {
      credentials: {
        ...credentials,
        assertionExpiresAt: now - 1000,
        expiresAt: now - 1000,
      },
    },
    status: "authenticated",
  },
  {
    credentialPresent: false,
    expiresAt: pending.expiresAt,
    name: "pending approval",
    state: { pending },
    status: "pending",
  },
  {
    credentialPresent: false,
    expiresAt: now - 1000,
    name: "expired approval link",
    state: { pending: { ...pending, expiresAt: now - 1000 } },
    status: "pending",
  },
  {
    credentialPresent: false,
    expiresAt: pending.expiresAt,
    name: "uncertain exchange",
    state: { pending: { ...pending, exchanging: true } },
    status: "uncertain",
  },
  {
    credentialPresent: false,
    expiresAt: null,
    name: "signed out",
    state: null,
    status: "signed_out",
  },
];

it.each(states)("reports local credential presence for $name", async (test) => {
  const output = vi.spyOn(console, "log").mockImplementation(() => {});
  const request = vi.fn<AgentHttp["request"]>();
  const store: AgentStore = {
    clear: vi.fn(),
    exclusive: (work) => work(),
    read: () =>
      Promise.resolve(test.state === null ? null : JSON.stringify(test.state)),
    write: vi.fn(),
  };
  const auth = new AgentAuth(
    {
      clock: { now: () => now, sleep: vi.fn() },
      error: vi.fn(),
      form: vi.fn(),
      get: vi.fn(),
      post: vi.fn(),
      request,
    },
    store
  );
  try {
    await runAgentCommand(
      parseArguments(["auth", "status", "--auth", "agent", "--json"]),
      () => Promise.resolve(auth),
      vi.fn(),
      () => Promise.resolve("agent")
    );
    expect(output).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(output.mock.lastCall?.[0]))).toMatchObject({
      data: {
        credentialPresent: test.credentialPresent,
        credentialSource: "auth.md",
        expiresAt: test.expiresAt,
        status: test.status,
        validated: false,
      },
      ok: true,
    });
    expect(request).not.toHaveBeenCalled();
    expect(store.write).not.toHaveBeenCalled();
  } finally {
    output.mockRestore();
  }
});
