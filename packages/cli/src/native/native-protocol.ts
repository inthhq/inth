/* eslint-disable anti-slop/no-runtime-typeof -- This native JSON boundary cannot use Zod; explicit field checks also validate Node callers. */
/* eslint-disable require-await -- Match the asynchronous OAuth error decoder contract. */
import type {
  OAuthResponse,
  Credentials,
  DeviceAuthorization,
  Discovery,
  Tokens,
} from "../auth-types.ts";
import { CliError } from "../cli-error.ts";
import { HttpError, safeRequestId } from "../http-error.ts";

// A 2xx response whose body failed validation. The body is never echoed.
export const invalidResponse = (
  response: OAuthResponse,
  message: string
): CliError => {
  const requestId = safeRequestId(response.requestId);
  return new CliError(
    "invalid_response",
    `${message}${requestId ? ` Request ID: ${requestId}` : ""}`,
    response.status,
    requestId
  );
};

// Scriptc validates the checked casts; explicit semantic checks also protect
// callers using Node. Native tests cover the compiled JSON boundaries.
export const httpsUrl = (value: string): boolean => {
  if (
    typeof value !== "string" ||
    !/^https:\/\/[^/?#@\\\s]+(?:[/?][^#\\\s]*)?$/u.test(value)
  ) {
    return false;
  }
  try {
    return new URL(value).href === value;
  } catch {
    return false;
  }
};
const positive = (value: number): boolean =>
  Number.isFinite(value) && value > 0;

export const parseCredentials = (text: string): Credentials => {
  // SAFETY: Scriptc validates the exact record's field types at this checked JSON boundary.
  const value = JSON.parse(text) as Credentials;
  if (
    typeof value.access_token !== "string" ||
    !value.access_token ||
    typeof value.refresh_token !== "string" ||
    !value.refresh_token ||
    !positive(value.expires_at)
  ) {
    throw new Error("Invalid saved credentials.");
  }
  return value;
};
export const parseDiscovery = (text: string): Discovery => {
  // SAFETY: Scriptc checks required fields and primitive types before constructing this record.
  const value = JSON.parse(text) as Discovery;
  if (
    !httpsUrl(value.issuer) ||
    !httpsUrl(value.device_authorization_endpoint) ||
    !httpsUrl(value.token_endpoint) ||
    !httpsUrl(value.revocation_endpoint) ||
    (value.userinfo_endpoint !== undefined &&
      !httpsUrl(value.userinfo_endpoint))
  ) {
    throw new Error("Invalid OAuth discovery.");
  }
  return value;
};
interface DeviceResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval?: number;
}
export const parseDevice = (text: string): DeviceAuthorization => {
  // SAFETY: Scriptc checks this record and the optional interval's type at runtime.
  const value = JSON.parse(text) as DeviceResponse;
  const interval = value.interval === undefined ? 5 : value.interval;
  if (
    typeof value.device_code !== "string" ||
    !value.device_code ||
    typeof value.user_code !== "string" ||
    !value.user_code ||
    !positive(value.expires_in) ||
    !positive(interval) ||
    !httpsUrl(value.verification_uri) ||
    !httpsUrl(value.verification_uri_complete)
  ) {
    throw new Error("Invalid device authorization.");
  }
  return {
    device_code: value.device_code,
    expires_in: value.expires_in,
    interval,
    user_code: value.user_code,
    verification_uri: value.verification_uri,
    verification_uri_complete: value.verification_uri_complete,
  };
};
interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  token_type: string;
}
export const parseTokens = (
  text: string,
  previousRefreshToken?: string | null
): Tokens => {
  // SAFETY: Scriptc validates this record's field types; semantic checks also run under Node.
  const value = JSON.parse(text) as TokenResponse;
  const refresh =
    value.refresh_token === undefined
      ? previousRefreshToken
      : value.refresh_token;
  if (
    typeof value.access_token !== "string" ||
    !value.access_token ||
    typeof refresh !== "string" ||
    !refresh ||
    !positive(value.expires_in) ||
    typeof value.token_type !== "string" ||
    value.token_type.toLowerCase() !== "bearer"
  ) {
    throw new Error("Invalid token response.");
  }
  return { ...value, refresh_token: refresh };
};
export const responseError = async (
  response: OAuthResponse
): Promise<HttpError> => {
  let code = "";
  try {
    // SAFETY: Scriptc checks the supported OAuth and public API error shapes.
    const body = JSON.parse(response.body) as {
      error: string | { code: string };
    };
    if (typeof body.error === "string") {
      code = body.error;
    } else if (body.error && typeof body.error.code === "string") {
      ({ code } = body.error);
    }
  } catch {
    code = "";
  }
  return new HttpError(response.status, code, response.requestId);
};
