import { apiUrl } from "../api-options.ts";
import type { AuthFlow } from "../auth-flow.ts";
import type { OAuthResponse } from "../auth-types.ts";
import { CliError } from "../cli-error.ts";
import { HttpError } from "../http-error.ts";
import type { IdentityResponse, MeResponse, UserProfile } from "../identity.ts";
import {
  collectOrganizations,
  requireOrganizationCreator,
} from "../organizations.ts";
import type {
  Organization,
  OrganizationPage,
  CreateOrganizationInput,
  OrganizationResponse,
} from "../organizations.ts";
import { responseError } from "./native-protocol.ts";

export interface ApiTransport {
  get: (url: string, token: string) => Promise<OAuthResponse>;
  send: (
    url: string,
    token: string,
    method: string,
    body?: string
  ) => Promise<OAuthResponse>;
  post: (url: string, token: string, body: string) => Promise<OAuthResponse>;
}
export const apiOutput = (response: OAuthResponse): string => {
  if (response.status === 204) {
    return "";
  }
  try {
    return JSON.stringify(JSON.parse(response.body), null, 2);
  } catch {
    const detail = new HttpError(response.status, "", response.requestId);
    throw new CliError(
      "invalid_response",
      `Invalid JSON response.${detail.requestId ? ` Request ID: ${detail.requestId}` : ""}`,
      response.status,
      detail.requestId
    );
  }
};
interface AuthorizedResponse {
  response: OAuthResponse;
  token: string;
}

export class NativeApi {
  private readonly http: ApiTransport;
  private readonly auth: () => AuthFlow;
  private readonly key: string | undefined;
  constructor(http: ApiTransport, auth: () => AuthFlow, key?: string) {
    this.http = http;
    this.auth = auth;
    this.key = key;
  }
  async get(path: string, organization?: string): Promise<OAuthResponse> {
    const result = await this.request(
      apiUrl(path, organization),
      this.key ? undefined : this.auth()
    );
    return result.response;
  }
  async execute(
    path: string,
    method: string,
    body?: string,
    organization?: string
  ): Promise<OAuthResponse> {
    const result = await this.request(
      apiUrl(path, organization),
      this.key ? undefined : this.auth(),
      undefined,
      body,
      method
    );
    return result.response;
  }
  private send(
    url: string,
    token: string,
    method: string,
    body?: string
  ): Promise<OAuthResponse> {
    if (method === "GET") {
      return this.http.get(url, token);
    }
    if (method === "POST" && body !== undefined) {
      return this.http.post(url, token, body);
    }
    return this.http.send(url, token, method, body);
  }
  private async request(
    url: string,
    auth: AuthFlow | undefined,
    providedToken?: string,
    body?: string,
    method = body === undefined ? "GET" : "POST"
  ): Promise<AuthorizedResponse> {
    let token = providedToken || this.key;
    if (auth && !token) {
      token = await auth.accessToken();
    }
    if (!token) {
      throw new Error("Not signed in. Run inth login.");
    }
    let response = await this.send(url, token, method, body);
    if (response.status === 401 && auth) {
      token = await auth.accessToken(token);
      response = await this.send(url, token, method, body);
    }
    if (!response.ok) {
      throw await responseError(response);
    }
    return { response, token };
  }
  async getMe(includeProfile = false): Promise<IdentityResponse> {
    const auth = this.key ? undefined : this.auth();
    const result = await this.request(apiUrl("/v1/me"), auth);
    const value = NativeApi.parseMe(result.response);
    if (
      !includeProfile ||
      !auth ||
      value.data.principal.type === "api_key" ||
      !value.data.principal.userId
    ) {
      return value;
    }
    const endpoint = await auth.userInfoEndpoint();
    if (!endpoint) {
      return value;
    }
    const { response } = await this.request(endpoint, auth, result.token);
    try {
      // SAFETY: Scriptc validates required subject and optional profile field types.
      const profile = JSON.parse(response.body) as UserProfile;
      if (profile.sub !== value.data.principal.userId) {
        throw new Error("UserInfo subject does not match the API identity.");
      }
      return { ...value, profile };
    } catch {
      const detail = new HttpError(response.status, "", response.requestId);
      throw new CliError(
        "invalid_response",
        `Invalid user profile.${detail.requestId ? ` Request ID: ${detail.requestId}` : ""}`,
        response.status,
        detail.requestId
      );
    }
  }
  private static parseMe(response: OAuthResponse): MeResponse {
    try {
      // SAFETY: Scriptc checks the OpenAPI response record and nested field types at runtime.
      const value = JSON.parse(response.body) as MeResponse;
      // Checked casts validate field types, but Scriptc does not enforce string enums.
      if (
        !value.success ||
        !["session", "api_key", "oauth"].includes(value.data.principal.type)
      ) {
        throw new Error("Identity lookup failed.");
      }
      return value;
    } catch {
      const detail = new HttpError(response.status, "", response.requestId);
      throw new CliError(
        "invalid_response",
        `Invalid identity response.${detail.requestId ? ` Request ID: ${detail.requestId}` : ""}`,
        response.status,
        detail.requestId
      );
    }
  }
  async createOrganization(
    input: CreateOrganizationInput
  ): Promise<OrganizationResponse> {
    requireOrganizationCreator(this.key);
    const { response } = await this.request(
      apiUrl("/v1/organizations"),
      this.auth(),
      undefined,
      JSON.stringify(input)
    );
    try {
      // SAFETY: Scriptc validates the response record and organization field types.
      const value = JSON.parse(response.body) as OrganizationResponse;
      if (
        !value.success ||
        !value.data.id ||
        !value.data.name ||
        !value.data.slug ||
        value.data.role !== "owner"
      ) {
        throw new Error("Organization creation returned an invalid response.");
      }
      return value;
    } catch {
      const detail = new HttpError(response.status, "", response.requestId);
      throw new CliError(
        "invalid_response",
        `Invalid organization response.${detail.requestId ? ` Request ID: ${detail.requestId}` : ""}`,
        response.status,
        detail.requestId
      );
    }
  }
  organizations(): Promise<Organization[]> {
    return collectOrganizations((path) => this.organizationPage(path));
  }
  private async organizationPage(path: string): Promise<OrganizationPage> {
    const response = await this.get(path);
    try {
      // SAFETY: Scriptc checks required fields and each organization record at runtime.
      const value = JSON.parse(response.body) as OrganizationPage;
      if (!value.success) {
        throw new Error("Organization lookup failed.");
      }
      return value;
    } catch {
      const detail = new HttpError(response.status, "", response.requestId);
      throw new CliError(
        "invalid_response",
        `Invalid organization response.${detail.requestId ? ` Request ID: ${detail.requestId}` : ""}`,
        response.status,
        detail.requestId
      );
    }
  }
}
