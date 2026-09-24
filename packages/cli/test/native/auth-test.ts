/* eslint-disable complexity -- The sequential native auth fixture covers protocol scenarios within one cleanup scope. */
/* eslint-disable max-classes-per-file -- Clock and HTTP fixtures belong to this compiled protocol test. */
/* eslint-disable no-await-in-loop -- Each scenario must finish before reusing the isolated Keychain account. */
/* eslint-disable require-await -- Async fixture methods implement the production OAuth transport contract. */
/* eslint-disable class-methods-use-this -- Parsing methods implement the same transport interface as the live adapter. */
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
// eslint-disable-next-line unicorn/import-style -- Scriptc requires named node:path imports.
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";

import {
  runWithCleanup,
  removeOptionalFile,
} from "../../scripts/native-cleanup.ts";
import { AuthFlow } from "../../src/auth-flow.ts";
import type {
  AuthStore,
  OAuthResponse,
  Clock,
  DeviceAuthorization,
  Discovery,
  OAuthTransport,
  Tokens,
} from "../../src/auth-types.ts";
import type { HttpError } from "../../src/http-error.ts";
import { removeDirectory } from "../../src/native/native-bindings.ts";
import { NativeKeychain } from "../../src/native/native-keychain.ts";
import {
  httpsUrl,
  parseDevice,
  parseDiscovery,
  parseTokens,
  responseError,
} from "../../src/native/native-protocol.ts";
import { NativeStore } from "../../src/native/native-store.ts";

const check = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};
class TestClock implements Clock {
  time = 1_000_000;
  waits: number[] = [];
  now(): number {
    return this.time;
  }
  async sleep(milliseconds: number): Promise<void> {
    this.time += milliseconds;
    this.waits.push(milliseconds);
  }
}
const discovery =
  '{"issuer":"https://dashboard.example/auth","device_authorization_endpoint":"https://dashboard.example/device-start","token_endpoint":"https://dashboard.example/exchange","revocation_endpoint":"https://dashboard.example/revoke"}';
const device =
  '{"device_code":"test-device","user_code":"ABCD","verification_uri":"https://dashboard.example/approve","verification_uri_complete":"https://dashboard.example/approve?code=ABCD","expires_in":600,"interval":5}';
const token = (access: string, refresh: string): string =>
  JSON.stringify({
    access_token: access,
    expires_in: 900,
    refresh_token: refresh,
    token_type: "Bearer",
  });
