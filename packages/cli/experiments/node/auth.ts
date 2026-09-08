import { AuthFlow } from "../../src/auth-flow.ts";
import type { Credentials, OAuthResponse } from "../../src/auth-types.ts";
import type { HttpClient } from "./http.ts";
import { deviceSchema, discoverySchema, tokenSchema } from "./protocol.ts";

export type { LoginUI } from "../../src/auth-flow.ts";
export interface CredentialStore {
  read: () => Promise<Credentials | null>;
  write: (credentials: Credentials) => Promise<void>;
  clear: () => Promise<void>;
  exclusive: <T>(work: () => Promise<T>) => Promise<T>;
}

const capture = async (response: Response): Promise<OAuthResponse> => ({
  body: await response.text().catch(() => ""),
  ok: response.ok,
  requestId: response.headers.get("X-Request-Id"),
  status: response.status,
});
const restore = (response: OAuthResponse): Response =>
  new Response(response.body || null, {
    headers: response.requestId ? { "X-Request-Id": response.requestId } : {},
    status: response.status,
  });

export class Auth extends AuthFlow {
  constructor(http: HttpClient, store: CredentialStore) {
    super(
      {
        clock: http.clock,
        device: (response) => http.json(restore(response), deviceSchema),
        discovery: (response) => http.json(restore(response), discoverySchema),
        error: (response) => http.error(restore(response)),
        form: async (url, fields, deadline) =>
          capture(await http.form(url, fields, deadline)),
        request: async (url) => capture(await http.request(url)),
        tokens: (response) => http.json(restore(response), tokenSchema),
      },
      store
    );
  }
}
