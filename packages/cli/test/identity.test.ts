import { describe, expect, it } from "vitest";

import { ApiClient } from "../experiments/node/api.ts";
import { Auth } from "../experiments/node/auth.ts";
import { identitySummary } from "../src/identity.ts";
import {
  MemoryStore,
  credentials,
  metadata,
  setup,
  tokens,
} from "./fixtures.ts";
import { keyIdentity, userIdentity } from "./fixtures/identity.ts";

describe("whoami", () => {
  it("fetches the current principal with a supplied key and no organization filter", async () => {
    const f = setup([Response.json(keyIdentity)]);
    const api = new ApiClient(
      f.http,
      () => {
        throw new Error("Must not read credentials");
      },
      "inth_test"
    );
    expect(await api.getMe(true)).toEqual(keyIdentity);
    expect(f.server.calls[0]?.url).toBe("https://api.inth.com/v1/me");
    expect(f.server.calls[0]?.init.headers).toMatchObject({
      Authorization: "Bearer inth_test",
    });
  });
  it("refreshes a rejected user token and returns the server identity", async () => {
    const f = setup(
      [
        new Response(null, { status: 401 }),
        Response.json(metadata),
        Response.json(tokens),
        Response.json(userIdentity),
      ],
      new MemoryStore({ ...credentials, expires_at: 2_000_000 })
    );
    const api = new ApiClient(f.http, () =>
      Promise.resolve(new Auth(f.http, f.store))
    );
    expect(await api.getMe()).toEqual(userIdentity);
    expect(f.server.calls[3]?.url).toBe("https://api.inth.com/v1/me");
    expect(f.server.calls[3]?.init.headers).toMatchObject({
      Authorization: "Bearer access-secret",
    });
  });
  it.each([
    { ...userIdentity, success: false },
    {
      data: { ...userIdentity.data, principal: { type: "unknown" } },
      success: true,
    },
    { data: { ...userIdentity.data, organizations: "invalid" }, success: true },
    { data: { ...userIdentity.data, scopes: [42] }, success: true },
    { data: { ...userIdentity.data, scopes: undefined }, success: true },
    { data: { principal: { type: "oauth" } }, success: true },
  ])(
    "rejects malformed identity responses and retains request IDs",
    async (body) => {
      const f = setup([
        Response.json(body, { headers: { "X-Request-Id": "identity-id" } }),
      ]);
      const api = new ApiClient(
        f.http,
        () => {
          throw new Error("Unexpected credentials");
        },
        "inth_test"
      );
      await expect(api.getMe()).rejects.toMatchObject({
        code: "invalid_response",
        httpStatus: 200,
        requestId: "identity-id",
      });
    }
  );
  it("describes users and API keys without treating the key creator as the acting user", () => {
    expect(identitySummary(userIdentity.data)).toContain(
      "No organization selected. Run inth switch.\n\nOrganizations (1)\n    Organization  Role\n    One (one)     owner"
    );
    const summary = identitySummary(keyIdentity.data);
    expect(summary).toContain("Organization API key\nKey …-one");
    expect(summary).not.toContain("user-creator");
    expect(summary).toContain("Key organization: …-one");
    expect(summary).not.toContain("Signed in as");
  });
  it("reports missing organization scope without suggesting memberships are absent", () => {
    const summary = identitySummary({
      ...userIdentity.data,
      organizations: [],
      scopes: [],
    });
    expect(summary).toContain("Capabilities: none");
    expect(summary).toContain("Run inth login again");
    expect(summary).not.toContain("Create");
    expect(summary).not.toContain("inth switch");
  });
  it("strips terminal controls from server-provided display values", () => {
    expect(
      identitySummary({
        ...userIdentity.data,
        principal: { type: "session", userId: "user\n\u001B[31m" },
      })
    ).toContain("User …[31m · Session");
  });

  it("discovers UserInfo and reuses the API token without a second credential read", async () => {
    const profile = {
      email: "kaylee@example.com",
      name: "Kaylee",
      sub: "user-one",
    };
    const f = setup(
      [
        Response.json(userIdentity),
        Response.json({
          ...metadata,
          userinfo_endpoint: "https://dashboard.example/person",
        }),
        Response.json(profile),
      ],
      new MemoryStore({ ...credentials, expires_at: 2_000_000 })
    );
    const api = new ApiClient(f.http, () =>
      Promise.resolve(new Auth(f.http, f.store))
    );
    const result = await api.getMe(true);
    expect(result).toEqual({ ...userIdentity, profile });
    expect(f.store.reads).toBe(1);
    expect(f.server.calls[1]?.url).toBe(
      "https://api.inth.com/.well-known/oauth-authorization-server"
    );
    expect(f.server.calls[1]?.init.headers).toBeUndefined();
    expect(f.server.calls[2]?.url).toBe("https://dashboard.example/person");
    expect(f.server.calls[2]?.init.headers).toMatchObject({
      Authorization: "Bearer old-access",
    });
    const output = identitySummary(result.data, {
      color: false,
      columns: 80,
      profile: result.profile,
    });
    expect(output).toContain("Kaylee <kaylee@example.com>");
    expect(output).not.toContain("User …");
  });

  it.each([
    { email: "wrong@example.com", name: "Wrong person", sub: "someone-else" },
    { name: 42, sub: "user-one" },
    { email: [], sub: "user-one" },
    { name: "Missing subject" },
  ])("rejects mismatched or malformed UserInfo", async (profile) => {
    const f = setup(
      [
        Response.json(userIdentity),
        Response.json({
          ...metadata,
          userinfo_endpoint: "https://dashboard.example/person",
        }),
        Response.json(profile, { headers: { "X-Request-Id": "profile-id" } }),
      ],
      new MemoryStore({ ...credentials, expires_at: 2_000_000 })
    );
    const api = new ApiClient(f.http, () =>
      Promise.resolve(new Auth(f.http, f.store))
    );
    await expect(api.getMe(true)).rejects.toMatchObject({
      code: "invalid_response",
      requestId: "profile-id",
    });
  });

  it.each([
    "https://evil.example/person",
    "http://dashboard.example/person",
    "https://user@dashboard.example/person",
  ])(
    "does not send credentials to an unsafe UserInfo endpoint",
    async (endpoint) => {
      const f = setup(
        [
          Response.json(userIdentity),
          Response.json({ ...metadata, userinfo_endpoint: endpoint }),
        ],
        new MemoryStore({ ...credentials, expires_at: 2_000_000 })
      );
      const api = new ApiClient(f.http, () =>
        Promise.resolve(new Auth(f.http, f.store))
      );
      await expect(api.getMe(true)).rejects.toMatchObject({
        code: "invalid_response",
      });
      expect(f.server.calls).toHaveLength(2);
    }
  );

  it("refreshes a rejected UserInfo token and reuses cached discovery", async () => {
    const profile = {
      email: "kaylee@example.com",
      name: "Kaylee",
      sub: "user-one",
    };
    const f = setup(
      [
        Response.json(userIdentity),
        Response.json({
          ...metadata,
          userinfo_endpoint: "https://dashboard.example/person",
        }),
        new Response(null, { status: 401 }),
        Response.json(tokens),
        Response.json(profile),
      ],
      new MemoryStore({ ...credentials, expires_at: 2_000_000 })
    );
    const api = new ApiClient(f.http, () =>
      Promise.resolve(new Auth(f.http, f.store))
    );
    const result = await api.getMe(true);
    expect(result.profile).toEqual(profile);
    expect(f.server.calls[4]?.init.headers).toMatchObject({
      Authorization: "Bearer access-secret",
    });
    expect(f.store.value?.refresh_token).toBe("refresh-secret");
  });

  it("keeps identity usable when UserInfo is not advertised", async () => {
    const f = setup(
      [Response.json(userIdentity), Response.json(metadata)],
      new MemoryStore({ ...credentials, expires_at: 2_000_000 })
    );
    const api = new ApiClient(f.http, () =>
      Promise.resolve(new Auth(f.http, f.store))
    );
    expect(await api.getMe(true)).toEqual(userIdentity);
  });
});
