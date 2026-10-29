import type { AccessTokenProvider } from "../agent-types.ts";
import { apiUrl } from "../api-options.ts";
import { API_ORIGIN } from "../auth-types.ts";
import type { OAuthResponse } from "../auth-types.ts";
import { CliError } from "../cli-error.ts";
import { downloadAccept } from "../download.ts";
import type { DownloadResult } from "../download.ts";
import { diagnosticStep } from "../error-diagnostics.ts";
import { safeRequestId } from "../http-error.ts";
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
import { telemetryUserId } from "../telemetry.ts";
import { invalidResponse, responseError } from "./native-protocol.ts";

export interface ApiTransport {
  putImage?: (
    url: string,
    token: string,
    bytes: Uint8Array,
    mediaType: string
  ) => Promise<OAuthResponse>;
  uploadChat?: (
    url: string,
    token: string,
    body: string
  ) => Promise<OAuthResponse>;
  get: (url: string, token: string) => Promise<OAuthResponse>;
  send: (
    url: string,
    token: string,
    method: string,
    body?: string,
    accept?: string,
    once?: boolean
  ) => Promise<OAuthResponse>;
  post: (url: string, token: string, body: string) => Promise<OAuthResponse>;
  download?: (
    url: string,
    token: string,
    accept?: string
  ) => Promise<OAuthResponse>;
}
export const apiOutput = (response: OAuthResponse): string => {
  diagnosticStep("api_decode");
  if (response.status === 204) {
    return "";
  }
  try {
    return JSON.stringify(JSON.parse(response.body), null, 2);
  } catch {
    throw invalidResponse(response, "Invalid JSON response.");
  }
};
interface AuthorizedResponse {
  response: OAuthResponse;
  token: string;
}

