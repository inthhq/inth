// Exercises the Node reference implementation in experiments/node, not the shipped Scriptc adapters.

import { afterEach, describe, expect, it, vi } from "vitest";

import { run } from "../experiments/node/commands.ts";
import { OrganizationContext } from "../experiments/node/state.ts";
import { parseArguments } from "../src/arguments.ts";
import {
  buildResourceRequest,
  rawApiRequest,
} from "../src/resource-commands.ts";
import { requestCases, invalidRequests } from "./fixtures/resource-requests.ts";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("public resource commands", () => {
  it.each(requestCases)("routes $args to $method $path", async (example) => {
    const options = parseArguments(example.args);
    expect(buildResourceRequest(options)).toEqual({
      body: example.body,
      method: example.method,
      path: example.path,
      scoped: example.scoped,
    });
    vi.stubEnv("INTH_TOKEN", "inth_fixture");
    const resolve = vi
      .spyOn(OrganizationContext.prototype, "resolve")
      .mockResolvedValue("org_default");
    const payload = {
      data: { id: "resource_123" },
      pagination: { hasMore: true, nextCursor: "next+/=" },
      success: true,
    };
    const fetcher = vi.fn().mockResolvedValue(Response.json(payload));
    vi.stubGlobal("fetch", fetcher);
    const stdout = vi.spyOn(console, "log").mockImplementation(() => {});
    await run([...example.args, "--json"], new AbortController().signal);
    const url = new URL(`https://api.inth.com${example.path}`);
    if (example.scoped) {
      url.searchParams.set("organizationId", "org_default");
    }
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      url.href,
      expect.objectContaining({
        body: example.body,
        headers: expect.objectContaining({
          Authorization: "Bearer inth_fixture",
        }),
        method: example.method,
        redirect: "error",
      })
    );
    expect(resolve).toHaveBeenCalledTimes(example.scoped ? 1 : 0);
    expect(stdout).toHaveBeenCalledTimes(1);
    expect(JSON.parse(stdout.mock.lastCall?.[0] ?? "")).toEqual({
      data: payload,
      ok: true,
      schemaVersion: 2,
    });
  });
  it.each(invalidRequests.map((args) => [args]))(
    "rejects invalid requests %j before HTTP",
    (args) => {
      expect(() => parseArguments(args)).toThrow();
    }
  );
  it("encodes resource IDs as a single path segment", () => {
    expect(
      buildResourceRequest(parseArguments(["project", "get", "prj/a?b#c"])).path
    ).toBe("/v1/projects/prj%2Fa%3Fb%23c");
  });
  it("supports raw writes and bodyless POST and DELETE", () => {
    expect(
      rawApiRequest(
        parseArguments([
          "api",
          "/v1/projects/prj_123",
          "--method",
          "patch",
          "--data",
          '{"description":null}',
        ])
      )
    ).toMatchObject({ body: '{"description":null}', method: "PATCH" });
    for (const method of ["POST", "DELETE"]) {
      expect(
        rawApiRequest(
          parseArguments(["api", "/v1/projects/prj_123", "--method", method])
        )
      ).toMatchObject({ body: undefined, method });
    }
  });
});
