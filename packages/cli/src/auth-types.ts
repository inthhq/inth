import type { HttpError } from "./http-error.ts";

export const API_ORIGIN = "https://api.inth.com";
export const CLIENT_ID = "inth-cli";
export const DISCOVERY_URL = `${API_ORIGIN}/.well-known/oauth-authorization-server`;
// Matches the public API capability registry introduced in monorepo PR #1756.
export const CAPABILITIES = [
  "organizations.read",
  "organizations.write",
  "projects.read",
  "projects.write",
  "members.read",
  "members.write",
  "api-keys.read",
  "api-keys.write",
  "code-audit.read",
  "code-audit.write",
  "inbox.read",
  "inbox.write",
  "billing.read",
];
export const SCOPE = `openid profile email offline_access ${CAPABILITIES.join(" ")}`;

export interface Credentials {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}
export interface Tokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}
export interface Discovery {
  issuer: string;
  device_authorization_endpoint: string;
  token_endpoint: string;
  revocation_endpoint: string;
  userinfo_endpoint?: string;
}
export interface DeviceAuthorization {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}
export interface Clock {
  now: () => number;
  sleep: (milliseconds: number) => Promise<void>;
}
export interface AuthStore {
  read: () => Promise<Credentials | null>;
  write: (credentials: Credentials) => Promise<void>;
  clear: () => Promise<void>;
  exclusive: (work: () => Promise<void>) => Promise<void>;
}
export interface OAuthTransport {
  clock: Clock;
  request: (url: string) => Promise<OAuthResponse>;
  form: (
    url: string,
    fields: URLSearchParams,
    deadline: number
  ) => Promise<OAuthResponse>;
  discovery: (response: OAuthResponse) => Promise<Discovery>;
  device: (response: OAuthResponse) => Promise<DeviceAuthorization>;
  tokens: (
    response: OAuthResponse,
    previousRefreshToken: string | null
  ) => Promise<Tokens>;
  error: (response: OAuthResponse) => Promise<HttpError>;
}

export interface OAuthResponse {
  retryAfter?: string;
  ok: boolean;
  status: number;
  body: string;
  requestId: string | null;
}
