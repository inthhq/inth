/* eslint-disable require-await -- Match the asynchronous OAuth error decoder contract. */
import type {
  OAuthResponse,
  Credentials,
  DeviceAuthorization,
  Discovery,
  Tokens,
} from "../auth-types.ts";
import { HttpError } from "../http-error.ts";

// This module is only executed by Scriptc. Its checked casts validate JSON fields
// at runtime, unlike TypeScript assertions in Node. Native tests cover bad inputs.
export const httpsUrl = (value: string): boolean => {
  if (!/^https:\/\/[^/?#@\\\s]+(?:[/?][^#\\\s]*)?$/u.test(value)) {
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
    !value.access_token ||
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
  const interval = value.interval ?? 5;
  if (
    !value.device_code ||
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
export const parseTokens = (text: string): Tokens => {
  // SAFETY: Scriptc validates all required field types; semantic constraints follow below.
  const value = JSON.parse(text) as Tokens;
  if (
    !value.access_token ||
    !value.refresh_token ||
    !positive(value.expires_in) ||
    value.token_type.toLowerCase() !== "bearer"
  ) {
    throw new Error("Invalid token response.");
  }
  return value;
};
export const responseError = async (
  response: OAuthResponse
): Promise<HttpError> => {
  let code = "";
  try {
    // SAFETY: Scriptc's checked cast throws for a non-object or a non-string error field.
    const body = JSON.parse(response.body) as { error: string };
    code = body.error;
  } catch {
    try {
      // SAFETY: Scriptc checks the public API error object's code field.
      const body = JSON.parse(response.body) as { error: { code: string } };
      ({ code } = body.error);
    } catch {
      code = "";
    }
  }
  return new HttpError(response.status, code, response.requestId);
};
