/* eslint-disable require-await -- In-memory adapters exercise the compiled asynchronous auth flow. */
import "../../src/native/native-bindings.ts";
import { AgentAuth } from "../../src/agent-auth.ts";
import { parseAgentState } from "../../src/agent-protocol.ts";
import type { AgentHttp, AgentStore } from "../../src/agent-types.ts";
import { parseArguments } from "../../src/arguments.ts";
import type { OAuthResponse } from "../../src/auth-types.ts";
import { responseError } from "../../src/native/native-protocol.ts";

const check = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};
const issuer = "https://inth.com/api/auth";
const login = parseArguments([
  "login",
  "--email",
  "person@example.com",
  "--json",
]);
check(
  login.command === "auth" &&
    login.argument === "start" &&
    login.authMode === "agent",
  "Email login did not select resumable approval"
);
check(
  parseArguments(["login", "--complete", "--json"]).argument === "complete",
  "Login completion did not resume approval"
);
let saved: string | null = null;
let time = 1_800_000_000_000;
let exchanges = 0;
const response = (body: string, status = 200): OAuthResponse => ({
  body,
  ok: status < 400,
  requestId: null,
  status,
});
const store: AgentStore = {
  clear: async () => {
    saved = null;
  },
  exclusive: (work) => work(),
  read: async () => saved,
  write: async (value) => {
    saved = value;
  },
};
const http: AgentHttp = {
  clock: {
    now: () => time,
    sleep: async (ms) => {
      time += ms;
    },
  },
  error: responseError,
  form: async (_url, fields) => {
    check(
      fields.get("resource") === "https://api.inth.com",
      "Missing API audience"
    );
    exchanges += 1;
    if (exchanges === 1) {
      return response('{"error":"authorization_pending"}', 400);
    }
    if (exchanges === 2) {
      return response(
        '{"access_token":"native-access","identity_assertion":"native-assertion","assertion_expires":"2027-01-15T09:00:00.000Z","expires_in":900,"scope":"organizations.read","token_type":"Bearer"}'
      );
    }
    check(
      fields.get("assertion") === "native-assertion",
      "Wrong assertion renewal"
    );
    return response(
      '{"access_token":"native-renewed","expires_in":900,"scope":"organizations.read","token_type":"Bearer"}'
    );
  },
  get: async () => {
    throw new Error("Unexpected API request");
  },
  post: async (url) => {
    if (url === `${issuer}/agent/identity/claim`) {
      return response(
        '{"claim_attempt":{"user_code":"654321","verification_uri":"https://inth.com/dashboard/agent-auth/claim?claim_attempt_token=cla_retry#login_hint=person%40example.com","verification_uri_complete":"https://inth.com/dashboard/agent-auth/claim?claim_attempt_token=cla_retry&user_code=654321#login_hint=person%40example.com","expires_in":600,"interval":5}}'
      );
    }
    return response(
      '{"registration_id":"reg_native","registration_type":"service_auth","claim_token":"native-claim","claim_token_expires":"2027-01-16T08:00:00.000Z","post_claim_scopes":["organizations.read"],"claim":{"user_code":"123456","verification_uri":"https://inth.com/dashboard/agent-auth/claim?claim_attempt_token=cla_native#login_hint=person%40example.com","verification_uri_complete":"https://inth.com/dashboard/agent-auth/claim?claim_attempt_token=cla_native&user_code=123456#login_hint=person%40example.com","expires_in":600,"interval":5}}'
    );
  },
  request: async () =>
    response(
      JSON.stringify({
        agent_auth: {
          claim_endpoint: `${issuer}/agent/identity/claim`,
          identity_endpoint: `${issuer}/agent/identity`,
          identity_types_supported: ["service_auth"],
        },
        issuer,
        revocation_endpoint: `${issuer}/oauth2/revoke`,
        token_endpoint: `${issuer}/oauth2/token`,
      })
    ),
};
const started = await new AgentAuth(http, store).start("person@example.com", [
  "organizations.read",
]);
check(
  started.includes('"status":"pending"') &&
    started.includes("inth login --complete --wait --json") &&
    started.includes("&user_code=123456#login_hint=person%40example.com") &&
    !started.includes("native-claim"),
  "Claim leaked or status missing"
);
const restored = await new AgentAuth(http, store).status();
check(
  restored.includes("&user_code=123456#login_hint=person%40example.com"),
  "Saved approval link lost its login hint"
);
const retried = await new AgentAuth(http, store).retry();
check(
  retried.includes("&user_code=654321#login_hint=person%40example.com"),
  "Retried approval link lost its login hint"
);
const complete = await new AgentAuth(http, store).waitForApproval();
check(
  complete.includes('"status":"authenticated"') &&
    !complete.includes("native-access") &&
    !complete.includes("native-assertion"),
  "Token leaked or completion failed"
);
check(
  (await new AgentAuth(http, store).accessToken()) === "native-access",
  "Stored token was not used"
);
const assertionExpiry = parseAgentState((await store.read()) ?? "").credentials
  ?.assertionExpiresAt;
time += 900_000;
check(
  (await new AgentAuth(http, store).accessToken()) === "native-renewed",
  "Assertion renewal failed"
);
check(
  parseAgentState((await store.read()) ?? "").credentials
    ?.assertionExpiresAt === assertionExpiry,
  "Renewal extended the assertion"
);
check(exchanges === 3, "Unexpected claim replay");
console.log(
  "Native auth.md: resumable approval, private storage, API audience and assertion renewal passed."
);
