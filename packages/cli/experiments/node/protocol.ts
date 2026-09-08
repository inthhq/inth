import { z } from "zod";

export {
  API_ORIGIN,
  CLIENT_ID,
  DISCOVERY_URL,
  SCOPE,
} from "../../src/auth-types.ts";
export type {
  Credentials,
  DeviceAuthorization,
  Discovery,
} from "../../src/auth-types.ts";

export const httpsUrl = z.url().refine((value) => {
  const url = new URL(value);
  return (
    url.protocol === "https:" &&
    url.href === value &&
    !url.username &&
    !url.password &&
    !url.hash
  );
}, "Expected an HTTPS URL without credentials or a fragment");

export const discoverySchema = z.object({
  device_authorization_endpoint: httpsUrl,
  issuer: httpsUrl,
  revocation_endpoint: httpsUrl,
  token_endpoint: httpsUrl,
  userinfo_endpoint: httpsUrl.optional(),
});

export const deviceSchema = z.object({
  device_code: z.string().min(1),
  expires_in: z.number().positive().finite(),
  interval: z.number().positive().finite().default(5),
  user_code: z.string().min(1),
  verification_uri: httpsUrl,
  verification_uri_complete: httpsUrl,
});

export const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive().finite(),
  refresh_token: z.string().min(1),
  token_type: z.string().refine((value) => value.toLowerCase() === "bearer"),
});
export const credentialsSchema = z.object({
  access_token: z.string().min(1),
  expires_at: z.number().positive().finite(),
  refresh_token: z.string().min(1),
});
