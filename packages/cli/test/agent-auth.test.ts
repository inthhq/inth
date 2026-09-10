/* eslint-disable require-await -- In-memory adapters implement async storage and HTTP contracts. */
import { describe, expect, it, vi } from "vitest";

import { AgentAuth } from "../src/agent-auth.ts";
import {
  runAgentCommand,
  requestedAgentScopes,
} from "../src/agent-commands.ts";
import { parseAgentDiscovery, parseAgentState } from "../src/agent-protocol.ts";
import type { AgentHttp, AgentStore } from "../src/agent-types.ts";
import { parseArguments } from "../src/arguments.ts";
import { API_ORIGIN, DISCOVERY_URL } from "../src/auth-types.ts";
import type { OAuthResponse } from "../src/auth-types.ts";
import { requireAgentCredentialSelection } from "../src/connection-selection.ts";
import { responseError } from "../src/native/native-protocol.ts";
import { reportError } from "../src/output.ts";

const issuer = "https://inth.com/api/auth";
const discovery = {
  agent_auth: {
    claim_endpoint: `${issuer}/agent/identity/claim`,
    identity_assertion_revocation_supported: true,
    identity_endpoint: `${issuer}/agent/identity`,
    identity_types_supported: ["service_auth"],
  },
  issuer,
  revocation_endpoint: `${issuer}/oauth2/revoke`,
  token_endpoint: `${issuer}/oauth2/token`,
};
const now = 1_800_000_000_000;
const claim = {
  expires_in: 600,
  interval: 5,
  user_code: "123456",
  verification_uri:
    "https://inth.com/dashboard/agent-auth/claim?claim_attempt_token=cla_test",
};
const registration = {
  claim,
  claim_token: "clm_secret",
  claim_token_expires: new Date(now + 86_400_000).toISOString(),
  post_claim_scopes: ["organizations.read"],
  registration_id: "reg_1",
  registration_type: "service_auth",
};
const tokens = {
  access_token: "access_secret",
  assertion_expires: new Date(now + 3_600_000).toISOString(),
  expires_in: 900,
  identity_assertion: "assertion_secret",
  scope: "organizations.read",
  token_type: "Bearer",
};
const response = <Body>(body: Body, status = 200): OAuthResponse => ({
  body: JSON.stringify(body),
  ok: status < 400,
  requestId: null,
  status,
});

const fixture = (onSleep?: (ms: number) => Promise<void>) => {
  let saved: string | null = null;
  let currentTime = now;
  let busyUntil = now;
  let lock = Promise.resolve(true);
  const replies: (OAuthResponse | Error)[] = [];
  const calls: { url: string; body?: string }[] = [];
  const delays = new Map<string, number>();
  const waits: number[] = [];
  const store: AgentStore = {
    clear: async () => {
      saved = null;
    },
    exclusive: async (work, deadline = Number.POSITIVE_INFINITY) => {
      const previous = lock;
      const deferred = Promise.withResolvers<boolean>();
      lock = deferred.promise;
      await previous;
      try {
        currentTime = Math.max(currentTime, Math.min(busyUntil, deadline));
        if (currentTime < busyUntil) {
          throw new Error("Cannot acquire the credential lock.");
        }
        await work();
      } finally {
        deferred.resolve(true);
      }
    },
    read: async () => saved,
    write: async (value) => {
      saved = value;
    },
  };
  const send = async (
    url: string,
    body?: string,
    deadline = Number.POSITIVE_INFINITY
  ): Promise<OAuthResponse> => {
    calls.push({ body, url });
    const delay = delays.get(url) ?? 0;
    const remaining = Math.max(0, deadline - currentTime);
    currentTime += Math.min(delay, remaining);
    if (delay > remaining) {
      throw new Error("Request timed out");
    }
    if (url === DISCOVERY_URL) {
      return response(discovery);
    }
    const reply = replies.shift();
    if (!reply) {
      throw new Error("Unexpected request");
    }
    if (reply instanceof Error) {
      throw reply;
    }
    return reply;
  };
  const http: AgentHttp = {
    clock: {
      now: () => currentTime,
      sleep: async (ms) => {
        if (onSleep) {
          await onSleep(ms);
        }
        waits.push(ms);
        currentTime += ms;
      },
    },
    error: responseError,
    form: (url, fields, deadline) => send(url, fields.toString(), deadline),
    get: (url) => send(url),
    post: (url, _token, body) => send(url, body),
    request: (url, deadline) => send(url, undefined, deadline),
  };
  return {
    advance: (ms: number) => {
      currentTime += ms;
    },
    auth: () => new AgentAuth(http, store),
    calls,
    delays,
    holdLockFor: (ms: number) => {
      busyUntil = currentTime + ms;
    },
    http,
    now: () => currentTime,
    read: () => saved,
    replies,
    store,
    waits,
  };
};
const start = async (f: ReturnType<typeof fixture>) => {
  f.replies.push(response(registration));
  return f.auth().start("person@example.com", ["organizations.read"]);
};
const signIn = async (f: ReturnType<typeof fixture>) => {
  await start(f);
  f.replies.push(response(tokens));
  return f.auth().complete();
};

