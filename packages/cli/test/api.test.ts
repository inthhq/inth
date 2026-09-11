// Exercises the Node reference implementation in experiments/node, not the shipped Scriptc adapters.

import { describe, expect, it } from "vitest";

import { ApiClient, apiKey, apiUrl } from "../experiments/node/api.ts";
import { Auth } from "../experiments/node/auth.ts";
import {
  credentials,
  metadata,
  tokens,
  MemoryStore,
  setup,
} from "./fixtures.ts";

describe("API authentication", () => {
  it("rejects malformed API JSON instead of reporting a successful null result", async () => {
    const f = setup([
      new Response("private-invalid-body", {
        headers: { "X-Request-Id": "bad-json" },
      }),
    ]);
    const api = new ApiClient(
      f.http,
      () => {
        throw new Error("Must not access credentials");
      },
      "inth_key"
    );
    await expect(api.get("/v1/me")).rejects.toMatchObject({
      code: "invalid_response",
      requestId: "bad-json",
    });
  });
  it("gives --token precedence over INTH_TOKEN", () => {
    expect(apiKey("inth_flag", "inth_env")).toBe("inth_flag");
    expect(apiKey(undefined, "inth_env")).toBe("inth_env");
    expect(apiKey()).toBeUndefined();
    expect(apiKey(undefined, "")).toBeUndefined();
    expect(() => apiKey("", "inth_env")).toThrow("organization API key");
    expect(() => apiKey(undefined, "secret")).toThrow("organization API key");
  });
  it("never loads credentials or refreshes an organization key, even on 401", async () => {
    const f = setup([
      new Response(null, {
        headers: { "X-Request-Id": "key-123" },
        status: 401,
      }),
    ]);
    const api = new ApiClient(
      f.http,
      () => {
        throw new Error("Must not access credentials");
      },
      "inth_key"
    );
    await expect(api.get("/v1/projects", "org-1")).rejects.toThrow("key-123");
    expect(f.server.calls).toHaveLength(1);
    expect(f.server.calls[0]?.init.headers).toMatchObject({
      Authorization: "Bearer inth_key",
    });
    expect(f.server.calls[0]?.url).toBe(
      "https://api.inth.com/v1/projects?organizationId=org-1"
    );
  });
  it("refreshes once after a 401 and retries with the replacement token", async () => {
    const f = setup(
      [
        new Response(null, { status: 401 }),
        Response.json(metadata),
        Response.json(tokens),
        Response.json({ ok: true }),
      ],
      new MemoryStore({ ...credentials, expires_at: 2_000_000 })
    );
    const api = new ApiClient(f.http, () =>
      Promise.resolve(new Auth(f.http, f.store))
    );
    expect(await api.get("/v1/projects")).toBe('{\n  "ok": true\n}');
    expect(f.server.calls[0]?.init.headers).toMatchObject({
      Authorization: "Bearer old-access",
    });
    expect(f.server.calls[3]?.init.headers).toMatchObject({
      Authorization: "Bearer access-secret",
    });
  });
  it("does not loop when a refreshed token is also rejected", async () => {
    const f = setup(
      [
        new Response(null, { status: 401 }),
        Response.json(metadata),
        Response.json(tokens),
        new Response(null, { status: 401 }),
      ],
      new MemoryStore({ ...credentials, expires_at: 2_000_000 })
    );
    await expect(
      new ApiClient(f.http, () =>
        Promise.resolve(new Auth(f.http, f.store))
      ).get("/v1/projects")
    ).rejects.toThrow("401");
    expect(f.server.calls).toHaveLength(4);
  });
  it.each([
    "https://evil.example/v1/projects",
    "//evil.example/v1/projects",
    "/v1/../private",
    "/v1/projects#secret",
    "https://user:password@api.inth.com/v1/projects",
  ])("rejects unsafe bearer destinations: %s", (path) => {
    expect(() => apiUrl(path)).toThrow("/v1/");
  });
  it("preserves an explicit organization query parameter", () => {
    expect(apiUrl("/v1/projects?organizationId=explicit", "default")).toContain(
      "organizationId=explicit"
    );
  });
});
