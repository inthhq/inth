/* eslint-disable require-await -- In-memory adapters implement asynchronous production interfaces. */
import "../../src/native/native-bindings.ts";
import { AuthFlow } from "../../src/auth-flow.ts";
import type { Credentials, OAuthResponse } from "../../src/auth-types.ts";
import { CliError } from "../../src/cli-error.ts";
import { identitySummary } from "../../src/identity.ts";
import { NativeApi } from "../../src/native/native-api.ts";
import {
  parseDiscovery,
  parseDevice,
  parseTokens,
  responseError,
} from "../../src/native/native-protocol.ts";
import { userIdentity, keyIdentity } from "../fixtures/identity.ts";

const metadata = {
  device_authorization_endpoint: "https://dashboard.example/device",
  issuer: "https://dashboard.example/auth",
  revocation_endpoint: "https://dashboard.example/revoke",
  token_endpoint: "https://dashboard.example/token",
};
const credentials = {
  access_token: "old-access",
  expires_at: 2_000_000,
  refresh_token: "old-refresh",
};
const tokens = {
  access_token: "new-access",
  expires_in: 900,
  refresh_token: "new-refresh",
  token_type: "Bearer",
};

const check = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};
const scenario =
  process.argv.length > 2 ? (process.argv[2] ?? "success") : "success";
const response = (body: string): OAuthResponse => ({
  body,
  ok: true,
  requestId: "profile-id",
  status: 200,
});
let saved: Credentials = { ...credentials, expires_at: 2_000_000 };
let reads = 0;
let discoveries = 0;
let profiles = 0;
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
    form: async (url) => {
      check(
        scenario === "refresh" && url === metadata.token_endpoint,
        "Unexpected refresh"
      );
      return response(JSON.stringify(tokens));
    },
    request: async (url) => {
      check(
        url === "https://api.inth.com/.well-known/oauth-authorization-server",
        "Wrong discovery URL"
      );
      discoveries += 1;
      return response(
        JSON.stringify({
          ...metadata,
          userinfo_endpoint:
            scenario === "unsafe"
              ? "https://evil.example/person"
              : "https://dashboard.example/person",
        })
      );
    },
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
    get: async (url, token) => {
      if (url === "https://api.inth.com/v1/me") {
        return response(
          JSON.stringify(scenario === "key" ? keyIdentity : userIdentity)
        );
      }
      check(
        url === "https://dashboard.example/person",
        "Token sent to an unexpected endpoint"
      );
      profiles += 1;
      if (scenario === "refresh" && profiles === 1) {
        return { body: "", ok: false, requestId: "profile-id", status: 401 };
      }
      check(
        token ===
          (scenario === "refresh"
            ? tokens.access_token
            : credentials.access_token),
        "Wrong UserInfo token"
      );
      if (scenario === "malformed") {
        return response('{"sub":"user-one","name":42}');
      }
      return response(
        JSON.stringify({
          email: "kaylee@example.com",
          name: "Kaylee",
          sub: scenario === "mismatch" ? "wrong-user" : "user-one",
        })
      );
    },
    post: async () => {
      throw new Error("Unexpected POST");
    },
    send: async () => {
      throw new Error("Unexpected mutation");
    },
  },
  () => {
    check(scenario !== "key", "API key accessed browser credentials");
    return auth;
  },
  scenario === "key" ? "inth_fixture" : undefined
);

try {
  const identity = await api.getMe(true);
  check(
    !["mismatch", "malformed", "unsafe"].includes(scenario),
    "Accepted an invalid profile"
  );
  if (scenario === "key") {
    check(
      !identity.profile && profiles === 0 && discoveries === 0 && reads === 0,
      "API key fetched a person"
    );
  } else {
    check(
      identity.profile?.name === "Kaylee" &&
        identity.profile.email === "kaylee@example.com",
      "Missing profile fields"
    );
    check(
      identitySummary(identity.data, {
        color: false,
        columns: 80,
        profile: identity.profile,
      }).includes("Kaylee <kaylee@example.com>"),
      "Name and email not displayed"
    );
    check(
      discoveries === 1 && reads === (scenario === "refresh" ? 2 : 1),
      "Redundant discovery or credential read"
    );
    if (scenario === "refresh") {
      check(
        saved.refresh_token === tokens.refresh_token,
        "Refresh token not rotated"
      );
    }
  }
} catch (error) {
  check(
    ["mismatch", "malformed", "unsafe"].includes(scenario),
    "Unexpected profile failure"
  );
  check(
    error instanceof CliError && error.code === "invalid_response",
    "Wrong profile error"
  );
  if (scenario === "unsafe") {
    check(profiles === 0, "Unsafe endpoint received token");
  } else {
    check(
      error instanceof CliError && error.requestId === "profile-id",
      "Missing profile request ID"
    );
  }
}
console.log(`Native profile ${scenario} passed.`);
process.exit(0);
