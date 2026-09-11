/* eslint-disable no-await-in-loop -- The device grant requires sequential, timed polling. */
import type { AccessTokenProvider } from "./agent-types.ts";
import { API_ORIGIN, CLIENT_ID, DISCOVERY_URL, SCOPE } from "./auth-types.ts";
import type {
  AuthStore,
  Clock,
  DeviceAuthorization,
  Discovery,
  OAuthTransport,
} from "./auth-types.ts";
import { CliError } from "./cli-error.ts";
import { HttpError } from "./http-error.ts";

export interface LoginUI {
  show: (device: DeviceAuthorization) => Promise<void>;
}

export class AuthFlow {
  private readonly http: OAuthTransport;
  private readonly store: AuthStore;
  private readonly clock: Clock;
  private metadata: Discovery | undefined;
  constructor(http: OAuthTransport, store: AuthStore) {
    this.http = http;
    this.store = store;
    this.clock = http.clock;
  }
  // Scriptc (SC2002) only accepts record literals for interface parameters, not class instances.
  tokenProvider(): AccessTokenProvider {
    return {
      accessToken: (rejected, force) => this.accessToken(rejected, force),
      userInfoEndpoint: () => this.userInfoEndpoint(),
    };
  }
  private async discover(): Promise<Discovery> {
    if (!this.metadata) {
      const response = await this.http.request(
        DISCOVERY_URL,
        Number.POSITIVE_INFINITY
      );
      this.metadata = await this.http.discovery(response);
    }
    return this.metadata;
  }
  async userInfoEndpoint(): Promise<string | undefined> {
    const metadata = await this.discover();
    const endpoint = metadata.userinfo_endpoint;
    if (!endpoint) {
      return undefined;
    }
    const url = new URL(endpoint);
    if (
      url.protocol !== "https:" ||
      url.host !== new URL(metadata.issuer).host
    ) {
      throw new CliError(
        "invalid_response",
        "Invalid OAuth UserInfo endpoint."
      );
    }
    return endpoint;
  }
  async login(ui: LoginUI): Promise<void> {
    const metadata = await this.discover();
    const startedAt = this.clock.now();
    const response = await this.http.form(
      metadata.device_authorization_endpoint,
      new URLSearchParams({
        client_id: CLIENT_ID,
        resource: API_ORIGIN,
        scope: SCOPE,
      }),
      Number.POSITIVE_INFINITY
    );
    const device = await this.http.device(response);
    const deadline = startedAt + device.expires_in * 1000;
    await ui.show(device);
    let interval = device.interval * 1000;
    while (this.clock.now() + interval < deadline) {
      await this.clock.sleep(interval);
      const issuedAt = this.clock.now();
      const poll = await this.http.form(
        metadata.token_endpoint,
        new URLSearchParams({
          client_id: CLIENT_ID,
          device_code: device.device_code,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          resource: API_ORIGIN,
        }),
        deadline
      );
      if (poll.ok) {
        const tokens = await this.http.tokens(poll, null);
        await this.store.exclusive(() =>
          this.store.write({
            access_token: tokens.access_token,
            expires_at: issuedAt + tokens.expires_in * 1000,
            refresh_token: tokens.refresh_token,
          })
        );
        return;
      }
      const error = await this.http.error(poll);
      if (error.code === "authorization_pending") {
        continue;
      }
      if (error.code === "slow_down") {
        interval += 5000;
        continue;
      }
      if (error.code === "access_denied") {
        throw new CliError(
          "access_denied",
          `Sign-in was refused. ${error.message}`,
          error.status,
          error.requestId
        );
      }
      if (error.code === "expired_token") {
        throw new CliError(
          "authentication_expired",
          `The approval code expired. Run \`inth login\` to start again. ${error.message}`,
          error.status,
          error.requestId
        );
      }
      throw error;
    }
    throw new CliError(
      "authentication_expired",
      "The approval code expired. Run `inth login` to start again."
    );
  }
  refresh(): Promise<string> {
    return this.accessToken(undefined, true);
  }
  async accessToken(
    rejectedToken?: string,
    forceRefresh = false
  ): Promise<string> {
    let access = "";
    await this.store.exclusive(async () => {
      const current = await this.store.read();
      if (!current) {
        throw new CliError(
          "authentication_required",
          "You are not signed in. Run `inth login` or set INTH_TOKEN."
        );
      }
      if (
        !forceRefresh &&
        current.expires_at > this.clock.now() + 60_000 &&
        current.access_token !== rejectedToken
      ) {
        access = current.access_token;
        return;
      }
      const metadata = await this.discover();
      const issuedAt = this.clock.now();
      const response = await this.http.form(
        metadata.token_endpoint,
        new URLSearchParams({
          client_id: CLIENT_ID,
          grant_type: "refresh_token",
          refresh_token: current.refresh_token,
          resource: API_ORIGIN,
        }),
        Number.POSITIVE_INFINITY
      );
      if (!response.ok) {
        const error = await this.http.error(response);
        if (error.code === "invalid_grant") {
          await this.store.clear();
          throw new CliError(
            "authentication_required",
            `Your sign-in expired or was revoked. Run \`inth login\` again. ${error.message}`,
            error.status,
            error.requestId
          );
        }
        throw error;
      }
      const tokens = await this.http.tokens(response, current.refresh_token);
      await this.store.write({
        access_token: tokens.access_token,
        expires_at: issuedAt + tokens.expires_in * 1000,
        refresh_token: tokens.refresh_token,
      });
      access = tokens.access_token;
    });
    return access;
  }
  async logout(): Promise<void> {
    await this.store.exclusive(async () => {
      try {
        const current = await this.store.read();
        if (!current) {
          return;
        }
        const metadata = await this.discover();
        const response = await this.http.form(
          metadata.revocation_endpoint,
          new URLSearchParams({
            client_id: CLIENT_ID,
            token: current.refresh_token,
            token_type_hint: "refresh_token",
          }),
          Number.POSITIVE_INFINITY
        );
        if (!response.ok) {
          throw await this.http.error(response);
        }
      } catch (error) {
        const detail = error instanceof HttpError ? ` ${error.message}` : "";
        // eslint-disable-next-line preserve-caught-error -- Scriptc cannot compile Error.cause; the sanitized HTTP detail is preserved above.
        throw new CliError(
          "revocation_failed",
          `Local credentials cleared, but remote sign-out could not be confirmed. Revoke this CLI session in the dashboard.${detail}`,
          error instanceof HttpError ? error.status : null,
          error instanceof HttpError ? error.requestId : null
        );
      } finally {
        await this.store.clear();
      }
    });
  }
}
