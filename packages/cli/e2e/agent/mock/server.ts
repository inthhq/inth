import { randomBytes, randomInt } from "node:crypto";
import { once } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:https";
import type { Server } from "node:https";

import { z } from "zod";

import { generateCertificate } from "./certificate.ts";

const CLAIM_GRANT = "urn:workos:agent-auth:grant-type:claim";
const JWT_BEARER_GRANT = "urn:ietf:params:oauth:grant-type:jwt-bearer";
const ACCESS_TOKEN_SECONDS = 900;
const ASSERTION_SECONDS = 3600;
const CLAIM_SECONDS = 600;
// A short interval keeps the browser test fast; the CLI accepts 1 to 3600.
const POLL_INTERVAL_SECONDS = 2;

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

interface Registration {
  id: string;
  email: string;
  scopes: string[];
  claimToken: string;
  claimTokenExpires: string;
  attemptToken: string;
  userCode: string;
  approved: boolean;
  exchanged: boolean;
  revoked: boolean;
}

interface Reply {
  body: string;
  status: number;
  type: string;
}

type Role = "api" | "dashboard";

export interface MockCounters {
  approvals: number;
  exchanges: number;
  identityRequests: number;
  pendingExchanges: number;
  renewals: number;
  revocations: number;
}

export interface MockAuthServer {
  apiOrigin: string;
  caPath: string;
  close: () => Promise<void>;
  counters: MockCounters;
  dashboardOrigin: string;
  userId: string;
}

const registrationRequest = z.object({
  login_hint: z.string().email(),
  scopes: z.array(z.string()).min(1),
  type: z.literal("service_auth"),
});
const retryRequest = z.object({
  claim_token: z.string().min(1),
  email: z.string().email(),
});

const token = (prefix: string): string =>
  `${prefix}_${randomBytes(18).toString("base64url")}`;
const userCode = (): string => String(randomInt(0, 1_000_000)).padStart(6, "0");
const isoAfter = (seconds: number): string =>
  new Date(Date.now() + seconds * 1000).toISOString();
const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const json = (value: JsonValue, status = 200): Reply => ({
  body: JSON.stringify(value),
  status,
  type: "application/json; charset=utf-8",
});
const html = (body: string, status = 200): Reply => ({
  body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Inth mock dashboard</title></head><body>${body}</body></html>`,
  status,
  type: "text/html; charset=utf-8",
});
const oauthError = (code: string, status = 400): Reply =>
  json({ error: code, error_description: code }, status);
const apiError = (code: string, status: number): Reply =>
  json({ error: { code, message: code } }, status);

const readBody = async (request: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
};

interface Listener {
  close: () => Promise<void>;
  origin: string;
}
const closeServer = (server: Server): Promise<void> =>
  // eslint-disable-next-line promise/avoid-new -- Adapt the close callback.
  new Promise((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  });
const listen = async (server: Server): Promise<Listener> => {
  // Bind every interface so the CLI reaches localhost over IPv4 or IPv6.
  server.listen(0);
  await once(server, "listening");
  const address = z.object({ port: z.number() }).parse(server.address());
  return {
    close: () => closeServer(server),
    origin: `https://localhost:${address.port}`,
  };
};

