/* eslint-disable anti-slop/no-runtime-typeof -- Validate the shared Scriptc and Node JSON boundary without runtime dependencies. */
import { productionAgentEnvironment } from "./agent-environment.ts";
import type { AgentEnvironment } from "./agent-environment.ts";
import type {
  AgentClaim,
  AgentCredentials,
  AgentDiscovery,
  AgentRegistration,
  AgentState,
  AgentTokens,
} from "./agent-types.ts";
import { CAPABILITIES } from "./auth-types.ts";
import { CliError } from "./cli-error.ts";
import { httpsUrl } from "./native/native-protocol.ts";

export const AGENT_ISSUER = "https://inth.com/api/auth";
const invalid = (): never => {
  throw new CliError(
    "invalid_response",
    "Invalid auth.md response. Credentials were not displayed."
  );
};
const nonempty = (value: string): boolean =>
  typeof value === "string" && value.length > 0;
const positive = (value: number): boolean =>
  typeof value === "number" && Number.isFinite(value) && value > 0;
export const agentScopes = (value: string[]): string[] => {
  if (
    !Array.isArray(value) ||
    !value.length ||
    !value.every(
      (scope) => typeof scope === "string" && CAPABILITIES.includes(scope)
    )
  ) {
    invalid();
  }
  return value;
};
const endpoint = (value: string, environment: AgentEnvironment): boolean =>
  httpsUrl(value) &&
  value.startsWith(`${environment.dashboardOrigin}/api/auth/`);
export const parseAgentDiscovery = (
  body: string,
  environment = productionAgentEnvironment
): AgentDiscovery => {
  // SAFETY: Scriptc checks required record types; semantic checks run in both runtimes.
  const value = JSON.parse(body) as AgentDiscovery;
  if (
    !value ||
    value.issuer !== `${environment.dashboardOrigin}/api/auth` ||
    !endpoint(value.token_endpoint, environment) ||
    !endpoint(value.revocation_endpoint, environment) ||
    !value.agent_auth ||
    !endpoint(value.agent_auth.identity_endpoint, environment) ||
    !endpoint(value.agent_auth.claim_endpoint, environment) ||
    !Array.isArray(value.agent_auth.identity_types_supported) ||
    !value.agent_auth.identity_types_supported.includes("service_auth")
  ) {
    invalid();
  }
  return value;
};
export const checkAgentClaim = (
  value: AgentClaim,
  environment = productionAgentEnvironment
): AgentClaim => {
  if (
    !value ||
    typeof value.user_code !== "string" ||
    !/^\d{6}$/u.test(value.user_code) ||
    !httpsUrl(value.verification_uri) ||
    `https://${new URL(value.verification_uri).host}` !==
      environment.dashboardOrigin ||
    (value.verification_uri_complete !== undefined &&
      (!httpsUrl(value.verification_uri_complete) ||
        `https://${new URL(value.verification_uri_complete).host}` !==
          environment.dashboardOrigin)) ||
    !positive(value.expires_in) ||
    !positive(value.interval) ||
    value.interval > 3600
  ) {
    invalid();
  }
  return value;
};
export const parseAgentRegistration = (
  body: string,
  environment = productionAgentEnvironment
): AgentRegistration => {
  // SAFETY: Checked by Scriptc; validate secrets, scope inventory and dates in Node too.
  const value = JSON.parse(body) as AgentRegistration;
  if (
    !value ||
    !nonempty(value.registration_id) ||
    value.registration_type !== "service_auth" ||
    !nonempty(value.claim_token) ||
    !positive(new Date(value.claim_token_expires).getTime())
  ) {
    invalid();
  }
  checkAgentClaim(value.claim, environment);
  agentScopes(value.post_claim_scopes);
  return value;
};
export const parseAgentTokens = (
  body: string,
  previous?: AgentCredentials
): AgentCredentials => {
  // SAFETY: Scriptc validates the exact token response record before constructing it.
  const value = JSON.parse(body) as AgentTokens;
  if (
    !value ||
    !nonempty(value.access_token) ||
    !positive(value.expires_in) ||
    typeof value.token_type !== "string" ||
    value.token_type.toLowerCase() !== "bearer" ||
    typeof value.scope !== "string"
  ) {
    invalid();
  }
  const assertion = previous?.assertion ?? value.identity_assertion ?? "";
  const assertionExpiresAt =
    previous?.assertionExpiresAt ??
    new Date(value.assertion_expires ?? "").getTime();
  if (!nonempty(assertion) || !positive(assertionExpiresAt)) {
    invalid();
  }
  return {
    accessToken: value.access_token,
    assertion,
    assertionExpiresAt,
    expiresAt: value.expires_in * 1000,
    scopes: agentScopes(value.scope.split(" ").filter(Boolean)),
  };
};
export const parseAgentState = (
  body: string,
  environment = productionAgentEnvironment
): AgentState => {
  // SAFETY: Scriptc validates optional records; explicit checks also protect Node storage.
  const value = JSON.parse(body) as AgentState;
  if (!value || (!value.pending && !value.credentials)) {
    invalid();
  }
  if (value.pending) {
    const p = value.pending;
    if (
      !nonempty(p.claimToken) ||
      !nonempty(p.email) ||
      !nonempty(p.registrationId) ||
      !positive(p.claimExpiresAt) ||
      !positive(p.expiresAt) ||
      !positive(p.nextPollAt) ||
      typeof p.exchanging !== "boolean"
    ) {
      invalid();
    }
    checkAgentClaim(
      {
        expires_in: 1,
        interval: p.interval,
        user_code: p.userCode,
        verification_uri: p.verificationUri,
      },
      environment
    );
    agentScopes(p.scopes);
  }
  if (value.credentials) {
    const c = value.credentials;
    if (
      !nonempty(c.accessToken) ||
      !nonempty(c.assertion) ||
      !positive(c.expiresAt) ||
      !positive(c.assertionExpiresAt)
    ) {
      invalid();
    }
    agentScopes(c.scopes);
  }
  return value;
};
