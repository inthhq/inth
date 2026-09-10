import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { OrganizationContext } from "../experiments/node/state.ts";
import { AgentAuth } from "../src/agent-auth.ts";
import { runSelectedAgentCommand } from "../src/agent-commands.ts";
import { productionAgentEnvironment } from "../src/agent-environment.ts";
import type { AgentHttp, AgentStore } from "../src/agent-types.ts";
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
          await runSelectedAgentCommand(
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
