import { describe, expect, it } from "vitest";

import { ApiClient } from "../experiments/node/api.ts";
import { Auth } from "../experiments/node/auth.ts";
import {
  credentials,
  metadata,
  tokens,
  MemoryStore,
  setup,
} from "./fixtures.ts";

const input = { name: "Acme Team", slug: "acme" };
const created = {
  data: {
    id: "org-new",
    name: input.name,
    role: "owner",
    slug: input.slug,
  },
  success: true,
};
const signedIn = (responses: Response[]) => {
  const f = setup(
    responses,
    new MemoryStore({ ...credentials, expires_at: 2_000_000 })
  );
  return {
    ...f,
    api: new ApiClient(f.http, () =>
      Promise.resolve(new Auth(f.http, f.store))
    ),
  };
};

describe("organization creation", () => {
  it("sends the name and slug as authenticated JSON and returns the organization", async () => {
    const f = signedIn([Response.json(created, { status: 201 })]);
    expect(await f.api.createOrganization(input)).toEqual(created);
    expect(f.server.calls).toHaveLength(1);
    expect(f.server.calls[0]).toMatchObject({
      init: {
        body: JSON.stringify(input),
        headers: {
          Authorization: "Bearer old-access",
          "Content-Type": "application/json",
        },
        method: "POST",
        redirect: "error",
      },
      url: "https://api.inth.com/v1/organizations",
    });
  });
  it("repeats the POST with the same body after refreshing a rejected token", async () => {
    const f = signedIn([
      new Response(null, { status: 401 }),
      Response.json(metadata),
      Response.json(tokens),
      Response.json(created, { status: 201 }),
    ]);
    expect(await f.api.createOrganization(input)).toEqual(created);
    expect(f.server.calls[3]).toMatchObject({
      init: {
        body: JSON.stringify(input),
        headers: {
          Authorization: "Bearer access-secret",
          "Content-Type": "application/json",
        },
        method: "POST",
      },
      url: "https://api.inth.com/v1/organizations",
    });
    expect(f.store.value?.refresh_token).toBe("refresh-secret");
  });
  it.each([
    [403, "INSUFFICIENT_SCOPE", "inth login again"],
    [409, "CONFLICT", "conflicts"],
    [422, "PLAN_LIMIT_REACHED", "owner limit"],
  ])(
    "reports %s errors without retrying or exposing the response body",
    async (status, code, guidance) => {
      const f = signedIn([
        Response.json(
          { error: { code, message: "private-error-body" }, success: false },
          { headers: { "X-Request-Id": "create-id" }, status: Number(status) }
        ),
      ]);
      await expect(f.api.createOrganization(input)).rejects.toMatchObject({
        code,
        message: expect.stringContaining(String(guidance)),
        requestId: "create-id",
        status,
      });
      expect(f.server.calls).toHaveLength(1);
      expect(f.store.writes).toHaveLength(0);
    }
  );
  it.each([
    { ...created, success: false },
    { data: { ...created.data, id: 42 }, success: true },
    { data: { ...created.data, role: "member" }, success: true },
    { success: true },
  ])("rejects malformed creation responses", async (body) => {
    const f = signedIn([
      Response.json(body, {
        headers: { "X-Request-Id": "bad-create" },
        status: 201,
      }),
    ]);
    await expect(f.api.createOrganization(input)).rejects.toMatchObject({
      code: "invalid_response",
      requestId: "bad-create",
    });
  });
  it("rejects API keys without reading credentials or sending a request", async () => {
    const f = setup([]);
    const api = new ApiClient(
      f.http,
      () => {
        throw new Error("Unexpected credentials");
      },
      "inth_test"
    );
    await expect(api.createOrganization(input)).rejects.toThrow(
      "cannot create organizations"
    );
    expect(f.server.calls).toHaveLength(0);
  });
});