describe("auth.md credentials", () => {
  it("uses the complete approval link for initial and retried claims", async () => {
    const f = fixture();
    const complete = `${claim.verification_uri}&user_code=123456`;
    f.replies.push(
      response({
        ...registration,
        claim: { ...claim, verification_uri_complete: complete },
      })
    );
    expect(
      JSON.parse(
        await f.auth().start("person@example.com", ["organizations.read"])
      ).verificationUri
    ).toBe(complete);
    const retryComplete = `${claim.verification_uri}&user_code=654321`;
    f.replies.push(
      response({
        claim_attempt: {
          ...claim,
          user_code: "654321",
          verification_uri_complete: retryComplete,
        },
      })
    );
    expect(JSON.parse(await f.auth().retry()).verificationUri).toBe(
      retryComplete
    );
    expect(JSON.parse(await f.auth().status()).verificationUri).toBe(
      retryComplete
    );
  });
  it.each([
    "https://evil.example/claim",
    "http://inth.com/claim",
    "https://inth.com@evil.example/claim",
  ])("rejects an unsafe complete approval link: %s", async (url) => {
    const f = fixture();
    f.replies.push(
      response({
        ...registration,
        claim: { ...claim, verification_uri_complete: url },
      })
    );
    await expect(
      f.auth().start("person@example.com", ["organizations.read"])
    ).rejects.toThrow();
    expect(f.read()).toBeNull();
  });
  it("resumes approval across commands, waits between polls and never prints secrets", async () => {
    const f = fixture();
    const pending = await start(f);
    expect(JSON.parse(pending)).toMatchObject({
      status: "pending",
      userCode: "123456",
      verificationUri: claim.verification_uri,
    });
    f.replies.push(
      response({ error: "authorization_pending" }, 400),
      response(tokens)
    );
    expect(JSON.parse(await f.auth().complete()).status).toBe("pending");
    const active = await f.auth().complete();
    expect(JSON.parse(active)).toMatchObject({
      scopes: ["organizations.read"],
      status: "authenticated",
    });
    const status = await f.auth().status();
    for (const secret of [
      registration.claim_token,
      tokens.access_token,
      tokens.identity_assertion,
      "person@example.com",
    ]) {
      expect(pending + active + status).not.toContain(secret);
    }
    expect(f.waits).toEqual([5000, 5000]);
    expect(parseAgentState(f.read() ?? "").pending).toBeUndefined();
    expect(
      f.calls
        .filter((call) => call.url === discovery.token_endpoint)
        .every(
          (call) =>
            new URLSearchParams(call.body).get("resource") === API_ORIGIN
        )
    ).toBe(true);
  });
  it("does not register again when the same claim is pending", async () => {
    const f = fixture();
    expect(await start(f)).toBe(
      await f.auth().start("PERSON@example.com", ["organizations.read"])
    );
    expect(
      f.calls.filter(
        (call) => call.url === discovery.agent_auth.identity_endpoint
      )
    ).toHaveLength(1);
  });
  it("serializes simultaneous single-use claim exchanges", async () => {
    const f = fixture();
    await start(f);
    f.replies.push(response(tokens));
    const results = await Promise.all([
      f.auth().complete(),
      f.auth().complete(),
    ]);
    expect(results[0]).toBe(results[1]);
    expect(
      f.calls.filter((call) => call.url === discovery.token_endpoint)
    ).toHaveLength(1);
  });
  it.each([
    new Error("connection lost"),
    response({ error: "invalid_grant" }, 400),
    response({ error: "server_error" }, 500),
    response({ access_token: "secret" }),
  ])("never replays a claim after an uncertain response", async (reply) => {
    const f = fixture();
    await start(f);
    f.replies.push(reply);
    await expect(f.auth().waitForApproval()).rejects.toThrow();
    await expect(f.auth().complete()).rejects.toMatchObject({
      code: "claim_uncertain",
    });
    await expect(f.auth().retry()).rejects.toMatchObject({
      code: "claim_uncertain",
    });
    expect(
      f.calls.filter((call) => call.url === discovery.token_endpoint)
    ).toHaveLength(1);
  });
  it("increases the polling interval on slow_down", async () => {
    const f = fixture();
    await start(f);
    f.replies.push(response({ error: "slow_down" }, 400), response(tokens));
    expect(JSON.parse(await f.auth().complete()).interval).toBe(10);
    await f.auth().complete();
    expect(f.waits).toEqual([5000, 10_000]);
  });
  it("replaces an expired code while preserving the claim token and outer deadline", async () => {
    const f = fixture();
    await start(f);
    f.advance(610_000);
    f.replies.push(
      response({ error: "expired_token" }, 400),
      response({ claim_attempt: { ...claim, user_code: "987654" } })
    );
    await expect(f.auth().complete()).rejects.toMatchObject({
      code: "authentication_expired",
    });
    expect(JSON.parse(await f.auth().retry()).userCode).toBe("987654");
    const saved = parseAgentState(f.read() ?? "").pending;
    expect(saved?.claimToken).toBe(registration.claim_token);
    expect(saved?.claimExpiresAt).toBe(now + 86_400_000);
  });
  it("can collect a previously approved claim after the code window", async () => {
    const f = fixture();
    await start(f);
    f.advance(610_000);
    f.replies.push(response(tokens));
    expect(JSON.parse(await f.auth().complete()).status).toBe("authenticated");
  });
  it("does not mark a claim uncertain when it expires during discovery", async () => {
    const f = fixture();
    await start(f);
    f.advance(86_399_000);
    f.delays.set(DISCOVERY_URL, 2000);
    await expect(f.auth().complete()).rejects.toMatchObject({
      code: "authentication_expired",
    });
    expect(parseAgentState(f.read() ?? "").pending?.exchanging).toBe(false);
    expect(
      f.calls.filter((call) => call.url === discovery.token_endpoint)
    ).toHaveLength(0);
  });
  it("refreshes once under concurrent use and preserves the assertion expiry", async () => {
    const f = fixture();
    await signIn(f);
    f.advance(900_000);
    f.replies.push(
      response({
        ...tokens,
        access_token: "renewed",
        assertion_expires: new Date(now + 86_400_000).toISOString(),
      })
    );
    expect(
      await Promise.all([f.auth().accessToken(), f.auth().accessToken()])
    ).toEqual(["renewed", "renewed"]);
    expect(
      parseAgentState(f.read() ?? "").credentials?.assertionExpiresAt
    ).toBe(now + 3_600_000);
    f.advance(3_600_000);
    await expect(f.auth().accessToken()).rejects.toMatchObject({
      code: "authentication_expired",
    });
  });
  it("discards revoked assertions without retrying", async () => {
    const f = fixture();
    await signIn(f);
    f.replies.push(response({ error: "invalid_grant" }, 400));
    await expect(f.auth().accessToken(undefined, true)).rejects.toMatchObject({
      code: "authentication_required",
    });
    expect(f.read()).toBeNull();
  });
  it("rejects registration scope downgrade instead of borrowing browser credentials", async () => {
    const f = fixture();
    f.replies.push(response(registration));
    await expect(
      f
        .auth()
        .start("person@example.com", ["organizations.read", "projects.write"])
    ).rejects.toMatchObject({ code: "insufficient_scope" });
    expect(f.read()).toBeNull();
  });
  it("rejects a token that adds permissions after approval", async () => {
    const f = fixture();
    await start(f);
    f.replies.push(
      response({ ...tokens, scope: "organizations.read projects.write" })
    );
    await expect(f.auth().complete()).rejects.toMatchObject({
      code: "claim_uncertain",
    });
  });
  it("revokes the registration and access token before clearing saved credentials", async () => {
    const f = fixture();
    await signIn(f);
    f.replies.push(response({}), response({}));
    await f.auth().logout();
    expect(f.read()).toBeNull();
    expect(
      f.calls
        .filter((call) => call.url === discovery.revocation_endpoint)
        .map((call) => new URLSearchParams(call.body).get("token_type_hint"))
    ).toEqual(["identity_assertion", "access_token"]);
  });
  it("honors Retry-After across separate claim commands", async () => {
    const f = fixture();
    await start(f);
    f.replies.push(
      { ...response({ error: "slow_down" }, 429), retryAfter: "60" },
      response(tokens)
    );
    await f.auth().complete();
    await f.auth().complete();
    expect(f.waits).toEqual([5000, 60_000]);
  });
  it("disconnects using its access token when the assertion has expired", async () => {
    const f = fixture();
    await signIn(f);
    f.advance(3_550_000);
    f.replies.push(response({ ...tokens, access_token: "last-access" }));
    await f.auth().accessToken(undefined, true);
    f.advance(60_000);
    f.replies.push(response({}), response({}));
    await f.auth().logout();
    const revoke = f.calls.find(
      (call) => call.url === discovery.revocation_endpoint
    );
    expect(new URLSearchParams(revoke?.body).get("token_type_hint")).toBe(
      "auth_md_registration"
    );
    expect(new URLSearchParams(revoke?.body).get("token")).toBe("last-access");
  });
  it("clears local credentials even when remote revocation fails", async () => {
    const f = fixture();
    await signIn(f);
    f.replies.push(response({ error: "server_error" }, 500));
    await expect(f.auth().logout()).rejects.toMatchObject({
      code: "revocation_failed",
    });
    expect(f.read()).toBeNull();
  });
  it("preserves invalid saved-state errors while clearing local credentials", async () => {
    const f = fixture();
    await f.store.write("corrupt saved state");
    await expect(f.auth().logout()).rejects.toMatchObject({
      code: "invalid_response",
    });
    expect(f.read()).toBeNull();
    expect(f.calls).toHaveLength(0);
  });
  it("preserves local read errors while still clearing local credentials", async () => {
    const f = fixture();
    await signIn(f);
    const error = new Error("Credential store is locked");
    vi.spyOn(f.store, "read").mockRejectedValueOnce(error);
    await expect(f.auth().logout()).rejects.toBe(error);
    expect(f.read()).toBeNull();
  });
  it("preserves discovery response details while clearing local credentials", async () => {
    const f = fixture();
    await signIn(f);
    vi.spyOn(f.http, "request").mockResolvedValueOnce({
      ...response({}),
      requestId: "discovery-123",
    });
    await expect(f.auth().logout()).rejects.toMatchObject({
      code: "invalid_response",
      httpStatus: 200,
      requestId: "discovery-123",
    });
    expect(f.read()).toBeNull();
    expect(
      f.calls.filter((call) => call.url === discovery.revocation_endpoint)
    ).toHaveLength(0);
  });
  it("preserves discovery network errors while clearing local credentials", async () => {
    const f = fixture();
    await signIn(f);
    const error = new Error("Cannot reach discovery");
    vi.spyOn(f.http, "request").mockRejectedValueOnce(error);
    await expect(f.auth().logout()).rejects.toBe(error);
    expect(f.read()).toBeNull();
  });
  it.each(["", "<html>upstream error</html>"])(
    "reports non-JSON organization responses with HTTP details: %s",
    async (body) => {
      const f = fixture();
      await signIn(f);
      f.replies.push({
        body,
        ok: true,
        requestId: "organizations-123",
        status: 200,
      });
      await expect(f.auth().organizations()).rejects.toMatchObject({
        code: "invalid_response",
        httpStatus: 200,
        requestId: "organizations-123",
      });
    }
  );
  it("preserves valid organization response text", async () => {
    const f = fixture();
    await signIn(f);
    const body = '{ "organizations": [{"id": "org_1"}] }';
    f.replies.push({ body, ok: true, requestId: null, status: 200 });
    expect(await f.auth().organizations()).toBe(body);
  });
  it.each([
    "https://attacker.test/token",
    "https://inth.com.evil.test/api/auth/token",
    "https://inth.com/api/auth/../token",
    "http://inth.com/api/auth/token",
  ])("rejects discovery endpoint %s", (token_endpoint) => {
    expect(() =>
      parseAgentDiscovery(JSON.stringify({ ...discovery, token_endpoint }))
    ).toThrow();
  });
});

