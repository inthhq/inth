/* eslint-disable require-await -- In-memory adapters implement asynchronous production interfaces. */
import "../../src/native/native-bindings.ts";
import { AuthFlow } from "../../src/auth-flow.ts";
import type { Credentials, OAuthResponse } from "../../src/auth-types.ts";
import { CliError } from "../../src/cli-error.ts";
import { HttpError } from "../../src/http-error.ts";
import { NativeApi } from "../../src/native/native-api.ts";
import {
  parseDiscovery,
  parseDevice,
  parseTokens,
  responseError,
} from "../../src/native/native-protocol.ts";

const check = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};
const scenario = process.argv[2] ?? "success";
const response = (body: string, status = 200): OAuthResponse => ({
  body,
  ok: status < 400,
  requestId: "create-id",
  status,
});
let saved: Credentials = {
  access_token: "old-access",
  expires_at: 2_000_000,
  refresh_token: "old-refresh",
};
let reads = 0;
let posts = 0;
let refreshes = 0;
const auth = new AuthFlow(
  {
    clock: {
      now: () => 1_000_000,
      sleep: async () => {
        throw new Error("Unexpected polling");
      },
    },
    device: async (value) => parseDevice(value.body),
    discovery: async (value) => parseDiscovery(value.body),
    error: responseError,
    form: async () => {
      refreshes += 1;
      return response(
        '{"access_token":"new-access","refresh_token":"new-refresh","expires_in":900,"token_type":"Bearer"}'
      );
    },
    request: async () =>
      response(
        JSON.stringify({
          device_authorization_endpoint: "https://dashboard.example/device",
          issuer: "https://dashboard.example/auth",
          revocation_endpoint: "https://dashboard.example/revoke",
          token_endpoint: "https://dashboard.example/token",
        })
      ),
    tokens: async (value) => parseTokens(value.body),
  },
  {
    clear: async () => {
      throw new Error("Unexpected credential deletion");
    },
    exclusive: (work) => work(),
    read: async () => {
      reads += 1;
      return saved;
    },
    write: async (value) => {
      saved = value;
    },
  }
);
const api = new NativeApi(
  {
    get: async () => {
      throw new Error("Creation used GET");
    },
    post: async (url, token, body) => {
      posts += 1;
      check(
        url === "https://api.inth.com/v1/organizations",
        "Creation included an organization filter or used the wrong URL"
      );
      check(
        body === '{"name":"Acme Team","slug":"acme"}',
        "Creation body changed"
      );
      check(
        token === (posts === 1 ? "old-access" : "new-access"),
        "Wrong bearer token"
      );
      if (scenario === "refresh" && posts === 1) {
        return response("", 401);
      }
      if (scenario === "scope") {
        return response(
          '{"success":false,"error":{"code":"INSUFFICIENT_SCOPE","message":"private-body"}}',
          403
        );
      }
      if (scenario === "conflict") {
        return response('{"success":false,"error":{"code":"CONFLICT"}}', 409);
      }
      if (scenario === "limit") {
        return response(
          '{"success":false,"error":{"code":"PLAN_LIMIT_REACHED"}}',
          422
        );
      }
      if (scenario === "malformed") {
        return response(
          '{"success":true,"data":{"id":42,"name":"Acme Team","slug":"acme","role":"owner"}}',
          201
        );
      }
      if (scenario === "failed") {
        return response(
          '{"success":false,"data":{"id":"org-new","name":"Acme Team","slug":"acme","role":"owner"}}',
          201
        );
      }
      return response(
        '{"success":true,"data":{"id":"org-new","name":"Acme Team","slug":"acme","role":"owner"}}',
        201
      );
    },
    send: async () => {
      throw new Error("Unexpected mutation");
    },
  },
  () => auth,
  scenario === "key" ? "inth_fixture" : undefined
);
let rejected = false;
try {
  const created = await api.createOrganization({
    name: "Acme Team",
    slug: "acme",
  });
  check(
    created.data.id === "org-new" && created.data.role === "owner",
    "Missing organization response"
  );
} catch (error) {
  rejected = true;
  if (scenario === "key") {
    check(
      error instanceof CliError && error.code === "usage_error",
      "Wrong API key error"
    );
  } else if (scenario === "malformed" || scenario === "failed") {
    check(
      error instanceof CliError &&
        error.code === "invalid_response" &&
        error.requestId === "create-id",
      "Invalid creation response accepted or lost request ID"
    );
  } else {
    check(
      error instanceof HttpError && error.requestId === "create-id",
      "Missing HTTP error details"
    );
    if (scenario === "scope") {
      check(
        error instanceof HttpError &&
          error.code === "INSUFFICIENT_SCOPE" &&
          error.message.includes("inth login again") &&
          !error.message.includes("private-body"),
        "Missing scope guidance or leaked body"
      );
    }
  }
}
check(
  rejected === !["success", "refresh"].includes(scenario),
  "Unexpected creation outcome"
);
const expectedPosts = scenario === "refresh" ? 2 : 1;
check(
  posts === (scenario === "key" ? 0 : expectedPosts),
  "Unexpected POST retry"
);
check(
  refreshes === (scenario === "refresh" ? 1 : 0),
  "Unexpected credential refresh"
);
if (scenario === "key") {
  check(reads === 0, "API key loaded credentials");
}
if (scenario === "refresh") {
  check(
    saved.refresh_token === "new-refresh",
    "Refresh rotation was not saved"
  );
}
if (scenario === "success") {
  for (const method of ["PATCH", "DELETE", "POST"]) {
    saved = {
      access_token: "old-access",
      expires_at: 2_000_000,
      refresh_token: "old-refresh",
    };
    let attempts = 0;
    const body =
      method === "PATCH" ? '{"status":"resolved","version":"3"}' : undefined;
    const mutation = new NativeApi(
      {
        get: async () => {
          throw new Error("Mutation used GET");
        },
        post: async () => {
          throw new Error("Bodyless mutation used JSON POST");
        },
        send: async (
          url,
          token,
          sentMethod,
          sentBody
        ): Promise<OAuthResponse> => {
          attempts += 1;
          check(
            url === "https://api.inth.com/v1/inbox/item_123",
            "Mutation URL changed"
          );
          check(
            sentMethod === method && sentBody === body,
            "Mutation changed during refresh"
          );
          check(
            token === (attempts === 1 ? "old-access" : "new-access"),
            "Wrong mutation bearer"
          );
          return response("", attempts === 1 ? 401 : 204);
        },
      },
      () => auth
    );
    // eslint-disable-next-line no-await-in-loop -- Each mutation gets a fresh saved token and one rejected request.
    const result = await mutation.execute("/v1/inbox/item_123", method, body);
    check(
      result.status === 204 && attempts === 2,
      "Mutation did not refresh once"
    );
    check(
      saved.refresh_token === "new-refresh",
      "Mutation lost token rotation"
    );
  }
}
console.log(`Native organization ${scenario} passed.`);
process.exit(0);
