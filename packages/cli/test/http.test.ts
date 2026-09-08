import { describe, expect, it } from "vitest";
import { z } from "zod";

import { retryDelay } from "../experiments/node/http.ts";
import { setup } from "./fixtures.ts";

describe("HTTP failures", () => {
  it("honors Retry-After seconds and dates", async () => {
    const f = setup([
      new Response(null, { headers: { "Retry-After": "2" }, status: 429 }),
      new Response(null, {
        headers: { "Retry-After": new Date(1_007_000).toUTCString() },
        status: 429,
      }),
      Response.json({ ok: true }),
    ]);
    const response = await f.http.request("https://api.inth.com/v1/projects");
    expect(response.ok).toBe(true);
    expect(f.clock.waits).toEqual([2000, 5000]);
  });
  it("limits retries and retains the last request ID", async () => {
    const f = setup(
      Array.from(
        { length: 4 },
        () =>
          new Response("not JSON", {
            headers: { "Retry-After": "1", "X-Request-Id": "limit-123" },
            status: 429,
          })
      )
    );
    const response = await f.http.request("https://api.inth.com/v1/projects");
    await expect(f.http.json(response, z.json())).rejects.toThrow("limit-123");
    expect(f.clock.waits).toEqual([1000, 1000, 1000]);
  });
  it("does not poll past a device deadline to retry a 429", async () => {
    const f = setup([
      new Response(null, { headers: { "Retry-After": "60" }, status: 429 }),
    ]);
    const response = await f.http.request(
      "https://api.inth.com",
      {},
      1_001_000
    );
    expect(response.status).toBe(429);
    expect(f.clock.waits).toHaveLength(0);
  });
  it("does not print response bodies or terminal escapes", async () => {
    const f = setup([]);
    const error = await f.http.error(
      Response.json(
        { error: "secret-token\u001B[31m", error_description: "secret" },
        { headers: { "X-Request-Id": "safe-id" }, status: 500 }
      )
    );
    expect(error.message).toBe("Request failed: HTTP 500. Request ID: safe-id");
  });
  it("cancels without making another request", async () => {
    const f = setup([]);
    f.controller.abort();
    await expect(f.http.request("https://api.inth.com")).rejects.toThrow();
    expect(f.server.calls).toHaveLength(0);
  });
  it("uses a bounded default when Retry-After is malformed", () => {
    expect(retryDelay("garbage", 0)).toBe(1000);
    expect(retryDelay(null, 0)).toBe(1000);
    expect(retryDelay("0", 0)).toBe(0);
  });
});
