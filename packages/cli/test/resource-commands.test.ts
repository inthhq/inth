// Exercises the Node reference implementation in experiments/node, not the shipped Scriptc adapters.

import { afterEach, describe, expect, it, vi } from "vitest";

import { run } from "../experiments/node/commands.ts";
import { OrganizationContext } from "../experiments/node/state.ts";
import { parseArguments } from "../src/arguments.ts";
import { HttpError } from "../src/http-error.ts";
import { reportError } from "../src/output.ts";
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
  it.each([
    ["/v1/projects/prj_123/consent/configuration/i18n", []],
    ["/v1/projects", ["--organization", "org_explicit"]],
  ])("uses only explicit tenant selectors for raw %s", async (path, flags) => {
    vi.stubEnv("INTH_TOKEN", "inth_fixture");
    vi.spyOn(OrganizationContext.prototype, "resolve").mockImplementation(
      (organization) => Promise.resolve(organization ?? "org_saved")
    );
    vi.stubGlobal("fetch", (url: string) => {
      const selected = new URL(url).searchParams.get("organizationId");
      return Promise.resolve(
        selected === (flags.length ? "org_explicit" : null)
          ? Response.json({ data: { selected }, success: true })
          : Response.json(
              { error: { code: "INVALID_PAYLOAD" } },
              { status: 400 }
            )
      );
    });
    const stdout = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(["api", path, ...flags, "--json"], new AbortController().signal);
    expect(JSON.parse(stdout.mock.lastCall?.[0] ?? "")).toMatchObject({
      data: { data: { selected: flags.length ? "org_explicit" : null } },
      ok: true,
    });
  });
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
    if (options.command === "code-audit" && options.argument === "issues") {
      url.searchParams.set("detail", "full");
    }
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
  it.each([
    [
      "INSUFFICIENT_SCOPE",
      "insufficient_scope",
      "Organization API keys cannot gain",
    ],
    ["FORBIDDEN", "access_denied", "HTTP 403"],
  ])(
    "reports a refused vendor decision (%s) with guidance",
    async (apiCode, code, guidance) => {
      vi.stubEnv("INTH_TOKEN", "inth_fixture");
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            Response.json(
              { error: { code: apiCode }, success: false },
              { headers: { "X-Request-Id": "decision-id" }, status: 403 }
            )
          )
      );
      const args = [
        "vendor",
        "approve",
        "google-analytics",
        "--project",
        "prj_123",
        "--json",
      ];
      const failure = await run(args, new AbortController().signal).then(
        () => new Error("The decision was not refused."),
        (error: Error) => error
      );
      expect(failure).toBeInstanceOf(HttpError);
      const stdout = vi.spyOn(console, "log").mockImplementation(() => {});
      expect(reportError(true, failure, false)).toBe(1);
      expect(JSON.parse(stdout.mock.lastCall?.[0] ?? "").error).toMatchObject({
        apiCode,
        code,
        httpStatus: 403,
        message: expect.stringContaining(guidance),
        requestId: "decision-id",
      });
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
