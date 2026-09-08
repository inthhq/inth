import { expect, it } from "vitest";

import {
  parseDevice,
  parseDiscovery,
  parseTokens,
  responseError,
} from "../src/native/native-protocol.ts";
import { device, metadata, tokens } from "./fixtures.ts";

it("validates native protocol values when the parsers run under Node", () => {
  expect(parseTokens(JSON.stringify(tokens))).toEqual(tokens);
  expect(() =>
    parseTokens(JSON.stringify({ ...tokens, token_type: 42 }))
  ).toThrow("Invalid token response");
  expect(() =>
    parseTokens(JSON.stringify({ ...tokens, access_token: 42 }))
  ).toThrow("Invalid token response");
  expect(() =>
    parseTokens(JSON.stringify({ ...tokens, refresh_token: null }), "previous")
  ).toThrow("Invalid token response");
  expect(() =>
    parseDevice(JSON.stringify({ ...device, device_code: 42 }))
  ).toThrow("Invalid device authorization");
  expect(() =>
    parseDiscovery(JSON.stringify({ ...metadata, token_endpoint: 42 }))
  ).toThrow("Invalid OAuth discovery");
});
it.each([
  { code: "invalid_grant", payload: "invalid_grant" },
  { code: "INSUFFICIENT_SCOPE", payload: { code: "INSUFFICIENT_SCOPE" } },
])("decodes both supported error shapes", async ({ payload, code }) => {
  const result = await responseError({
    body: JSON.stringify({ error: payload }),
    ok: false,
    requestId: "request",
    status: 403,
  });
  expect(result.code).toBe(code);
});
it.each([null, [], {}, { error: null }, { error: { code: 42 } }])(
  "ignores malformed error payloads",
  async (body) => {
    const result = await responseError({
      body: JSON.stringify(body),
      ok: false,
      requestId: null,
      status: 500,
    });
    expect(result.code).toBe("");
  }
);
