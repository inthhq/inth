import { productionAgentEnvironment } from "./agent-environment.ts";
import type { AgentEnvironment } from "./agent-environment.ts";
import {
  agentScopes,
  checkAgentClaim,
  parseAgentDiscovery,
  parseAgentRegistration,
  parseAgentState,
  parseAgentTokens,
} from "./agent-protocol.ts";
import type {
  AgentClaim,
  AgentCredentials,
  AgentDiscovery,
  AgentHttp,
  AgentPending,
  AgentRegistration,
  AgentState,
  AgentStore,
} from "./agent-types.ts";
import type { OAuthResponse } from "./auth-types.ts";
import { CliError } from "./cli-error.ts";

export class AgentAuth {
  private readonly http: AgentHttp;
  private readonly store: AgentStore;
  private readonly environment: AgentEnvironment;
  private metadata: AgentDiscovery | undefined;
  constructor(
    http: AgentHttp,
    store: AgentStore,
    environment = productionAgentEnvironment
  ) {
    this.http = http;
    this.store = store;
    this.environment = environment;
  }
  private async body(response: OAuthResponse): Promise<string> {
    if (!response.ok) {
      throw await this.http.error(response);
    }
    return response.body;
  }
  private requireApprovalTime(deadline: number): void {
    if (this.http.clock.now() >= deadline) {
      throw new CliError(
        "approval_timeout",
        "Still waiting for browser approval. Your sign-in is saved. Run inth login --complete --wait --json to resume waiting."
      );
    }
  }
  private requireClaimTime(pending: AgentPending): void {
    if (
      Math.max(this.http.clock.now(), pending.nextPollAt) >=
      pending.claimExpiresAt
    ) {
      throw new CliError(
        "authentication_expired",
        "The claim expired. Run inth logout --auth agent, then start again."
      );
    }
  }
  private async discover(
    deadline = Number.POSITIVE_INFINITY
  ): Promise<AgentDiscovery> {
    if (!this.metadata) {
      let response: OAuthResponse;
      try {
        response = await this.http.request(
          `${this.environment.apiOrigin}/.well-known/oauth-authorization-server`,
          deadline
        );
      } catch (error) {
        this.requireApprovalTime(deadline);
        throw error;
      }
      const body = await this.body(response);
      try {
        this.metadata = parseAgentDiscovery(body, this.environment);
      } catch {
        throw new CliError(
          "invalid_response",
          "Inth did not return supported auth.md discovery metadata.",
          response.status,
          response.requestId
        );
      }
    }
    return this.metadata;
  }
  private async read(): Promise<AgentState> {
    const raw = await this.store.read();
    if (raw === null) {
      return {};
    }
    try {
      return parseAgentState(raw, this.environment);
    } catch {
      throw new CliError(
        "invalid_response",
        "Saved auth.md credentials are invalid. Run inth logout --auth agent."
      );
    }
  }
  private write(state: AgentState): Promise<void> {
    return this.store.write(JSON.stringify(state));
  }
  private static pending(state: AgentState): AgentPending {
    if (!state.pending) {
      throw new CliError(
        "authentication_required",
        "Start auth.md sign-in with inth auth start --email <email> --yes."
      );
    }
    if (state.pending.exchanging) {
      throw new CliError(
        "claim_uncertain",
        "The single-use claim exchange may already have succeeded. Run inth logout --auth agent, then start a new claim. The saved claim will not be retried."
      );
    }
    return state.pending;
  }
  private static statusValue(state: AgentState, selected = false): string {
    const c = state.credentials;
    if (c) {
      return JSON.stringify({
        assertionExpiresAt: c.assertionExpiresAt,
        credentialPresent: true,
        credentialSource: "auth.md",
        expiresAt: c.expiresAt,
        nextStep: {
          command: selected
            ? "inth whoami --json"
            : "inth whoami --auth agent --json",
          instruction: selected
            ? "Signed in. This connection is selected for subsequent CLI commands."
            : "Saved agent credentials are available. Complete sign-in to select this connection, or use --auth agent explicitly.",
        },
        scopes: c.scopes,
        status: "authenticated",
        validated: false,
      });
    }
    const p = state.pending;
    if (p) {
      return JSON.stringify({
        credentialPresent: false,
        credentialSource: "auth.md",
        expiresAt: p.expiresAt,
        interval: p.interval,
        nextPollAt: p.nextPollAt,
        nextStep: {
          command: p.exchanging
            ? "inth logout --auth agent --json"
            : "inth login --complete --wait --json",
          instruction: p.exchanging
            ? "The approval exchange had an uncertain outcome. Disconnect and start sign-in again."
            : "Show verificationUri and userCode to the person, then immediately run the next command in a background terminal. It waits for approval and completes sign-in automatically; do not wait for the person to say done.",
        },
        scopes: p.scopes,
        status: p.exchanging ? "uncertain" : "pending",
        userCode: p.userCode,
        validated: false,
        verificationUri: p.verificationUri,
      });
    }
    return JSON.stringify({
      credentialPresent: false,
      credentialSource: "auth.md",
      expiresAt: null,
      status: "signed_out",
      validated: false,
    });
  }
  async status(selected = false): Promise<string> {
    let output = "";
    await this.store.exclusive(async () => {
      output = AgentAuth.statusValue(await this.read(), selected);
    }, Number.POSITIVE_INFINITY);
    return output;
  }
  async start(email: string, scopes: string[]): Promise<string> {
    const normalized = email.trim().toLowerCase();
    if (
      normalized.length > 320 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)
    ) {
      throw new CliError("usage_error", "Provide a valid email address.");
    }
    agentScopes(scopes);
    const metadata = await this.discover();
    let output = "";
    await this.store.exclusive(async () => {
      const current = await this.read();
      if (current.credentials) {
        throw new CliError(
          "usage_error",
          "An auth.md session is already saved. Run inth logout --auth agent before starting another."
        );
      }
      if (current.pending) {
        const p = AgentAuth.pending(current);
        if (p.email !== normalized || p.scopes.join(" ") !== scopes.join(" ")) {
          throw new CliError(
            "usage_error",
            "A different auth.md claim is pending. Complete it or run inth logout --auth agent first."
          );
        }
        output = AgentAuth.statusValue(current);
        return;
      }
      const startedAt = this.http.clock.now();
      const response = await this.http.post(
        metadata.agent_auth.identity_endpoint,
        "",
        JSON.stringify({ login_hint: normalized, scopes, type: "service_auth" })
      );
      const body = await this.body(response);
      let registration: AgentRegistration;
      try {
        registration = parseAgentRegistration(body, this.environment);
      } catch {
        throw new CliError(
          "invalid_response",
          "Invalid auth.md registration response.",
          response.status,
          response.requestId
        );
      }
      if (
        registration.post_claim_scopes.some((scope) => !scopes.includes(scope))
      ) {
        throw new CliError(
          "invalid_response",
          "The registration requested permissions you did not select."
        );
      }
      if (
        scopes.some((scope) => !registration.post_claim_scopes.includes(scope))
      ) {
        throw new CliError(
          "insufficient_scope",
          "The deployed auth.md server does not support all requested scopes. No broader credential was selected."
        );
      }
      const { claim } = registration;
      const state: AgentState = {
        pending: {
          claimExpiresAt: new Date(registration.claim_token_expires).getTime(),
          claimToken: registration.claim_token,
          email: normalized,
          exchanging: false,
          expiresAt: startedAt + claim.expires_in * 1000,
          interval: claim.interval,
          nextPollAt: this.http.clock.now() + claim.interval * 1000,
          registrationId: registration.registration_id,
          scopes,
          userCode: claim.user_code,
          verificationUri:
            claim.verification_uri_complete ?? claim.verification_uri,
        },
      };
      await this.write(state);
      output = AgentAuth.statusValue(state);
    }, Number.POSITIVE_INFINITY);
    return output;
  }
  private async exchangeClaim(
    endpoint: string,
    pending: AgentPending,
    deadline: number
  ): Promise<OAuthResponse> {
    try {
      return await this.http.form(
        endpoint,
        new URLSearchParams({
          claim_token: pending.claimToken,
          grant_type: "urn:workos:agent-auth:grant-type:claim",
          resource: this.environment.apiOrigin,
        }),
        Math.min(pending.claimExpiresAt, deadline)
      );
    } catch {
      throw new CliError(
        "claim_uncertain",
        "The claim exchange was interrupted and may have succeeded. Run inth logout --auth agent, then start again. This claim will not be replayed."
      );
    }
  }
  private requireActiveConnection(credentials: AgentCredentials): void {
    if (
      Math.max(credentials.expiresAt, credentials.assertionExpiresAt) <=
      this.http.clock.now()
    ) {
      throw new CliError(
        "authentication_expired",
        "Your connection expired. Run inth logout --auth agent, then inth login --email <email> --json to sign in again."
      );
    }
  }
  async complete(deadline = Number.POSITIVE_INFINITY): Promise<string> {
    // Sleep outside the lock so logout and another CLI process can proceed.
    const before = await this.read();
    if (before.pending && !before.pending.exchanging) {
      await this.http.clock.sleep(
        Math.max(
          0,
          Math.min(
            before.pending.nextPollAt,
            before.pending.claimExpiresAt,
            deadline
          ) - this.http.clock.now()
        )
      );
    }
    let output = "";
    let acquired = false;
    const completion = this.store.exclusive(async () => {
      acquired = true;
      const state = await this.read();
      if (state.credentials) {
        this.requireActiveConnection(state.credentials);
        output = AgentAuth.statusValue(state, true);
        return;
      }
      const p = AgentAuth.pending(state);
      this.requireClaimTime(p);
      this.requireApprovalTime(deadline);
      if (p.nextPollAt > this.http.clock.now()) {
        output = AgentAuth.statusValue(state);
        return;
      }
      const metadata = await this.discover(deadline);
      this.requireApprovalTime(deadline);
      this.requireClaimTime(p);
      // Persist before the single-use request. A crash or ambiguous network error cannot replay it.
      p.exchanging = true;
      await this.write(state);
      if (this.http.clock.now() >= Math.min(deadline, p.claimExpiresAt)) {
        // No exchange was sent, so the saved claim is still safe to resume.
        p.exchanging = false;
        await this.write(state);
        this.requireClaimTime(p);
        this.requireApprovalTime(deadline);
      }
      const issuedAt = this.http.clock.now();
      const response = await this.exchangeClaim(
        metadata.token_endpoint,
        p,
        deadline
      );
      if (!response.ok) {
        const error = await this.http.error(response);
        if (
          [
            "authorization_pending",
            "slow_down",
            "expired_token",
            "access_denied",
          ].includes(error.code) ||
          response.status === 429
        ) {
          p.exchanging = false;
          if (error.code === "slow_down") {
            p.interval += 5;
          }
          p.nextPollAt = this.http.clock.now() + p.interval * 1000;
          if (response.status === 429 && response.retryAfter) {
            const seconds = Number(response.retryAfter);
            const retryAt =
              Number.isFinite(seconds) && seconds >= 0
                ? this.http.clock.now() + seconds * 1000
                : new Date(response.retryAfter).getTime();
            if (Number.isFinite(retryAt)) {
              p.nextPollAt = Math.max(p.nextPollAt, retryAt);
            }
          }
          await this.write(state);
          if (
            error.code === "authorization_pending" ||
            error.code === "slow_down" ||
            response.status === 429
          ) {
            output = AgentAuth.statusValue(state);
            return;
          }
          if (error.code === "expired_token") {
            throw new CliError(
              "authentication_expired",
              "The approval code expired. Run inth auth retry.",
              error.status,
              error.requestId
            );
          }
          if (error.code === "access_denied") {
            throw new CliError(
              "access_denied",
              `Sign-in was refused. ${error.message}`,
              error.status,
              error.requestId
            );
          }
        }
        throw error;
      }
      let credentials: AgentCredentials;
      try {
        credentials = parseAgentTokens(response.body);
      } catch {
        throw new CliError(
          "claim_uncertain",
          "The claim succeeded but its credentials could not be decoded. Start a new claim; this claim cannot be retried."
        );
      }
      if (credentials.scopes.some((scope) => !p.scopes.includes(scope))) {
        throw new CliError(
          "claim_uncertain",
          "The issued token exceeds the approved scope request. Start a new claim."
        );
      }
      credentials.expiresAt += issuedAt;
      await this.write({ credentials });
      output = AgentAuth.statusValue({ credentials }, true);
    }, deadline);
    await completion.catch((error) => {
      if (!acquired) {
        this.requireApprovalTime(deadline);
      }
      throw error;
    });
    return output;
  }
  async waitForApproval(timeoutMs = 600_000): Promise<string> {
    const deadline = this.http.clock.now() + timeoutMs;
    for (;;) {
      // eslint-disable-next-line no-await-in-loop -- Each poll observes the saved server interval and releases the credential lock.
      const output = await this.complete(deadline);
      // SAFETY: This is the sanitized status produced by complete in both runtimes.
      const status = JSON.parse(output) as {
        status: string;
        expiresAt: number;
      };
      if (status.status === "authenticated") {
        return output;
      }
      if (status.expiresAt <= this.http.clock.now()) {
        throw new CliError(
          "authentication_expired",
          "The approval link expired. Run inth auth retry --json and show the new link, then resume waiting. Your setup can continue after sign-in."
        );
      }
    }
  }
  async retry(): Promise<string> {
    const metadata = await this.discover();
    let output = "";
    await this.store.exclusive(async () => {
      const state = await this.read();
      const p = AgentAuth.pending(state);
      if (this.http.clock.now() >= p.claimExpiresAt) {
        throw new CliError(
          "authentication_expired",
          "The claim expired. Run inth logout --auth agent, then start again."
        );
      }
      const now = this.http.clock.now();
      const response = await this.http.post(
        metadata.agent_auth.claim_endpoint,
        "",
        JSON.stringify({ claim_token: p.claimToken, email: p.email })
      );
      const body = await this.body(response);
      let claim: AgentClaim;
      try {
        // SAFETY: Scriptc checks the response record; claim validation also runs in Node.
        const value = JSON.parse(body) as { claim_attempt: AgentClaim };
        claim = checkAgentClaim(value.claim_attempt, this.environment);
      } catch {
        throw new CliError(
          "invalid_response",
          "Invalid replacement claim response."
        );
      }
      p.userCode = claim.user_code;
      p.verificationUri =
        claim.verification_uri_complete ?? claim.verification_uri;
      p.expiresAt = Math.min(p.claimExpiresAt, now + claim.expires_in * 1000);
      p.interval = claim.interval;
      p.nextPollAt = this.http.clock.now() + claim.interval * 1000;
      await this.write(state);
      output = AgentAuth.statusValue(state);
    }, Number.POSITIVE_INFINITY);
    return output;
  }
  // eslint-disable-next-line require-await, class-methods-use-this -- Match the token provider contract; agent tokens have no UserInfo endpoint.
  async userInfoEndpoint(): Promise<string | undefined> {
    return undefined;
  }
  async accessToken(
    rejectedToken?: string,
    forceRefresh = false
  ): Promise<string> {
    let token = "";
    await this.store.exclusive(async () => {
      const state = await this.read();
      const c = state.credentials;
      if (!c) {
        throw new CliError(
          "authentication_required",
          "No auth.md session. Run inth auth start --email <email> --yes, then inth auth complete."
        );
      }
      if (
        !forceRefresh &&
        c.expiresAt > this.http.clock.now() + 60_000 &&
        c.accessToken !== rejectedToken
      ) {
        token = c.accessToken;
        return;
      }
      if (c.assertionExpiresAt <= this.http.clock.now()) {
        throw new CliError(
          "authentication_expired",
          "The auth.md identity assertion expired. Run inth logout --auth agent, then start a new claim."
        );
      }
      const metadata = await this.discover();
      const issuedAt = this.http.clock.now();
      const response = await this.http.form(
        metadata.token_endpoint,
        new URLSearchParams({
          assertion: c.assertion,
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          resource: this.environment.apiOrigin,
        }),
        Number.POSITIVE_INFINITY
      );
      if (!response.ok) {
        const error = await this.http.error(response);
        if (error.code === "invalid_grant") {
          await this.store.clear();
          throw new CliError(
            "authentication_required",
            "The auth.md assertion expired or was revoked. Start a new claim.",
            response.status,
            response.requestId
          );
        }
        throw error;
      }
      let renewed: AgentCredentials;
      try {
        renewed = parseAgentTokens(response.body, c);
      } catch {
        throw new CliError(
          "invalid_response",
          "Invalid auth.md token renewal response.",
          response.status,
          response.requestId
        );
      }
      if (renewed.scopes.some((scope) => !c.scopes.includes(scope))) {
        throw new CliError(
          "invalid_response",
          "Token renewal unexpectedly increased auth.md permissions."
        );
      }
      renewed.expiresAt += issuedAt;
      await this.write({ credentials: renewed });
      token = renewed.accessToken;
    }, Number.POSITIVE_INFINITY);
    return token;
  }
  async organizations(): Promise<string> {
    let token = await this.accessToken();
    let response = await this.http.get(
      `${this.environment.apiOrigin}/api/agent/organizations`,
      token
    );
    if (response.status === 401) {
      token = await this.accessToken(token);
      response = await this.http.get(
        `${this.environment.apiOrigin}/api/agent/organizations`,
        token
      );
    }
    const body = await this.body(response);
    try {
      JSON.parse(body);
    } catch {
      throw new CliError(
        "invalid_response",
        "Inth returned an organization response that is not valid JSON.",
        response.status,
        response.requestId
      );
    }
    return body;
  }
  async logout(): Promise<void> {
    await this.store.exclusive(async () => {
      try {
        const state = await this.read();
        if (!state.credentials) {
          return;
        }
        const metadata = await this.discover();
        try {
          if (
            metadata.agent_auth.identity_assertion_revocation_supported === true
          ) {
            const assertionValid =
              state.credentials.assertionExpiresAt > this.http.clock.now();
            const revoked = await this.http.form(
              metadata.revocation_endpoint,
              new URLSearchParams({
                token: assertionValid
                  ? state.credentials.assertion
                  : state.credentials.accessToken,
                token_type_hint: assertionValid
                  ? "identity_assertion"
                  : "auth_md_registration",
              }),
              Number.POSITIVE_INFINITY
            );
            await this.body(revoked);
          }
          const response = await this.http.form(
            metadata.revocation_endpoint,
            new URLSearchParams({
              token: state.credentials.accessToken,
              token_type_hint: "access_token",
            }),
            Number.POSITIVE_INFINITY
          );
          await this.body(response);
        } catch {
          throw new CliError(
            "revocation_failed",
            "Local auth.md credentials were cleared, but remote revocation could not be confirmed."
          );
        }
      } finally {
        await this.store.clear();
      }
    }, Number.POSITIVE_INFINITY);
  }
}