export class NativeApi {
  private readonly http: ApiTransport;
  private readonly auth: () => AccessTokenProvider;
  private readonly key: string | undefined;
  private readonly origin: string;
  private readonly observeIdentity: (token: string, userId: string) => void;
  constructor(
    http: ApiTransport,
    auth: () => AccessTokenProvider,
    key?: string,
    observeIdentity: (token: string, userId: string) => void = () => {
      // Identity observation is optional for API callers.
    },
    origin = API_ORIGIN
  ) {
    this.observeIdentity = observeIdentity;
    this.http = http;
    this.auth = auth;
    this.key = key;
    this.origin = origin;
  }
  async get(path: string, organization?: string): Promise<OAuthResponse> {
    const result = await this.request(
      apiUrl(path, organization, this.origin),
      this.key ? undefined : this.auth()
    );
    return result.response;
  }
  async execute(
    path: string,
    method: string,
    body?: string,
    organization?: string,
    accept = "application/json",
    once = false
  ): Promise<OAuthResponse> {
    const url = apiUrl(path, organization, this.origin);
    downloadAccept(accept);
    const result = await this.request(
      url,
      this.key ? undefined : this.auth(),
      undefined,
      body,
      method,
      accept,
      false,
      false,
      once
    );
    return result.response;
  }
  async putImage(
    path: string,
    bytes: Uint8Array,
    mediaType: string,
    organization?: string
  ): Promise<OAuthResponse> {
    if (this.key) {
      throw new CliError(
        "usage_error",
        "Image writes require a person's approved sign-in."
      );
    }
    const sendImage = this.http.putImage;
    if (!sendImage) {
      throw new Error("This API transport does not support image bytes.");
    }
    const url = apiUrl(path, organization, this.origin);
    const auth = this.auth();
    let token = await auth.accessToken(undefined, false);
    let response = await sendImage(url, token, bytes, mediaType);
    if (response.status === 401) {
      token = await auth.accessToken(token, false);
      response = await sendImage(url, token, bytes, mediaType);
    }
    if (!response.ok) {
      throw await responseError(response);
    }
    return response;
  }
  async uploadChat(body: string, organization?: string): Promise<string> {
    if (this.key) {
      throw new CliError(
        "usage_error",
        "Chat uploads require a person's approved sign-in."
      );
    }
    const { response } = await this.request(
      apiUrl("/v1/agent-chat-attachments", organization, this.origin),
      this.auth(),
      undefined,
      body,
      "POST",
      "application/json",
      false,
      true
    );
    return apiOutput(response);
  }
  async download(
    path: string,
    organization?: string,
    accept = "*/*"
  ): Promise<DownloadResult> {
    const url = apiUrl(path, organization, this.origin);
    downloadAccept(accept);
    const { response } = await this.request(
      url,
      this.key ? undefined : this.auth(),
      undefined,
      undefined,
      "GET",
      accept,
      true
    );
    if (response.bytes === undefined || response.contentType === undefined) {
      throw invalidResponse(
        response,
        "The API transport did not return download bytes."
      );
    }
    return {
      bytes: response.bytes,
      contentType: response.contentType,
      requestId: safeRequestId(response.requestId),
    };
  }
  private send(
    url: string,
    token: string,
    method: string,
    body?: string,
    accept = "application/json",
    download = false,
    upload = false,
    once = false
  ): Promise<OAuthResponse> {
    if (upload) {
      const sendUpload = this.http.uploadChat;
      if (!sendUpload) {
        throw new Error("This API transport does not support chat uploads.");
      }
      return sendUpload(url, token, body ?? "");
    }
    if (download) {
      const { download: read } = this.http;
      if (!read) {
        throw new Error("This API transport does not support downloads.");
      }
      return read(url, token, accept);
    }
    if (!once && method === "GET" && accept === "application/json") {
      return this.http.get(url, token);
    }
    if (
      !once &&
      method === "POST" &&
      body !== undefined &&
      accept === "application/json"
    ) {
      return this.http.post(url, token, body);
    }
    return this.http.send(url, token, method, body, accept, once);
  }
  private async request(
    url: string,
    auth: AccessTokenProvider | undefined,
    providedToken?: string,
    body?: string,
    method = body === undefined ? "GET" : "POST",
    accept = "application/json",
    download = false,
    upload = false,
    once = false
  ): Promise<AuthorizedResponse> {
    let token = providedToken || this.key;
    if (auth && !token) {
      token = await auth.accessToken(undefined, false);
    }
    if (!token) {
      throw new Error("Not signed in. Run inth login.");
    }
    let response = await this.send(
      url,
      token,
      method,
      body,
      accept,
      download,
      upload,
      once
    );
    if (response.status === 401 && auth) {
      token = await auth.accessToken(token, false);
      response = await this.send(
        url,
        token,
        method,
        body,
        accept,
        download,
        upload,
        once
      );
    }
    if (!response.ok) {
      throw await responseError(response);
    }
    return { response, token };
  }
  async getMe(includeProfile = false): Promise<IdentityResponse> {
    const auth = this.key ? undefined : this.auth();
    const result = await this.request(
      apiUrl("/v1/me", undefined, this.origin),
      auth
    );
    const value = NativeApi.parseMe(result.response);
    if (auth) {
      this.observeIdentity(result.token, telemetryUserId(value));
    }
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
    try {
      // SAFETY: Scriptc validates required subject and optional profile field types.
      const profile = JSON.parse(response.body) as UserProfile;
      if (profile.sub !== value.data.principal.userId) {
        throw new Error("UserInfo subject does not match the API identity.");
      }
      return { ...value, profile };
    } catch {
      throw invalidResponse(response, "Invalid user profile.");
    }
  }
  private static parseMe(response: OAuthResponse): MeResponse {
    try {
      // SAFETY: Scriptc checks the OpenAPI response record and nested field types at runtime.
      const value = JSON.parse(response.body) as MeResponse;
      // Accept additive principal types while rejecting empty discriminators.
      if (!value.success || !value.data.principal.type) {
        throw new Error("Identity lookup failed.");
      }
      return value;
    } catch {
      throw invalidResponse(response, "Invalid identity response.");
    }
  }
  async createOrganization(
    input: CreateOrganizationInput
  ): Promise<OrganizationResponse> {
    requireOrganizationCreator(this.key);
    const { response } = await this.request(
      apiUrl("/v1/organizations", undefined, this.origin),
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
      throw invalidResponse(response, "Invalid organization response.");
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
      throw invalidResponse(response, "Invalid organization response.");
    }
  }
}
