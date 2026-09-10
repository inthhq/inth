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
    const accessToken = vi
      .spyOn(AgentAuth.prototype, "accessToken")
      .mockResolvedValue("agent-access");
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
      new AbortController().signal
    );
    expect(accessToken).toHaveBeenCalledTimes(2);
    expect(accessToken.mock.contexts[0]).toBe(accessToken.mock.contexts[1]);
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