describe("agent command selection", () => {
  it("requires explicit disclosure confirmation before registration", () => {
    expect(() =>
      parseArguments(["auth", "start", "--email", "person@example.com"])
    ).toThrow("--yes");
    expect(
      parseArguments([
        "auth",
        "start",
        "--email",
        "person@example.com",
        "--yes",
        "--json",
      ]).authMode
    ).toBe("agent");
  });
  it("refuses ambiguous API key selection and preserves browser defaults", () => {
    const options = parseArguments(["org", "list", "--auth", "agent"]);
    expect(() => requireAgentCredentialSelection(options, "inth_key")).toThrow(
      "INTH_TOKEN"
    );
    expect(parseArguments(["org", "list"]).authMode).toBeUndefined();
  });
  it("validates requested scopes", () => {
    expect(requestedAgentScopes()).toEqual(["organizations.read"]);
    expect(requestedAgentScopes("projects.write,projects.write")).toEqual([
      "projects.write",
    ]);
    expect(() => requestedAgentScopes("*")).toThrow("scopes");
  });
});

describe("waiting for browser approval", () => {
  it("bounds lock contention and resumes without sending a late exchange", async () => {
    const f = fixture();
    await start(f);
    f.holdLockFor(30_000);
    await expect(f.auth().waitForApproval(6000)).rejects.toMatchObject({
      code: "approval_timeout",
    });
    expect(f.now()).toBe(now + 6000);
    expect(parseAgentState(f.read() ?? "").pending?.exchanging).toBe(false);
    expect(
      f.calls.filter((call) => call.url === discovery.token_endpoint)
    ).toHaveLength(0);
    f.advance(24_000);
    f.replies.push(response(tokens));
    expect(JSON.parse(await f.auth().waitForApproval()).status).toBe(
      "authenticated"
    );
  });

  it("bounds slow discovery and preserves the claim for another process", async () => {
    const f = fixture();
    await start(f);
    f.delays.set(DISCOVERY_URL, 20_000);
    await expect(f.auth().waitForApproval(6000)).rejects.toMatchObject({
      code: "approval_timeout",
    });
    expect(f.now()).toBe(now + 6000);
    expect(parseAgentState(f.read() ?? "").pending?.exchanging).toBe(false);
    expect(
      f.calls.filter((call) => call.url === discovery.token_endpoint)
    ).toHaveLength(0);
    f.delays.clear();
    f.replies.push(response(tokens));
    expect(JSON.parse(await f.auth().waitForApproval()).status).toBe(
      "authenticated"
    );
  });

  it("does not send the claim when discovery uses the remaining wait time", async () => {
    const f = fixture();
    await start(f);
    f.delays.set(DISCOVERY_URL, 1000);
    await expect(f.auth().waitForApproval(6000)).rejects.toMatchObject({
      code: "approval_timeout",
    });
    expect(f.now()).toBe(now + 6000);
    expect(parseAgentState(f.read() ?? "").pending?.exchanging).toBe(false);
    expect(
      f.calls.filter((call) => call.url === discovery.token_endpoint)
    ).toHaveLength(0);
  });

  it("bounds a slow single-use exchange without replaying its uncertain result", async () => {
    const f = fixture();
    await start(f);
    f.delays.set(discovery.token_endpoint, 20_000);
    f.replies.push(response(tokens));
    await expect(f.auth().waitForApproval(6000)).rejects.toMatchObject({
      code: "claim_uncertain",
    });
    expect(f.now()).toBe(now + 6000);
    expect(parseAgentState(f.read() ?? "").pending?.exchanging).toBe(true);
    f.delays.clear();
    await expect(f.auth().waitForApproval()).rejects.toMatchObject({
      code: "claim_uncertain",
    });
    await expect(f.auth().retry()).rejects.toMatchObject({
      code: "claim_uncertain",
    });
    expect(
      f.calls.filter((call) => call.url === discovery.token_endpoint)
    ).toHaveLength(1);
  });

  it("saves a successful exchange even when its response reaches the deadline", async () => {
    const f = fixture();
    await start(f);
    f.delays.set(discovery.token_endpoint, 1000);
    f.replies.push(response(tokens));
    expect(JSON.parse(await f.auth().waitForApproval(6000)).status).toBe(
      "authenticated"
    );
    expect(f.now()).toBe(now + 6000);
    expect(parseAgentState(f.read() ?? "").credentials?.accessToken).toBe(
      tokens.access_token
    );
  });

  it("continues through pending, slow_down and rate limits without another command", async () => {
    const f = fixture();
    const pending = JSON.parse(await start(f));
    expect(pending.nextStep.command).toBe(
      "inth login --complete --wait --json"
    );
    f.replies.push(
      response({ error: "authorization_pending" }, 400),
      response({ error: "slow_down" }, 400),
      { ...response({ error: "rate_limit_exceeded" }, 429), retryAfter: "30" },
      response(tokens)
    );
    const output = await f.auth().waitForApproval();
    expect(JSON.parse(output).status).toBe("authenticated");
    expect(f.waits).toEqual([5000, 5000, 10_000, 30_000]);
    expect(output).not.toContain(tokens.access_token);
  });

  it("bounds the wait and resumes the saved claim across processes", async () => {
    const f = fixture();
    await start(f);
    f.replies.push({
      ...response({ error: "rate_limit_exceeded" }, 429),
      retryAfter: "60",
    });
    await expect(f.auth().waitForApproval(10_000)).rejects.toMatchObject({
      code: "approval_timeout",
    });
    expect(f.waits).toEqual([5000, 5000]);
    expect(parseAgentState(f.read() ?? "").pending?.exchanging).toBe(false);
    f.replies.push(response(tokens));
    expect(JSON.parse(await f.auth().waitForApproval()).status).toBe(
      "authenticated"
    );
    expect(f.waits.at(-1)).toBe(55_000);
  });

  it("serializes concurrent waiters without replaying a successful claim", async () => {
    const f = fixture();
    await start(f);
    f.replies.push(response(tokens));
    const outputs = await Promise.all([
      f.auth().waitForApproval(),
      f.auth().waitForApproval(),
    ]);
    expect(outputs[0]).toBe(outputs[1]);
    expect(
      f.calls.filter((call) => call.url === discovery.token_endpoint)
    ).toHaveLength(1);
  });

  it("allows logout while a waiter is sleeping", async () => {
    const f = fixture(async () => {
      await f.auth().logout();
    });
    await start(f);
    await expect(f.auth().waitForApproval()).rejects.toMatchObject({
      code: "authentication_required",
    });
    expect(
      f.calls.filter((call) => call.url === discovery.token_endpoint)
    ).toHaveLength(0);
  });

  it("preserves the claim if cancelled between polls", async () => {
    let cancelled = true;
    const f = fixture(() =>
      cancelled ? Promise.reject(new Error("cancelled")) : Promise.resolve()
    );
    await start(f);
    await expect(f.auth().waitForApproval()).rejects.toThrow("cancelled");
    expect(parseAgentState(f.read() ?? "").pending?.exchanging).toBe(false);
    cancelled = false;
    f.replies.push(response(tokens));
    expect(JSON.parse(await f.auth().waitForApproval()).status).toBe(
      "authenticated"
    );
  });

  it("reports denial in command JSON without selecting or replaying the claim", async () => {
    const f = fixture();
    await start(f);
    f.replies.push({
      ...response({ error: "access_denied" }, 400),
      requestId: "denial-request",
    });
    const select = vi.fn();
    const stdout = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const exitCode = await runAgentCommand(
        parseArguments(["login", "--complete", "--wait", "--json"]),
        f.auth(),
        select
      ).catch((error: Error) => reportError(true, error, false));
      expect(exitCode).toBe(1);
      expect(stdout).toHaveBeenCalledTimes(1);
      expect(JSON.parse(stdout.mock.lastCall?.[0] ?? "")).toMatchObject({
        error: {
          code: "access_denied",
          httpStatus: 400,
          message: expect.stringContaining("Sign-in was refused."),
          requestId: "denial-request",
        },
        ok: false,
      });
    } finally {
      stdout.mockRestore();
    }
    expect(select).not.toHaveBeenCalled();
    expect(
      f.calls.filter((call) => call.url === discovery.token_endpoint)
    ).toHaveLength(1);
  });

  it("never reports a fully expired connection as a completed sign-in", async () => {
    const f = fixture();
    await signIn(f);
    f.advance(3_600_000);
    await expect(f.auth().waitForApproval()).rejects.toMatchObject({
      code: "authentication_expired",
    });
  });

  it("selects only after approval, prints one final result and keeps selection after logout", async () => {
    const f = fixture();
    await start(f);
    f.replies.push(
      response({ error: "authorization_pending" }, 400),
      response(tokens)
    );
    let selection = "browser";
    const select = vi.fn(() => {
      selection = "agent";
      return Promise.resolve();
    });
    const output = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await runAgentCommand(
        parseArguments(["auth", "complete", "--json"]),
        f.auth(),
        select
      );
      expect(selection).toBe("browser");
      output.mockClear();
      await runAgentCommand(
        parseArguments(["login", "--complete", "--wait", "--json"]),
        f.auth(),
        select
      );
      expect(selection).toBe("agent");
      expect(output).toHaveBeenCalledTimes(1);
      expect(JSON.parse(output.mock.calls[0]?.[0]).data.status).toBe(
        "authenticated"
      );
      f.replies.push(response({}), response({}));
      await runAgentCommand(
        parseArguments(["logout", "--auth", "agent", "--json"]),
        f.auth(),
        select
      );
      expect(selection).toBe("agent");
      await expect(f.auth().accessToken()).rejects.toMatchObject({
        code: "authentication_required",
      });
    } finally {
      output.mockRestore();
    }
  });
});

it("can retry saving the connection after a successful single-use exchange", async () => {
  const f = fixture();
  await start(f);
  f.replies.push(response(tokens));
  const select = vi
    .fn<() => Promise<void>>()
    .mockRejectedValueOnce(new Error("disk unavailable"))
    .mockImplementation(() => Promise.resolve());
  const output = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    const args = parseArguments(["login", "--complete", "--wait", "--json"]);
    await expect(runAgentCommand(args, f.auth(), select)).rejects.toThrow(
      "disk unavailable"
    );
    expect(output).not.toHaveBeenCalled();
    await runAgentCommand(args, f.auth(), select);
    expect(select).toHaveBeenCalledTimes(2);
    expect(JSON.parse(output.mock.calls[0]?.[0]).data.status).toBe(
      "authenticated"
    );
    expect(
      f.calls.filter((call) => call.url === discovery.token_endpoint)
    ).toHaveLength(1);
  } finally {
    output.mockRestore();
  }
});