class MockState {
  apiOrigin = "";
  dashboardOrigin = "";
  readonly counters: MockCounters = {
    approvals: 0,
    exchanges: 0,
    identityRequests: 0,
    pendingExchanges: 0,
    renewals: 0,
    revocations: 0,
  };
  readonly userId = `user_${randomBytes(6).toString("hex")}`;
  private readonly registrations = new Map<string, Registration>();
  private readonly assertions = new Map<string, Registration>();
  private readonly accessTokens = new Map<string, Registration>();
  private get issuer(): string {
    return `${this.dashboardOrigin}/api/auth`;
  }
  private claim(registration: Registration): JsonValue {
    const base = new URL(`${this.dashboardOrigin}/dashboard/agent-auth/claim`);
    base.searchParams.set("claim_attempt_token", registration.attemptToken);
    const complete = new URL(base);
    complete.searchParams.set("user_code", registration.userCode);
    const hint = `#login_hint=${encodeURIComponent(registration.email)}`;
    return {
      expires_in: CLAIM_SECONDS,
      interval: POLL_INTERVAL_SECONDS,
      user_code: registration.userCode,
      verification_uri: `${base.href}${hint}`,
      verification_uri_complete: `${complete.href}${hint}`,
    };
  }
  discovery(): Reply {
    return json({
      agent_auth: {
        claim_endpoint: `${this.issuer}/agent/identity/claim`,
        identity_assertion_revocation_supported: true,
        identity_endpoint: `${this.issuer}/agent/identity`,
        identity_types_supported: ["service_auth"],
      },
      issuer: this.issuer,
      revocation_endpoint: `${this.issuer}/oauth2/revoke`,
      token_endpoint: `${this.issuer}/oauth2/token`,
    });
  }
  register(body: string): Reply {
    const parsed = registrationRequest.safeParse(JSON.parse(body));
    if (!parsed.success) {
      return oauthError("invalid_request");
    }
    const registration: Registration = {
      approved: false,
      attemptToken: token("cla"),
      claimToken: token("claim"),
      claimTokenExpires: isoAfter(86_400),
      email: parsed.data.login_hint,
      exchanged: false,
      id: token("reg"),
      revoked: false,
      scopes: parsed.data.scopes,
      userCode: userCode(),
    };
    this.registrations.set(registration.claimToken, registration);
    return json({
      claim: this.claim(registration),
      claim_token: registration.claimToken,
      claim_token_expires: registration.claimTokenExpires,
      post_claim_scopes: registration.scopes,
      registration_id: registration.id,
      registration_type: "service_auth",
    });
  }
  retry(body: string): Reply {
    const parsed = retryRequest.safeParse(JSON.parse(body));
    const registration = parsed.success
      ? this.registrations.get(parsed.data.claim_token)
      : undefined;
    if (
      !(parsed.success && registration) ||
      registration.email !== parsed.data.email ||
      registration.exchanged ||
      registration.revoked
    ) {
      return oauthError("invalid_grant");
    }
    registration.attemptToken = token("cla");
    registration.userCode = userCode();
    registration.approved = false;
    return json({ claim_attempt: this.claim(registration) });
  }
  private issueAccessToken(registration: Registration): string {
    const value = token("access");
    this.accessTokens.set(value, registration);
    return value;
  }
  token(body: string): Reply {
    const fields = new URLSearchParams(body);
    const grant = fields.get("grant_type");
    if (fields.get("resource") !== this.apiOrigin) {
      return oauthError("invalid_target");
    }
    if (grant === CLAIM_GRANT) {
      const registration = this.registrations.get(
        fields.get("claim_token") ?? ""
      );
      if (!registration || registration.exchanged || registration.revoked) {
        return oauthError("invalid_grant");
      }
      if (!registration.approved) {
        this.counters.pendingExchanges += 1;
        return oauthError("authorization_pending");
      }
      registration.exchanged = true;
      this.counters.exchanges += 1;
      const assertion = token("assertion");
      this.assertions.set(assertion, registration);
      return json({
        access_token: this.issueAccessToken(registration),
        assertion_expires: isoAfter(ASSERTION_SECONDS),
        expires_in: ACCESS_TOKEN_SECONDS,
        identity_assertion: assertion,
        scope: registration.scopes.join(" "),
        token_type: "bearer",
      });
    }
    if (grant === JWT_BEARER_GRANT) {
      const registration = this.assertions.get(fields.get("assertion") ?? "");
      if (!registration || registration.revoked) {
        return oauthError("invalid_grant");
      }
      this.counters.renewals += 1;
      return json({
        access_token: this.issueAccessToken(registration),
        expires_in: ACCESS_TOKEN_SECONDS,
        scope: registration.scopes.join(" "),
        token_type: "bearer",
      });
    }
    return oauthError("unsupported_grant_type");
  }
  revoke(body: string): Reply {
    const fields = new URLSearchParams(body);
    const value = fields.get("token") ?? "";
    const hint = fields.get("token_type_hint");
    this.counters.revocations += 1;
    if (hint === "identity_assertion") {
      const registration = this.assertions.get(value);
      if (registration) {
        registration.revoked = true;
      }
    } else if (hint === "auth_md_registration") {
      const registration = this.accessTokens.get(value);
      if (registration) {
        registration.revoked = true;
      }
    } else {
      this.accessTokens.delete(value);
    }
    // RFC 7009: unknown tokens still produce a successful response.
    return json({});
  }
  private approvalRegistration(attemptToken: string): Registration | undefined {
    return [...this.registrations.values()].find(
      (registration) => registration.attemptToken === attemptToken
    );
  }
  approvalPage(url: URL): Reply {
    const registration = this.approvalRegistration(
      url.searchParams.get("claim_attempt_token") ?? ""
    );
    if (!registration) {
      return html("<h1>Unknown approval request</h1>", 404);
    }
    return html(
      `<main><h1>Authorize this agent</h1><p>Signed in as ${escapeHtml(registration.email)}.</p><p>Approval code</p><p><strong>${registration.userCode}</strong></p><p>Requested permissions: ${escapeHtml(registration.scopes.join(", "))}</p><form method="post" action="/api/auth/agent/identity/claim/complete"><input type="hidden" name="claim_attempt_token" value="${escapeHtml(registration.attemptToken)}"><button type="submit">Authorize agent</button></form></main>`
    );
  }
  approve(body: string): Reply {
    const registration = this.approvalRegistration(
      new URLSearchParams(body).get("claim_attempt_token") ?? ""
    );
    if (!registration || registration.exchanged || registration.revoked) {
      return html("<h1>Unknown approval request</h1>", 404);
    }
    registration.approved = true;
    this.counters.approvals += 1;
    return html(
      "<main><h1>Agent authorized</h1><p>You can return to your terminal.</p></main>"
    );
  }
  private bearer(request: IncomingMessage): Registration | undefined {
    const header = request.headers.authorization ?? "";
    const registration = header.startsWith("Bearer ")
      ? this.accessTokens.get(header.slice("Bearer ".length))
      : undefined;
    return registration && !registration.revoked ? registration : undefined;
  }
  me(request: IncomingMessage): Reply {
    const registration = this.bearer(request);
    if (!registration) {
      return apiError("UNAUTHORIZED", 401);
    }
    this.counters.identityRequests += 1;
    return json({
      data: {
        activeOrganizationId: null,
        organizations: [
          { id: "org_mock", name: "Mock", role: "owner", slug: "mock" },
        ],
        principal: { type: "oauth", userId: this.userId },
        scopes: registration.scopes,
      },
      success: true,
    });
  }
  organizations(request: IncomingMessage): Reply {
    if (!this.bearer(request)) {
      return apiError("UNAUTHORIZED", 401);
    }
    return json({
      data: [{ id: "org_mock", name: "Mock", role: "owner", slug: "mock" }],
      success: true,
    });
  }
}

