// Exercises the Node reference implementation in experiments/node, not the shipped Scriptc adapters.

import { describe, expect, it } from "vitest";

import { Auth } from "../experiments/node/auth.ts";
import { API_ORIGIN, DISCOVERY_URL } from "../experiments/node/protocol.ts";
import {
  MemoryStore,
  credentials,
  device,
  metadata,
  setup,
  tokens,
} from "./fixtures.ts";

const approve = { show: () => Promise.resolve() };
const { json } = Response;

describe("device login", () => {
  it("discovers dashboard endpoints, prints the complete verification URL, and binds both grants to the API", async () => {
    const f = setup([json(metadata), json(device), json(tokens)]);
    let displayed = "";
    await new Auth(f.http, f.store).login({
      show: (value) => {
        displayed = value.verification_uri_complete;
        return Promise.resolve();
      },
    });
    expect(displayed).toBe(device.verification_uri_complete);
    expect(f.server.calls.map((call) => call.url)).toEqual([
      DISCOVERY_URL,
      metadata.device_authorization_endpoint,
      metadata.token_endpoint,
    ]);
    expect(f.server.calls[1]?.init).toMatchObject({
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      method: "POST",
      redirect: "error",
    });
    expect(f.server.calls[1]?.init.body).toBe(
      new URLSearchParams({
        client_id: "inth-cli",
        resource: API_ORIGIN,
        scope:
          "openid profile email offline_access organizations.read organizations.write projects.read projects.write members.read members.write api-keys.read api-keys.write code-audit.read code-audit.write inbox.read inbox.write billing.read",
      }).toString()
    );
    expect(f.server.calls[2]?.init.body).toBe(
      new URLSearchParams({
        client_id: "inth-cli",
        device_code: device.device_code,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        resource: API_ORIGIN,
      }).toString()
    );
    expect(f.clock.waits).toEqual([5000]);
    expect(f.store.value).toEqual({
      access_token: tokens.access_token,
      expires_at: 1_905_000,
      refresh_token: tokens.refresh_token,
    });
  });
  it("explains a rejected scope grant and preserves the saved sign-in without falling back to old scopes", async () => {
    const f = setup(
      [
        json(metadata),
        json(
          {
            error: "invalid_scope",
            error_description:
              "client does not allow scope organizations.read private-response",
          },
          { headers: { "X-Request-Id": "scope-request" }, status: 400 }
        ),
      ],
      new MemoryStore(credentials)
    );
    let approvals = 0;
    let failure: Error | undefined;
    try {
      await new Auth(f.http, f.store).login({
        show: () => {
          approvals += 1;
          return Promise.resolve();
        },
      });
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }
      failure = error;
    }
    expect(failure).toMatchObject({
      code: "invalid_scope",
      message: expect.stringContaining("inth-cli client registration"),
      requestId: "scope-request",
      status: 400,
    });
    expect(failure?.message).not.toContain("private-response");
    expect(approvals).toBe(0);
    expect(f.server.calls).toHaveLength(2);
    expect(f.store.value).toEqual(credentials);
    expect(f.store.writes).toHaveLength(0);
    expect(f.store.clears).toBe(0);
  });
  it("waits before each poll and retains each slow_down increase", async () => {
    const f = setup([
      json(metadata),
      json(device),
      json({ error: "authorization_pending" }, { status: 400 }),
      json({ error: "slow_down" }, { status: 400 }),
      json({ error: "authorization_pending" }, { status: 400 }),
      json(tokens),
    ]);
    await new Auth(f.http, f.store).login(approve);
    expect(f.clock.waits).toEqual([5000, 5000, 10_000, 10_000]);
  });
  it("uses the default five-second polling interval", async () => {
    const { interval: _interval, ...withoutInterval } = device;
    const f = setup([json(metadata), json(withoutInterval), json(tokens)]);
    await new Auth(f.http, f.store).login(approve);
    expect(f.clock.waits).toEqual([5000]);
  });
  it.each([
    ["access_denied", "Sign-in was refused"],
    ["expired_token", "Run `inth login` to start again"],
  ])("stops on %s and preserves an existing login", async (code, message) => {
    const f = setup(
      [
        json(metadata),
        json(device),
        json(
          { error: code },
          { headers: { "X-Request-Id": "req-123" }, status: 400 }
        ),
      ],
      new MemoryStore(credentials)
    );
    await expect(new Auth(f.http, f.store).login(approve)).rejects.toThrow(
      message
    );
    expect(f.store.value).toEqual(credentials);
    expect(f.store.writes).toHaveLength(0);
  });
  it("does not poll after local expiry", async () => {
    const f = setup([json(metadata), json({ ...device, expires_in: 5 })]);
    await expect(new Auth(f.http, f.store).login(approve)).rejects.toThrow(
      "expired"
    );
    expect(f.server.calls).toHaveLength(2);
  });
  it("rejects discovery that could disclose credentials over HTTP", async () => {
    const f = setup([
      json({
        ...metadata,
        token_endpoint: "http://dashboard.example/exchange",
      }),
    ]);
    await expect(new Auth(f.http, f.store).login(approve)).rejects.toThrow(
      "invalid response"
    );
    expect(f.server.calls).toHaveLength(1);
  });
  it("refuses token responses without a rotating refresh token", async () => {
    const f = setup([
      json(metadata),
      json(device),
      json({ access_token: "secret", expires_in: 900, token_type: "Bearer" }),
    ]);
    await expect(new Auth(f.http, f.store).login(approve)).rejects.toThrow(
      "invalid response"
    );
    expect(f.store.value).toBeNull();
  });
});

