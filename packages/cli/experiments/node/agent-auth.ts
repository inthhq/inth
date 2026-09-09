import path from "node:path";

import { AsyncEntry } from "@napi-rs/keyring";

import { AgentAuth } from "../../src/agent-auth.ts";
import { productionAgentEnvironment } from "../../src/agent-environment.ts";
import type { OAuthResponse } from "../../src/auth-types.ts";
import { responseError } from "../../src/native/native-protocol.ts";
import type { HttpClient } from "./http.ts";
import { PlatformStore } from "./store.ts";

const capture = async (response: Response): Promise<OAuthResponse> => ({
  body: await response.text(),
  ok: response.ok,
  requestId: response.headers.get("X-Request-Id"),
  retryAfter: response.headers.get("Retry-After") ?? undefined,
  status: response.status,
});

export const agentAuth = (
  http: HttpClient,
  directory: string,
  environment = productionAgentEnvironment
): AgentAuth => {
  const entry = new AsyncEntry("com.inth.cli", environment.account);
  const lock = new PlatformStore(entry, path.join(directory, "agent"));
  return new AgentAuth(
    {
      clock: http.clock,
      error: responseError,
      form: async (url, fields, deadline) =>
        capture(await http.form(url, fields, deadline)),
      get: async (url, token) =>
        capture(
          await http.request(url, {
            headers: { Authorization: `Bearer ${token}` },
          })
        ),
      post: async (url, _token, body) =>
        capture(
          await http.request(url, {
            body,
            headers: { "Content-Type": "application/json" },
            method: "POST",
          })
        ),
      request: async (url) => capture(await http.request(url)),
    },
    {
      clear: async () => {
        await entry.deleteCredential();
      },
      exclusive: (work) => lock.exclusive(work),
      read: async () => (await entry.getPassword()) ?? null,
      write: (value) => entry.setPassword(value),
    },
    environment
  );
};