const route = async (
  state: MockState,
  role: Role,
  request: IncomingMessage
): Promise<Reply> => {
  const url = new URL(
    request.url ?? "/",
    role === "api" ? state.apiOrigin : state.dashboardOrigin
  );
  const key = `${request.method ?? "GET"} ${url.pathname}`;
  if (role === "api") {
    if (key === "GET /.well-known/oauth-authorization-server") {
      return state.discovery();
    }
    if (key === "GET /v1/me") {
      return state.me(request);
    }
    if (key === "GET /api/agent/organizations") {
      return state.organizations(request);
    }
    return apiError("NOT_FOUND", 404);
  }
  if (key === "GET /dashboard/agent-auth/claim") {
    return state.approvalPage(url);
  }
  const body = await readBody(request);
  switch (key) {
    case "POST /api/auth/agent/identity": {
      return state.register(body);
    }
    case "POST /api/auth/agent/identity/claim": {
      return state.retry(body);
    }
    case "POST /api/auth/agent/identity/claim/complete": {
      return state.approve(body);
    }
    case "POST /api/auth/oauth2/token": {
      return state.token(body);
    }
    case "POST /api/auth/oauth2/revoke": {
      return state.revoke(body);
    }
    default: {
      return apiError("NOT_FOUND", 404);
    }
  }
};

const handler =
  (state: MockState, role: Role) =>
  async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    let reply: Reply;
    try {
      reply = await route(state, role, request);
    } catch {
      reply = apiError("INTERNAL", 500);
    }
    response.writeHead(reply.status, {
      "Content-Length": Buffer.byteLength(reply.body),
      "Content-Type": reply.type,
    });
    response.end(reply.body);
  };

// Serves the API origin and the dashboard origin on two ephemeral HTTPS ports
// with a per-run certificate. Nothing here contacts Inth.
export const startMockAuthServer = async (): Promise<MockAuthServer> => {
  const certificate = await generateCertificate();
  const options = { cert: certificate.cert, key: certificate.key };
  const state = new MockState();
  const api = await listen(createServer(options, handler(state, "api")));
  const dashboard = await listen(
    createServer(options, handler(state, "dashboard"))
  );
  state.apiOrigin = api.origin;
  state.dashboardOrigin = dashboard.origin;
  return {
    apiOrigin: api.origin,
    caPath: certificate.caPath,
    close: async () => {
      await Promise.all([api.close(), dashboard.close()]);
      await certificate.remove();
    },
    counters: state.counters,
    dashboardOrigin: dashboard.origin,
    userId: state.userId,
  };
};
