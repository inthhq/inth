import { afterEach, describe, expect, it, vi } from "vitest";

import { run } from "../experiments/node/commands.ts";
import { formatResource } from "../experiments/node/resource-output.ts";
import { OrganizationContext } from "../experiments/node/state.ts";
import { requireAccessPerson } from "../src/agent-access-commands.ts";
import { AgentAuth } from "../src/agent-auth.ts";
import { parseArguments } from "../src/arguments.ts";
import { formatHelp } from "../src/help.ts";
import { formatNativeResource } from "../src/native/native-resource-output.ts";
import { buildResourceRequest } from "../src/resource-commands.ts";
import { v2ReadCases } from "./fixtures/agent-access-v2-reads.ts";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("named discovery commands", () => {
  it.each(v2ReadCases)(
    "shows $args help without an ID or sign-in",
    async (example) => {
      const access = vi.spyOn(AgentAuth.prototype, "accessToken");
      const fetcher = vi.fn();
      vi.stubGlobal("fetch", fetcher);
      const stdout = vi.spyOn(console, "log").mockImplementation(() => {});
      await run(
        [example.args[0] ?? "", example.args[1] ?? "", "--help", "--json"],
        new AbortController().signal
      );
      const response = JSON.parse(stdout.mock.lastCall?.[0] ?? "");
      expect(response).toMatchObject({ ok: true, schemaVersion: 2 });
      expect(response.data.commandDefinitions).toHaveLength(1);
      for (const command of response.data.commandDefinitions[0].examples) {
        expect(() => parseArguments(command.split(" ").slice(1))).not.toThrow();
      }
      expect(access).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
    }
  );

  it.each(v2ReadCases)(
    "reads $args and retains the complete JSON response",
    async (example) => {
      vi.stubEnv("INTH_TOKEN", "");
      vi.spyOn(AgentAuth.prototype, "accessToken").mockResolvedValue(
        "person-token"
      );
      vi.spyOn(OrganizationContext.prototype, "resolve").mockResolvedValue(
        "org_123"
      );
      const fetcher = vi.fn().mockResolvedValue(new Response(example.body));
      vi.stubGlobal("fetch", fetcher);
      const stdout = vi.spyOn(console, "log").mockImplementation(() => {});
      const options = parseArguments(example.args);
      const request = buildResourceRequest(options);
      expect(request).toMatchObject({ method: "GET", path: example.path });
      expect(request.body).toBeUndefined();
      await run(
        [...example.args, "--auth", "agent", "--json"],
        new AbortController().signal
      );
      const url = new URL(`https://api.inth.com${example.path}`);
      if (request.scoped) {
        url.searchParams.set("organizationId", "org_123");
      }
      expect(fetcher).toHaveBeenCalledExactlyOnceWith(
        url.href,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer person-token",
          }),
          method: "GET",
        })
      );
      expect(JSON.parse(stdout.mock.lastCall?.[0] ?? "")).toEqual({
        data: JSON.parse(example.body),
        ok: true,
        schemaVersion: 2,
      });
    }
  );

  it.each(v2ReadCases)(
    "shows useful values from $args in both formatters",
    (example) => {
      const options = parseArguments(example.args);
      const display = { color: false, columns: 120 };
      const node = formatResource(options, example.body, display);
      const native = formatNativeResource(
        options,
        { body: example.body, ok: true, requestId: null, status: 200 },
        display
      );
      expect(node).toBe(native);
      for (const value of example.expected) {
        expect(node).toContain(value);
      }
      expect(node).toContain("--detail all");
      expect(
        formatResource(
          parseArguments([...example.args, "--detail", "all"]),
          example.body,
          display
        )
      ).toBe(JSON.stringify(JSON.parse(example.body), null, 2));
    }
  );

  it("keeps the ledger's frozen continuation window on subsequent reads", () => {
    const request = buildResourceRequest(
      parseArguments(["billing", "ledger", "--cursor", "returned+/="])
    );
    const query = new URL(`https://api.inth.com${request.path}`).searchParams;
    expect(query.get("cursor")).toBe("returned+/=");
    expect(query.has("since")).toBe(false);
    expect(query.has("until")).toBe(false);
    expect(query.has("product")).toBe(false);
  });

  it("accepts billing keys for the ledger without browser or agent sign-in", async () => {
    vi.stubEnv("INTH_TOKEN", "inth_fixture");
    const access = vi.spyOn(AgentAuth.prototype, "accessToken");
    vi.spyOn(OrganizationContext.prototype, "resolve").mockResolvedValue(
      "org_123"
    );
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        data: {
          coverage: "retained-settled-consumption",
          items: [],
          nextCursor: null,
          window: { since: null, until: "2026-10-29T00:00:00Z" },
        },
        success: true,
      })
    );
    vi.stubGlobal("fetch", fetcher);
    const stdout = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(["billing", "ledger", "--json"], new AbortController().signal);
    expect(access).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      "https://api.inth.com/v1/billing/credit-ledger?limit=20&organizationId=org_123",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer inth_fixture",
        }),
      })
    );
    expect(JSON.parse(stdout.mock.lastCall?.[0] ?? "")).toMatchObject({
      ok: true,
      schemaVersion: 2,
    });
  });

  it.each(
    v2ReadCases.filter(
      (example) => !["billing", "code-audit"].includes(example.args[0] ?? "")
    )
  )("refuses organization keys before HTTP for $args", async (example) => {
    vi.stubEnv("INTH_TOKEN", "inth_fixture");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(
      run([...example.args, "--json"], new AbortController().signal)
    ).rejects.toMatchObject({ code: "usage_error" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("leaves quote credential capabilities to the server", () => {
    expect(() =>
      requireAccessPerson(
        parseArguments(["code-audit", "quote", "scan_123"]),
        "inth_fixture"
      )
    ).not.toThrow();
    expect(formatHelp("code-audit", "quote")).toContain("code-audit.read");
  });

  it.each([
    ["account", "sessions", "--limit", "101"],
    ["integration", "status", "--cursor", "next"],
    ["integration", "github-repository-get", "repo_123", "--limit", "20"],
    ["integration", "github-repositories", "--project", "prj_123"],
    ["org", "settings-get", "org_123", "--organization", "org_123"],
    ["code-audit", "quote", "scan_123", "--data", "{}"],
    ["billing", "ledger", "--since", "2026-02-30T00:00:00Z"],
  ])("rejects %j before credentials or HTTP", async (...args) => {
    vi.stubEnv("INTH_TOKEN", "");
    const access = vi.spyOn(AgentAuth.prototype, "accessToken");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(
      run([...args, "--auth", "agent", "--json"], new AbortController().signal)
    ).rejects.toMatchObject({ code: "usage_error" });
    expect(access).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
