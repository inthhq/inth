import { z } from "zod";

import type { AccessTokenProvider } from "../../src/agent-types.ts";
import { apiUrl } from "../../src/api-options.ts";
import { API_ORIGIN } from "../../src/auth-types.ts";
import { CliError } from "../../src/cli-error.ts";
import { HttpError } from "../../src/http-error.ts";
import type { IdentityResponse } from "../../src/identity.ts";
import {
  collectOrganizations,
  requireOrganizationCreator,
} from "../../src/organizations.ts";
import type {
  CreateOrganizationInput,
  Organization,
  OrganizationResponse,
} from "../../src/organizations.ts";
import type { HttpClient } from "./http.ts";
import { meSchema, userInfoSchema } from "./identity.ts";

export { apiUrl, apiKey } from "../../src/api-options.ts";

interface AuthorizedResponse {
  response: Response;
  token: string;
}

export class ApiClient {
  private readonly http: HttpClient;
  private readonly auth: () => Promise<AccessTokenProvider>;
  private readonly key: string | undefined;
  private readonly origin: string;
  constructor(
    http: HttpClient,
    auth: () => Promise<AccessTokenProvider>,
    key?: string,
    origin = API_ORIGIN
  ) {
    this.http = http;
    this.auth = auth;
    this.key = key;
    this.origin = origin;
  }
  async getMe(includeProfile = false): Promise<IdentityResponse> {
    const auth = this.key ? undefined : await this.auth();
    const result = await this.request(
      apiUrl("/v1/me", undefined, this.origin),
      auth
    );
    const value = await this.http.json(result.response, meSchema);
    if (
      !includeProfile ||
      !auth ||
      !["session", "oauth"].includes(value.data.principal.type) ||
      !value.data.principal.userId
    ) {
      return value;
    }
    const endpoint = await auth.userInfoEndpoint();
    if (!endpoint) {
      return value;
    }
    const { response } = await this.request(endpoint, auth, result.token);
    const profile = await this.http.json(response, userInfoSchema);
    if (profile.sub !== value.data.principal.userId) {
      const detail = new HttpError(
        response.status,
        "",
        response.headers.get("X-Request-Id")
      );
      throw new CliError(
        "invalid_response",
        `Invalid user profile.${detail.requestId ? ` Request ID: ${detail.requestId}` : ""}`,
        response.status,
        detail.requestId
      );
    }
    return { ...value, profile };
  }
  get(path: string, organizationId?: string): Promise<string> {
    return this.execute(path, "GET", undefined, organizationId);
  }
  async execute(
    path: string,
    method: string,
    body?: string,
    organizationId?: string
  ): Promise<string> {
    const { response } = await this.request(
      apiUrl(path, organizationId, this.origin),
      this.key ? undefined : await this.auth(),
      undefined,
      body,
      method
    );
    if (response.status === 204) {
      return "";
    }
    const value = await this.http.json(response, z.json());
    return JSON.stringify(value, null, 2);
  }
  organizations(): Promise<Organization[]> {
    return collectOrganizations(async (path) => {
      const { response } = await this.request(
        apiUrl(path, undefined, this.origin),
        this.key ? undefined : await this.auth()
      );
      return this.http.json(
        response,
        z.object({
          data: z.array(
            z.object({
              id: z.string().min(1).max(200),
              name: z.string(),
              role: z.string(),
              slug: z.string(),
            })
          ),
          pagination: z.object({
            hasMore: z.boolean(),
            nextCursor: z.string().nullable(),
          }),
          success: z.literal(true),
        })
      );
    });
  }
  async createOrganization(
    input: CreateOrganizationInput
  ): Promise<OrganizationResponse> {
    requireOrganizationCreator(this.key);
    const { response } = await this.request(
      apiUrl("/v1/organizations", undefined, this.origin),
      await this.auth(),
      undefined,
      JSON.stringify(input)
    );
    return this.http.json(
      response,
      z.object({
        data: z.object({
          id: z.string().min(1),
          name: z.string().min(1),
          role: z.literal("owner"),
          slug: z.string().min(1),
        }),
        success: z.literal(true),
      })
    );
  }
  private async request(
    url: string,
    auth: AccessTokenProvider | undefined,
    providedToken?: string,
    body?: string,
    method = body === undefined ? "GET" : "POST"
  ): Promise<AuthorizedResponse> {
    let token = providedToken || this.key;
    if (auth && !token) {
      token = await auth.accessToken();
    }
    if (!token) {
      throw new Error("No authentication token available. Run `inth login`.");
    }
    let response = await this.http.request(url, {
      body,
      headers:
        body === undefined
          ? { Accept: "application/json", Authorization: `Bearer ${token}` }
          : {
              Accept: "application/json",
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
      method,
    });
    if (response.status === 401 && auth) {
      await response.body?.cancel();
      token = await auth.accessToken(token);
      response = await this.http.request(url, {
        body,
        headers:
          body === undefined
            ? { Accept: "application/json", Authorization: `Bearer ${token}` }
            : {
                Accept: "application/json",
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
        method,
      });
    }
    return { response, token };
  }
}
