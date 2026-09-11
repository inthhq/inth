// Exercises the Node reference implementation in experiments/node, not the shipped Scriptc adapters.

import { once } from "node:events";
import { createServer } from "node:http";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { HttpClient } from "../experiments/node/http.ts";
import { TestClock } from "./fixtures.ts";

describe("real HTTP transport", () => {
  it("refuses redirects before a bearer can be forwarded", async () => {
    const requests: string[] = [];
    const server = createServer((request, response) => {
      requests.push(request.url ?? "");
      response.writeHead(302, { Location: "/target" });
      response.end();
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const { port } = z.object({ port: z.number() }).parse(server.address());
    const http = new HttpClient(
      fetch,
      new TestClock(),
      new AbortController().signal
    );
    try {
      await expect(
        http.request(`http://127.0.0.1:${port}/redirect`, {
          headers: { Authorization: "Bearer test-only" },
        })
      ).rejects.toThrow("Could not reach inth");
      expect(requests).toEqual(["/redirect"]);
    } finally {
      const closed = once(server, "close");
      server.closeAllConnections();
      server.close();
      await closed;
    }
  });
});
