/* eslint-disable require-await -- In-memory adapters implement asynchronous storage and HTTP contracts. */
import { describe, expect, it } from "vitest";

import { AgentAuth } from "../src/agent-auth.ts";
import { agentEnvironment } from "../src/agent-environment.ts";
import {
  checkAgentClaim,
  parseAgentDiscovery,
  parseAgentRegistration,
  parseAgentState,
} from "../src/agent-protocol.ts";
import type { AgentHttp, AgentStore } from "../src/agent-types.ts";
import type { OAuthResponse } from "../src/auth-types.ts";
import { responseError } from "../src/native/native-protocol.ts";

const now = 1_800_000_000_000;
const issuer = "https://inth.com/api/auth";
const discovery = {
  agent_auth: {
    claim_endpoint: `${issuer}/agent/identity/claim`,
    identity_endpoint: `${issuer}/agent/identity`,
    identity_types_supported: ["service_auth"],
  },
  issuer,
  revocation_endpoint: `${issuer}/oauth2/revoke`,
  token_endpoint: `${issuer}/oauth2/token`,
};
const approvalBase =
  "https://inth.com/dashboard/agent-auth/claim?claim_attempt_token=cla_test";
const hint = "#login_hint=person%40example.com";
const claim = {
  expires_in: 600,
  interval: 5,
  user_code: "123456",
  verification_uri: `${approvalBase}${hint}`,
  verification_uri_complete: `${approvalBase}&user_code=123456${hint}`,
};
const registration = {
  claim,
  claim_token: "clm_secret",
  claim_token_expires: new Date(now + 86_400_000).toISOString(),
  post_claim_scopes: ["organizations.read"],
  registration_id: "reg_1",
  registration_type: "service_auth",
};
const response = <Body>(body: Body): OAuthResponse => ({
  body: JSON.stringify(body),
  ok: true,
  requestId: null,
  status: 200,
});
const unexpected = async (): Promise<OAuthResponse> => {
  throw new Error("Unexpected request");
};

describe("agent approval links", () => {
  it.each([true, false])(
    "preserves login hints through registration, retry, and saved-state loading, complete link: %s",
    async (completeLink) => {
      let saved: string | null = null;
      const initialClaim = {
        ...claim,
        verification_uri_complete: completeLink
          ? claim.verification_uri_complete
          : undefined,
      };
      const retriedClaim = {
        ...initialClaim,
        user_code: "654321",
        verification_uri: `${approvalBase}_retry${hint}`,
        verification_uri_complete: completeLink
          ? `${approvalBase}_retry&user_code=654321${hint}`
          : undefined,
      };
      const replies = [
        response({ ...registration, claim: initialClaim }),
        response({ claim_attempt: retriedClaim }),
      ];
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
          now: () => now,
          sleep: async () => {
            throw new Error("Unexpected poll");
          },
        },
        error: responseError,
        form: unexpected,
        get: unexpected,
        post: async () => {
          const reply = replies.shift();
          if (!reply) {
            throw new Error("Unexpected registration or retry");
          }
          return reply;
        },
        request: async () => response(discovery),
      };
      const initialLink =
        initialClaim.verification_uri_complete ?? initialClaim.verification_uri;
      const retriedLink =
        retriedClaim.verification_uri_complete ?? retriedClaim.verification_uri;
      expect(
        JSON.parse(
          await new AgentAuth(http, store).start("person@example.com", [
            "organizations.read",
          ])
        ).verificationUri
      ).toBe(initialLink);
      expect(
        parseAgentState((await store.read()) ?? "").pending?.verificationUri
      ).toBe(initialLink);
      expect(
        JSON.parse(await new AgentAuth(http, store).status()).verificationUri
      ).toBe(initialLink);
      expect(
        JSON.parse(await new AgentAuth(http, store).retry()).verificationUri
      ).toBe(retriedLink);
      expect(
        JSON.parse(await new AgentAuth(http, store).status()).verificationUri
      ).toBe(retriedLink);
      expect(replies).toHaveLength(0);
    }
  );

  it.each([
    "https://evil.example/claim#login_hint=person%40example.com",
    "http://inth.com/claim#login_hint=person%40example.com",
    "https://inth.com@evil.example/claim#login_hint=person%40example.com",
    "https://user:secret@inth.com/claim#login_hint=person%40example.com",
    "https://inth.com:444/claim#login_hint=person%40example.com",
    "https://INTH.com/claim#login_hint=person%40example.com",
    "https://inth.com:443/claim#login_hint=person%40example.com",
    "https://inth.com/../claim#login_hint=person%40example.com",
    "https://inth.com/claim#login_hint=person@example.com\n",
    "https://inth.com/claim#login_hint=person@example.com\\",
    "https://inth.com/claim#login_hint=person @example.com",
  ])("rejects unsafe or noncanonical approval URLs: %s", (url) => {
    for (const field of ["verification_uri", "verification_uri_complete"]) {
      expect(() =>
        parseAgentRegistration(
          JSON.stringify({ ...registration, claim: { ...claim, [field]: url } })
        )
      ).toThrow("Invalid auth.md response. Credentials were not displayed.");
    }
  });

  it("accepts login hints only on the configured local dashboard origin", () => {
    const environment = agentEnvironment(
      "https://api.localhost:8787",
      "https://dashboard.localhost:3000",
      "agent"
    );
    const localClaim = {
      ...claim,
      verification_uri: `https://dashboard.localhost:3000/claim${hint}`,
      verification_uri_complete: undefined,
    };
    expect(checkAgentClaim(localClaim, environment)).toEqual(localClaim);
    expect(() => checkAgentClaim(localClaim)).toThrow();
    expect(() => checkAgentClaim(claim, environment)).toThrow();
  });

  it("continues to reject fragments on every discovery endpoint", () => {
    for (const field of ["token_endpoint", "revocation_endpoint"]) {
      expect(() =>
        parseAgentDiscovery(
          JSON.stringify({ ...discovery, [field]: `${issuer}/endpoint${hint}` })
        )
      ).toThrow();
    }
    for (const field of ["identity_endpoint", "claim_endpoint"]) {
      expect(() =>
        parseAgentDiscovery(
          JSON.stringify({
            ...discovery,
            agent_auth: {
              ...discovery.agent_auth,
              [field]: `${issuer}/endpoint${hint}`,
            },
          })
        )
      ).toThrow();
    }
  });
});
