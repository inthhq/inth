import { afterEach, expect, it, vi } from "vitest";

import { run } from "../experiments/node/commands.ts";
import { OrganizationContext } from "../experiments/node/state.ts";
import { AgentAuth } from "../src/agent-auth.ts";

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("lists skills without initializing authentication or its environment", async () => {
  vi.stubEnv("INTH_DEV_API_ORIGIN", "invalid-origin");
  vi.stubEnv("INTH_DEV_DASHBOARD_ORIGIN", "invalid-origin");
  const stdout = vi.spyOn(console, "log").mockImplementation(() => {});
  const createAgent = vi.fn<() => Promise<AgentAuth>>();
  const selectedConnection = vi.spyOn(
    OrganizationContext.prototype,
    "selectedConnection"
  );
  await run(
    ["skills", "--list", "--json"],
    new AbortController().signal,
    createAgent
  );
  expect(createAgent).not.toHaveBeenCalled();
  expect(selectedConnection).not.toHaveBeenCalled();
  expect(stdout).toHaveBeenCalledTimes(1);
  expect(JSON.parse(stdout.mock.lastCall?.[0] ?? "")).toMatchObject({
    data: {
      skills: expect.arrayContaining([
        expect.objectContaining({ name: "c15t" }),
      ]),
    },
    ok: true,
  });
});

it.each(["switch", "link"])(
  "initializes agent credentials once while %s paginates organizations",
  async (command) => {
    vi.stubEnv("INTH_TOKEN", "");
    vi.stubEnv("INTH_DEV_API_ORIGIN", "");
    vi.stubEnv("INTH_DEV_DASHBOARD_ORIGIN", "");
    const select = vi
      .spyOn(OrganizationContext.prototype, "select")
      .mockResolvedValue();
    const link = vi
      .spyOn(OrganizationContext.prototype, "link")
      .mockResolvedValue();
    const stdout = vi.spyOn(console, "log").mockImplementation(() => {});
    const createAgent = vi.fn(() =>
      Promise.resolve(
        new AgentAuth(
          {
            clock: { now: Date.now, sleep: vi.fn() },
            error: vi.fn(),
            form: vi.fn(),
            get: vi.fn(),
            post: vi.fn(),
            request: vi.fn(),
          },
          {
            clear: vi.fn(),
            exclusive: (work) => work(),
            read: () =>
              Promise.resolve(
                JSON.stringify({
                  credentials: {
                    accessToken: "agent-access",
                    assertion: "agent-assertion",
                    assertionExpiresAt: Date.now() + 3_600_000,
                    expiresAt: Date.now() + 900_000,
                    scopes: ["organizations.read"],
                  },
                })
              ),
            write: vi.fn(),
          }
        )
      )
    );
    const fetcher = vi.fn();
    for (const id of ["org-one", "org-two"]) {
      fetcher.mockResolvedValueOnce(
        Response.json({
          data: [{ id, name: id, role: "owner", slug: id }],
          pagination: {
            hasMore: id === "org-one",
            nextCursor: id === "org-one" ? "next-page" : null,
          },
          success: true,
        })
      );
    }
    vi.stubGlobal("fetch", fetcher);
    await run(
      [command, "org-two", "--auth", "agent", "--json"],
      new AbortController().signal,
      createAgent
    );
    expect(createAgent).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenLastCalledWith(
      "https://api.inth.com/v1/organizations?limit=100&cursor=next-page",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer agent-access",
        }),
      })
    );
    expect(
      command === "switch" ? select : link
    ).toHaveBeenCalledExactlyOnceWith("org-two");
    expect(JSON.parse(stdout.mock.lastCall?.[0] ?? "")).toMatchObject({
      data: { organizationId: "org-two" },
      ok: true,
    });
  }
);