describe("refresh", () => {
  it("explicitly refreshes a valid token with one credential read", async () => {
    const store = new MemoryStore({ ...credentials, expires_at: 2_000_000 });
    const f = setup([Response.json(metadata), Response.json(tokens)], store);
    expect(await new Auth(f.http, store).refresh()).toBe(tokens.access_token);
    expect(store.reads).toBe(1);
    expect(store.writes).toHaveLength(1);
    expect(store.value?.refresh_token).toBe(tokens.refresh_token);
  });
  it("uses a valid token without discovery", async () => {
    const f = setup(
      [],
      new MemoryStore({ ...credentials, expires_at: 2_000_000 })
    );
    expect(await new Auth(f.http, f.store).accessToken()).toBe(
      credentials.access_token
    );
    expect(f.server.calls).toHaveLength(0);
  });
  it("refreshes early, rotates atomically, and uses the new refresh token next time", async () => {
    const f = setup(
      [
        json(metadata),
        json(tokens),
        json({
          ...tokens,
          access_token: "second",
          refresh_token: "second-refresh",
        }),
      ],
      new MemoryStore({ ...credentials, expires_at: 1_030_000 })
    );
    const auth = new Auth(f.http, f.store);
    expect(await auth.accessToken()).toBe(tokens.access_token);
    expect(f.store.value?.refresh_token).toBe(tokens.refresh_token);
    f.clock.time += 900_000;
    expect(await auth.accessToken()).toBe("second");
    expect(f.server.calls[1]?.init.body).toBe(
      new URLSearchParams({
        client_id: "inth-cli",
        grant_type: "refresh_token",
        refresh_token: credentials.refresh_token,
        resource: API_ORIGIN,
      }).toString()
    );
    expect(f.server.calls[2]?.init.body).toContain(
      "refresh_token=refresh-secret"
    );
  });
  it("serializes concurrent refreshes across auth instances", async () => {
    const f = setup(
      [json(metadata), json(tokens)],
      new MemoryStore(credentials)
    );
    const result = await Promise.all([
      new Auth(f.http, f.store).accessToken(),
      new Auth(f.http, f.store).accessToken(),
    ]);
    expect(result).toEqual([tokens.access_token, tokens.access_token]);
    expect(f.server.calls).toHaveLength(2);
    expect(f.store.writes).toHaveLength(1);
  });
  it("clears revoked sessions and includes the request ID", async () => {
    const f = setup(
      [
        json(metadata),
        json(
          { error: "invalid_grant" },
          { headers: { "X-Request-Id": "revoked-123" }, status: 400 }
        ),
      ],
      new MemoryStore(credentials)
    );
    await expect(new Auth(f.http, f.store).accessToken()).rejects.toThrow(
      "Run `inth login` again. Request failed: HTTP 400 (invalid_grant). Request ID: revoked-123"
    );
    expect(f.store.value).toBeNull();
  });
  it("retains credentials on a transient server failure", async () => {
    const f = setup(
      [json(metadata), new Response("outage", { status: 503 })],
      new MemoryStore(credentials)
    );
    await expect(new Auth(f.http, f.store).accessToken()).rejects.toThrow(
      "503"
    );
    expect(f.store.value).toEqual(credentials);
  });
});

describe("logout", () => {
  it("revokes the refresh token before deleting the saved session", async () => {
    const f = setup(
      [json(metadata), new Response(null, { status: 200 })],
      new MemoryStore(credentials)
    );
    await new Auth(f.http, f.store).logout();
    expect(f.server.calls[1]?.url).toBe(metadata.revocation_endpoint);
    expect(f.server.calls[1]?.init.body).toBe(
      new URLSearchParams({
        client_id: "inth-cli",
        token: credentials.refresh_token,
        token_type_hint: "refresh_token",
      }).toString()
    );
    expect(f.store.value).toBeNull();
  });
  it("clears local state and reports when remote revocation fails", async () => {
    const f = setup(
      [
        json(metadata),
        new Response(null, {
          headers: { "X-Request-Id": "revoke-123" },
          status: 503,
        }),
      ],
      new MemoryStore(credentials)
    );
    await expect(new Auth(f.http, f.store).logout()).rejects.toThrow(
      "revoke-123"
    );
    expect(f.store.value).toBeNull();
  });
  it("is idempotent when there is no saved session", async () => {
    const f = setup([]);
    await new Auth(f.http, f.store).logout();
    expect(f.server.calls).toHaveLength(0);
  });
});

it("keeps the current refresh token when the server does not rotate it", async () => {
  const f = setup(
    [
      Response.json(metadata),
      Response.json({
        access_token: "new-access",
        expires_in: 900,
        token_type: "Bearer",
      }),
    ],
    new MemoryStore(credentials)
  );
  expect(await new Auth(f.http, f.store).refresh()).toBe("new-access");
  expect(f.store.value).toEqual({
    access_token: "new-access",
    expires_at: f.clock.now() + 900_000,
    refresh_token: credentials.refresh_token,
  });
});
it("still requires a refresh token when completing login", async () => {
  const f = setup([
    Response.json(metadata),
    Response.json(device),
    Response.json({
      access_token: "new-access",
      expires_in: 900,
      token_type: "Bearer",
    }),
  ]);
  await expect(
    new Auth(f.http, f.store).login({ show: async () => {} })
  ).rejects.toMatchObject({ code: "invalid_response" });
  expect(f.store.value).toBeNull();
});
