import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiClient } from "../experiments/node/api.ts";
import {
  run,
  selectLoginOrganization,
  showDevice,
} from "../experiments/node/commands.ts";
import { OrganizationContext } from "../experiments/node/state.ts";
import { parseArguments } from "../src/arguments.ts";
import { setup, device } from "./fixtures.ts";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const organization = {
  id: "org-new",
  name: "Acme",
  role: "owner",
  slug: "acme",
};

describe("organization commands", () => {
  it("creates an organization in JSON mode without reading or changing local selection", async () => {
    vi.stubEnv("INTH_TOKEN", "");
    Reflect.deleteProperty(process.env, "INTH_TOKEN");
    const create = vi
      .spyOn(ApiClient.prototype, "createOrganization")
      .mockResolvedValue({ data: organization, success: true });
    const resolve = vi.spyOn(OrganizationContext.prototype, "resolve");
    const select = vi.spyOn(OrganizationContext.prototype, "select");
    const link = vi.spyOn(OrganizationContext.prototype, "link");
    const stdout = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(
      ["org", "create", "--name", "Acme", "--slug", "acme", "--json"],
      new AbortController().signal
    );
    expect(stdout).toHaveBeenCalledTimes(1);
    expect(JSON.parse(stdout.mock.lastCall?.[0] ?? "")).toEqual({
      data: { data: organization, success: true },
      ok: true,
      schemaVersion: 1,
    });
    expect(resolve).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
    expect(link).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledExactlyOnceWith({
      name: "Acme",
      slug: "acme",
    });
  });
  it("lists all organizations without applying a local default", async () => {
    vi.stubEnv("INTH_TOKEN", "inth_fixture");
    const resolve = vi.spyOn(OrganizationContext.prototype, "resolve");
    const payload = { data: [organization], success: true };
    const fetcher = vi.fn().mockResolvedValue(Response.json(payload));
    vi.stubGlobal("fetch", fetcher);
    const stdout = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(["org", "list", "--json"], new AbortController().signal);
    expect(resolve).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      "https://api.inth.com/v1/organizations?limit=50",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer inth_fixture",
        }),
      })
    );
    expect(JSON.parse(stdout.mock.lastCall?.[0] ?? "").data).toEqual(payload);
  });
  it("finishes login without selecting an organization when the person has no memberships", async () => {
    const f = setup([
      Response.json({
        data: [],
        pagination: { hasMore: false, nextCursor: null },
        success: true,
      }),
    ]);
    const api = new ApiClient(
      f.http,
      () => {
        throw new Error("Unexpected credential read");
      },
      "inth_fixture"
    );
    const select = vi.spyOn(OrganizationContext.prototype, "select");
    const stdout = vi.spyOn(console, "log").mockImplementation(() => {});
    await selectLoginOrganization(
      parseArguments(["login"]),
      api,
      new OrganizationContext("/unused", "/unused"),
      {
        interactive: false,
        select: () => {
          throw new Error("Unexpected prompt");
        },
      }
    );
    expect(select).not.toHaveBeenCalled();
    expect(stdout).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("Create your first organization")
    );
  });
});

it("rejects an unsafe approval link before writing to the terminal", async () => {
  const stdout = vi.spyOn(console, "log").mockImplementation(() => {});
  await expect(
    showDevice(
      {
        ...device,
        verification_uri_complete: "https://dashboard.example/\u001B[31m",
      },
      true
    )
  ).rejects.toThrow();
  expect(stdout).not.toHaveBeenCalled();
});
