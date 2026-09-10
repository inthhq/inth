import type { Clock, OAuthResponse } from "./auth-types.ts";
import type { HttpError } from "./http-error.ts";

export interface AgentStore {
  read: () => Promise<string | null>;
  write: (value: string) => Promise<void>;
  clear: () => Promise<void>;
  exclusive: (work: () => Promise<void>, deadline: number) => Promise<void>;
}
export interface AgentHttp {
  clock: Clock;
  request: (url: string, deadline: number) => Promise<OAuthResponse>;
  post: (url: string, token: string, body: string) => Promise<OAuthResponse>;
  get: (url: string, token: string) => Promise<OAuthResponse>;
  form: (
    url: string,
    body: URLSearchParams,
    deadline: number
  ) => Promise<OAuthResponse>;
  error: (response: OAuthResponse) => Promise<HttpError>;
}
export interface AgentDiscovery {
  issuer: string;
  token_endpoint: string;
  revocation_endpoint: string;
  agent_auth: {
    identity_endpoint: string;
    claim_endpoint: string;
    identity_types_supported: string[];
    identity_assertion_revocation_supported?: boolean;
  };
}
export interface AgentClaim {
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval: number;
}
export interface AgentRegistration {
  registration_id: string;
  registration_type: string;
  claim_token: string;
  claim_token_expires: string;
  post_claim_scopes: string[];
  claim: AgentClaim;
}
export interface AgentPending {
  claimToken: string;
  email: string;
  registrationId: string;
  claimExpiresAt: number;
  expiresAt: number;
  interval: number;
  nextPollAt: number;
  userCode: string;
  verificationUri: string;
  scopes: string[];
  exchanging: boolean;
}
export interface AgentCredentials {
  accessToken: string;
  expiresAt: number;
  assertion: string;
  assertionExpiresAt: number;
  scopes: string[];
}
export interface AgentState {
  pending?: AgentPending;
  credentials?: AgentCredentials;
}
export interface AgentTokens {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  identity_assertion?: string;
  assertion_expires?: string;
}
export interface AccessTokenProvider {
  accessToken: (
    rejectedToken?: string,
    forceRefresh?: boolean
  ) => Promise<string>;
  userInfoEndpoint: () => Promise<string | undefined>;
}