class ScriptedHttp implements OAuthTransport {
  clock: TestClock = new TestClock();
  private steps: OAuthResponse[];
  private position = 0;
  calls: string[] = [];
  constructor(steps: OAuthResponse[]) {
    this.steps = steps;
  }
  transport(): OAuthTransport {
    return {
      clock: {
        now: () => this.clock.now(),
        sleep: (ms) => this.clock.sleep(ms),
      },
      device: (value) => this.device(value),
      discovery: (value) => this.discovery(value),
      error: (value) => this.error(value),
      form: (url, fields, _deadline) => this.form(url, fields),
      request: (url) => this.request(url),
      tokens: (value, previousRefreshToken) =>
        this.tokens(value, previousRefreshToken),
    };
  }
  async request(url: string): Promise<OAuthResponse> {
    check(
      url === "https://api.inth.com/.well-known/oauth-authorization-server",
      "Wrong discovery URL."
    );
    this.calls.push(url);
    return this.next();
  }
  private next(): OAuthResponse {
    if (this.position >= this.steps.length) {
      throw new Error("Unexpected HTTP request.");
    }
    const result = this.steps[this.position];
    if (!result) {
      throw new Error("Missing scripted HTTP response.");
    }
    this.position += 1;
    return result;
  }
  async form(url: string, fields: URLSearchParams): Promise<OAuthResponse> {
    check(fields.get("client_id") === "inth-cli", "Missing client ID.");
    if (url !== "https://dashboard.example/revoke") {
      check(
        fields.get("resource") === "https://api.inth.com",
        "Missing resource."
      );
    }
    this.calls.push(`${url}?${fields.toString()}`);
    return this.next();
  }
  async discovery(response: OAuthResponse): Promise<Discovery> {
    return parseDiscovery(response.body);
  }
  async device(response: OAuthResponse): Promise<DeviceAuthorization> {
    return parseDevice(response.body);
  }
  async tokens(
    response: OAuthResponse,
    previousRefreshToken?: string | null
  ): Promise<Tokens> {
    return parseTokens(response.body, previousRefreshToken);
  }
  error(response: OAuthResponse): Promise<HttpError> {
    return responseError(response);
  }
}
const response = (body: string, status = 200): OAuthResponse => ({
  body,
  ok: status >= 200 && status < 300,
  requestId: "native-test",
  status,
});
const directory = join(tmpdir(), `inth-native-auth-${randomUUID()}`);
await mkdir(directory, { mode: 0o700 });
const entry = new NativeKeychain("com.inth.cli.native-test", randomUUID());
const store = new NativeStore(entry, join(directory, "credentials.lock"));
const approve = {
  show: async (value: DeviceAuthorization): Promise<void> => {
    check(value.user_code === "ABCD", "Wrong approval code.");
  },
};
await runWithCleanup(async () => {
  await removeOptionalFile(join(directory, "never-created.lock"));
  const http = new ScriptedHttp([
    response(discovery),
    response(device),
    response('{"error":"authorization_pending"}', 400),
    response('{"error":"slow_down"}', 400),
    response(token("first", "refresh-first")),
    response(token("second", "refresh-second")),
    response(""),
  ]);
  const auth = new AuthFlow(http.transport(), store.adapter());
  await auth.login(approve);
  check(
    http.clock.waits.join(",") === "5000,5000,10000",
    "Incorrect polling or slow_down interval."
  );
  const saved = await store.read();
  check(saved !== null, "Login did not persist credentials.");
  check(
    (http.calls[1] ?? "").includes(
      "scope=openid+profile+email+offline_access+organizations.read+organizations.write+projects.read+projects.write+members.read+members.write+api-keys.read+api-keys.write+code-audit.read+code-audit.write+inbox.read+inbox.write+billing.read"
    ),
    "Missing requested scopes."
  );
  check(
    (http.calls[2] ?? "").includes(
      "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code"
    ),
    "Wrong device grant."
  );
  const { clock } = http;
  clock.time += 850_000;
  const otherStore = new NativeStore(
    entry,
    join(directory, "credentials.lock")
  );
  const otherAuth = new AuthFlow(http.transport(), otherStore.adapter());
  const jobs: Promise<string>[] = [auth.accessToken(), otherAuth.accessToken()];
  const access = await Promise.all(jobs);
  check(
    access[0] === "second" && access[1] === "second",
    "Concurrent refresh failed."
  );
  check(http.calls.length === 6, "Concurrent calls rotated more than once.");
  check(
    (http.calls[5] ?? "").includes("refresh_token=refresh-first"),
    "Refresh used wrong credential."
  );
  await auth.logout();
  check(
    (http.calls[6] ?? "").includes("token=refresh-second"),
    "Logout did not revoke rotated token."
  );
  check((await store.read()) === null, "Logout did not clear credentials.");
  console.log(
    "Static auth: discovery, pending, slow_down, device grant, Keychain, concurrent refresh and logout passed."
  );

  const errors = ["access_denied", "expired_token"];
  for (const code of errors) {
    const denied = new AuthFlow(
      new ScriptedHttp([
        response(discovery),
        response(device),
        response(JSON.stringify({ error: code }), 400),
      ]).transport(),
      store.adapter()
    );
    let rejected = false;
    try {
      await denied.login(approve);
    } catch (error) {
      rejected =
        error instanceof Error &&
        error.message.includes(code) &&
        error.message.includes("native-test");
    }
    check(
      rejected && (await store.read()) === null,
      "Device denial/expiry was not handled."
    );
  }
  await store.write({
    access_token: "old",
    expires_at: 1,
    refresh_token: "old-refresh",
  });
  const revoked = new AuthFlow(
    new ScriptedHttp([
      response(discovery),
      response('{"error":"invalid_grant"}', 400),
    ]).transport(),
    store.adapter()
  );
  let cleared = false;
  try {
    await revoked.accessToken();
  } catch (error) {
    cleared = error instanceof Error && error.message.includes("native-test");
  }
  check(
    cleared && (await store.read()) === null,
    "Revoked refresh did not clear credentials and report request ID."
  );
  console.log(
    "Static auth: refusal, expiry, revoked refresh and request IDs passed."
  );

  await store.write({
    access_token: "rejected-access",
    expires_at: 2_000_000,
    refresh_token: "valid-refresh",
  });
  const recovery = new ScriptedHttp([
    response(discovery),
    response(token("recovered-access", "recovered-refresh")),
  ]);
  const recovered = await new AuthFlow(
    recovery.transport(),
    store.adapter()
  ).accessToken("rejected-access");
  check(
    recovered === "recovered-access" && recovery.calls.length === 2,
    "Rejected access token was not refreshed before expiry."
  );
  await store.clear();
  const expired = new ScriptedHttp([
    response(discovery),
    // eslint-disable-next-line unicorn/prefer-string-replace-all -- Scriptc's static replaceAll requires a regex search.
    response(device.replaceAll(/"expires_in":600/gu, '"expires_in":5')),
  ]);
  let locallyExpired = false;
  try {
    await new AuthFlow(expired.transport(), store.adapter()).login(approve);
  } catch (error) {
    locallyExpired =
      error instanceof Error && error.message.includes("approval code expired");
  }
  check(
    locallyExpired && expired.calls.length === 2,
    "A locally expired device code was polled."
  );
  check(
    // eslint-disable-next-line unicorn/prefer-string-replace-all -- Scriptc's static replaceAll requires a regex search.
    parseDevice(device.replaceAll(/,"interval":5/gu, "")).interval === 5,
    "Missing device interval did not default to five seconds."
  );
  for (const url of [
    "http://dashboard.example/token",
    "https://user:password@dashboard.example/token",
    "https://dashboard.example/token#fragment",
    "https://dashboard.example\\@evil.example/token",
    "https://dashboard.example/token\n",
  ]) {
    check(!httpsUrl(url), "Unsafe discovery URL was accepted.");
  }
  console.log(
    "Static auth: rejected-token recovery, local expiry, default interval and unsafe URL rejection passed."
  );

  await store.write({
    access_token: "fresh-before-force",
    expires_at: 2_000_000,
    refresh_token: "refresh-before-force",
  });
  const forcedHttp = new ScriptedHttp([
    response(discovery),
    response(token("forced-access", "forced-refresh")),
  ]);
  let forcedReads = 0;
  const countedStore: AuthStore = {
    clear: () => store.clear(),
    exclusive: (work) => store.exclusive(work),
    read: async () => {
      forcedReads += 1;
      return store.read();
    },
    write: (value) => store.write(value),
  };
  const forced = await new AuthFlow(
    forcedHttp.transport(),
    countedStore
  ).refresh();
  check(
    forced === "forced-access" && forcedReads === 1,
    "Manual refresh must read the credential only once."
  );
  console.log("Static auth: explicit refresh uses one locked credential read.");

  const nonRotatingHttp = new ScriptedHttp([
    response(discovery),
    response(
      '{"access_token":"non-rotated-access","expires_in":900,"token_type":"Bearer"}'
    ),
  ]);
  await new AuthFlow(nonRotatingHttp.transport(), store.adapter()).refresh();
  const retained = await store.read();
  check(
    retained?.refresh_token === "forced-refresh",
    "Non-rotating refresh discarded the stored token."
  );

  const controller = new AbortController();
  const waitingStore = new NativeStore(
    entry,
    join(directory, "credentials.lock"),
    () => controller.signal.throwIfAborted()
  );
  await store.exclusive(async () => {
    const started = Date.now();
    const cancel = async (): Promise<void> => {
      await setTimeout(50);
      controller.abort();
    };
    const cancellation = cancel();
    let aborted = false;
    try {
      await waitingStore.exclusive(async () => {
        throw new Error("Contended lock admitted a waiter.");
      });
    } catch (error) {
      aborted = error instanceof Error && error.name === "AbortError";
    }
    await cancellation;
    check(
      aborted && Date.now() - started < 1000,
      "Credential lock did not cancel promptly."
    );
  });
  let lockReused = false;
  await store.exclusive(async () => {
    lockReused = true;
  });
  check(lockReused, "Lock remains usable after cancellation.");
  const deadlineStore = new NativeStore(
    entry,
    join(directory, "credentials.lock")
  );
  let deadlineWorkRan = false;
  await store.exclusive(async () => {
    const started = Date.now();
    let timedOut = false;
    try {
      await deadlineStore.exclusive(async () => {
        deadlineWorkRan = true;
      }, started + 50);
    } catch (error) {
      timedOut =
        error instanceof Error && error.message.includes("credential lock");
    }
    check(
      timedOut && Date.now() - started < 1000,
      "Credential lock did not respect the approval deadline."
    );
  });
  await deadlineStore.exclusive(async () => {
    check(
      !deadlineWorkRan,
      "Expired lock work ran after the owner released it."
    );
  });
  console.log(
    "Static auth: non-rotating refresh and contended-lock cancellation passed."
  );

  const malformed = [
    "null",
    "[]",
    "{}",
    '{"access_token":"x","expires_in":900,"token_type":"Bearer"}',
    '{"access_token":"x","refresh_token":"x","expires_in":1e999,"token_type":"Bearer"}',
    '{"access_token":1,"refresh_token":"x","expires_in":900,"token_type":"Bearer"}',
    '{"access_token":"x","refresh_token":"x","expires_in":-1,"token_type":"Bearer"}',
    '{"access_token":"x","refresh_token":"x","expires_in":900,"token_type":"Basic"}',
  ];
  for (const body of malformed) {
    let rejected = false;
    try {
      parseTokens(body);
    } catch {
      rejected = true;
    }
    check(rejected, "Malformed token data passed native validation.");
  }
  console.log(
    "Static auth: malformed JSON, field types, expiry and bearer validation passed."
  );
  entry.write("test-only-secret malformed JSON");
  let corruptRejected = false;
  try {
    await store.read();
  } catch (error) {
    corruptRejected =
      error instanceof Error &&
      error.message.includes("saved sign-in is invalid") &&
      !error.message.includes("test-only-secret");
  }
  check(
    corruptRejected,
    "Corrupt credentials were not rejected without exposing their contents."
  );
}, [
  () => store.clear(),
  () => removeOptionalFile(join(directory, "credentials.lock")),
  async () => {
    check(
      removeDirectory(directory) === 0,
      "Cannot remove temporary directory."
    );
  },
]);
