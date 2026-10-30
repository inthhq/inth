import { setTimeout } from "node:timers/promises";

import { parseArguments } from "../../src/arguments.ts";
import type { OAuthResponse } from "../../src/auth-types.ts";
import { CliError } from "../../src/cli-error.ts";
import { readDownload } from "../../src/download.ts";
import { NativeApi } from "../../src/native/native-api.ts";
import { httpDate } from "../../src/native/native-bindings.ts";
import {
  nativeClock,
  nativeHttp,
  retryDelay,
} from "../../src/native/native-http.ts";
import { NativeTelemetry } from "../../src/native/native-telemetry.ts";
import { sendTelemetry, telemetryPayload } from "../../src/telemetry.ts";

const check = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};
if (process.argv.length !== 4) {
  throw new Error("Expected the local test server URL.");
}
const [base, directory] = process.argv.slice(2);
if (!directory) {
  throw new Error("Missing identity test directory.");
}
// eslint-disable-next-line prefer-destructuring -- Scriptc lowers this native handle's property access, not object destructuring.
const signal = new AbortController().signal;
const waits: number[] = [];
const http = nativeHttp(signal, {
  now: () => 1_445_412_477_000,
  sleep: (ms) => {
    waits.push(ms);
    return Promise.resolve();
  },
});
check(
  retryDelay("Wed, 21 Oct 2015 07:28:00 GMT", 1_445_412_477_000) === 3000,
  "HTTP date parsing failed."
);
check(retryDelay("2", 0) === 2000, "Retry-After seconds failed.");
for (const date of [
  "Sun, 06 Nov 1994 08:49:37 GMT",
  "Sunday, 06-Nov-94 08:49:37 GMT",
  "Sun Nov  6 08:49:37 1994",
]) {
  check(
    httpDate(date) === 784_111_777_000,
    `HTTP-date compatibility failed: ${date}`
  );
}
for (const date of [
  "Sun, 31 Feb 2024 08:49:37 GMT",
  "Sun, 29 Feb 2023 08:49:37 GMT",
  "Sun, 31 Apr 2024 08:49:37 GMT",
  "Sun, 06 Nov 1994 -1:49:37 GMT",
  "bad, 06 Nov 1994 08:49:37 GMT",
  "Sunday, 06-Nov-94 08:49:37 GMT trailing",
  "Sunday, 06-Nov--1 08:49:37 GMT",
]) {
  check(Number.isNaN(httpDate(date)), `Invalid HTTP date accepted: ${date}`);
}
check(
  httpDate("Thu, 29 Feb 2024 00:00:00 GMT") === 1_709_164_800_000,
  "Leap day rejected."
);
const rateLimited = await http.request(
  `${base}/rate-limit`,
  Number.POSITIVE_INFINITY
);
check(
  rateLimited.status === 200 && waits.join(",") === "3000",
  "HTTP 429 backoff failed."
);
const longLimit = await http.request(
  `${base}/rate-limit-long`,
  Number.POSITIVE_INFINITY
);
check(
  longLimit.status === 429 &&
    longLimit.requestId === "native-long-limit" &&
    waits.join(",") === "3000",
  "A long rate limit was retried or lost its request ID."
);
const cumulativeLimit = await http.request(
  `${base}/rate-limit-budget`,
  Number.POSITIVE_INFINITY
);
check(
  cumulativeLimit.status === 429 && waits.join(",") === "3000,15000",
  "Cumulative rate-limit waits exceeded the budget."
);
const boundaryLimit = await http.request(
  `${base}/rate-limit-boundary`,
  Number.POSITIVE_INFINITY
);
check(
  boundaryLimit.status === 200 && waits.join(",") === "3000,15000,30000",
  "A rate-limit wait within the budget was refused."
);
const authenticated = await http.get(`${base}/bearer`, "inth_transport_test");
check(authenticated.status === 200, "Authenticated HTTP request failed.");
const { download } = http;
if (!download) {
  throw new Error("The native transport does not support downloads.");
}
const binary = await download(
  `${base}/binary`,
  "inth_transport_test",
  "image/png"
);
check(
  binary.body === "" && binary.contentType === "image/png",
  "Binary metadata or body handling failed."
);
check(
  binary.bytes?.join(",") === "0,255,128,13,10,0,65",
  "Download bytes passed through text decoding."
);
const { uploadChat } = http;
if (!uploadChat) {
  throw new Error("The native transport does not support chat uploads.");
}
const slowDownload = download(
  `${base}/binary-slow`,
  "inth_transport_test",
  "image/png"
);
const slowUpload = uploadChat(
  `${base}/upload-slow`,
  "inth_transport_test",
  '{"fileName":"notes.txt","data":"QQ=="}'
);
const downloaded = await slowDownload;
const uploaded = await slowUpload;
check(
  downloaded.bytes?.join(",") === "0,255,128,13,10,0,65,66,66,66",
  "A steadily arriving download failed after 30 seconds."
);
check(
  uploaded.body.includes('"aga_ready"'),
  "A chat upload failed after 30 seconds."
);
const report = await http.send(
  `${base}/report-v2`,
  "inth_transport_test",
  "GET",
  undefined,
  "application/vnd.inth.web-audit+json;version=2"
);
check(
  report.body.includes('"provenance":["recorded"]'),
  "Custom JSON Accept did not select version two."
);
for (const name of [
  "binary-mismatch",
  "binary-too-large",
  "binary-truncated",
]) {
  let rejected = false;
  try {
    // eslint-disable-next-line no-await-in-loop -- Each download must fail independently.
    await download(`${base}/${name}`, "inth_transport_test", "image/png");
  } catch (error) {
    rejected = error instanceof CliError && error.requestId === "native-binary";
  }
  check(
    rejected,
    `Invalid ${name} response was accepted or lost its request ID.`
  );
}
let binaryRedirectRejected = false;
try {
  await download(`${base}/binary-redirect`, "inth_transport_test", "image/png");
} catch {
  binaryRedirectRejected = true;
}
check(binaryRedirectRejected, "A binary redirect was followed.");
let smallLimitRejected = false;
try {
  await readDownload(
    new Response(new Uint8Array([0, 255, 128, 13, 10])),
    "*/*",
    signal,
    4
  );
} catch (error) {
  smallLimitRejected =
    error instanceof CliError && error.code === "download_too_large";
}
check(smallLimitRejected, "A chunked download exceeded its actual byte limit.");
let refreshCalls = 0;
const refreshedDownload = new NativeApi(
  {
    download: (_url, token, accept): Promise<OAuthResponse> => {
      refreshCalls += 1;
      check(accept === "application/pdf", "A download refresh lost Accept.");
      if (token === "old-token") {
        return Promise.resolve({
          body: '{"error":{"code":"UNAUTHORIZED"}}',
          ok: false,
          requestId: "old-request",
          status: 401,
        });
      }
      check(token === "new-token", "A download refresh used the wrong token.");
      return Promise.resolve({
        body: "",
        bytes: new Uint8Array([0, 255, 128]),
        contentType: "application/pdf",
        ok: true,
        requestId: "refreshed-download",
        status: 200,
      });
    },
    get: () => {
      throw new Error("A download used the JSON transport.");
    },
    post: () => {
      throw new Error("A download used the JSON transport.");
    },
    send: () => {
      throw new Error("A download used the JSON transport.");
    },
  },
  () => ({
    accessToken: (rejected) =>
      Promise.resolve(rejected ? "new-token" : "old-token"),
    userInfoEndpoint: () => Promise.resolve("https://api.inth.com/userinfo"),
  })
);
const refreshedBytes = await refreshedDownload.download(
  "/v1/billing/invoices/in_1/pdf",
  undefined,
  "application/pdf"
);
check(
  refreshedBytes.bytes.join(",") === "0,255,128" && refreshCalls === 2,
  "Native download authentication refresh failed."
);
const created = await http.post(
  `${base}/create`,
  "inth_transport_test",
  '{"name":"Acme Team","slug":"acme"}'
);
check(created.status === 201, "Authenticated JSON POST failed");
const agentHttp = nativeHttp(signal, http.clock, false);
const registration = await agentHttp.post(
  `${base}/register`,
  "",
  '{"login_hint":"test@example.com"}'
);
check(
  registration.status === 201,
  "Agent registration sent browser credentials"
);
const claimResponse = await agentHttp.form(
  `${base}/claim`,
  new URLSearchParams({ claim_token: "clm_test" }),
  Number.POSITIVE_INFINITY
);
check(
  claimResponse.status === 429 && claimResponse.retryAfter === "60",
  "Single-use claim was retried or lost Retry-After"
);
for (const method of ["PATCH", "DELETE", "POST"]) {
  // eslint-disable-next-line no-await-in-loop -- Check each HTTP verb against the local server.
  const result = await http.send(
    `${base}/mutation/${method}`,
    "inth_transport_test",
    method,
    method === "PATCH" ? '{"description":null}' : undefined
  );
  check(result.status === 204, `Authenticated ${method} failed`);
}
let redirectRejected = false;
try {
  await http.request(`${base}/redirect`, Number.POSITIVE_INFINITY);
} catch (error) {
  redirectRejected =
    error instanceof Error &&
    error.message ===
      "Could not reach inth. Check your connection and try again.";
}
check(redirectRejected, "The native transport followed a redirect.");
let unreachable = false;
try {
  await http.request(`${base}/disconnect`, Number.POSITIVE_INFINITY);
} catch (error) {
  unreachable =
    error instanceof Error &&
    error.message ===
      "Could not reach inth. Check your connection and try again.";
}
check(unreachable, "Transport failures were not normalized.");
let invalidRejected = false;
try {
  await http.discovery(
    await http.request(`${base}/malformed`, Number.POSITIVE_INFINITY)
  );
} catch (error) {
  invalidRejected =
    error instanceof Error && error.message.includes("native-malformed");
}
check(invalidRejected, "Invalid discovery did not report the request ID.");
const bounded = nativeHttp(signal, nativeClock(signal));
const deadlineStarted = Date.now();
let deadlineExpired = false;
try {
  await bounded.request(`${base}/deadline-hang`, deadlineStarted + 50);
} catch (error) {
  deadlineExpired =
    error instanceof Error &&
    (error.message ===
      "Could not reach inth. Check your connection and try again." ||
      error.message ===
        "The approval code expired. Run `inth login` to start again.");
}
check(
  deadlineExpired && Date.now() - deadlineStarted < 1000,
  "HTTP request did not respect the approval deadline."
);
const controller = new AbortController();
const cancellable = nativeHttp(
  controller.signal,
  nativeClock(controller.signal)
);
const abort = async (): Promise<void> => {
  await setTimeout(50);
  controller.abort();
};
const cancelJob = abort();
let cancelled = false;
try {
  await cancellable.request(`${base}/hang`, Number.POSITIVE_INFINITY);
} catch (error) {
  cancelled = error instanceof Error && error.name === "AbortError";
}
await cancelJob;
check(cancelled, "HTTP cancellation failed.");
const binaryController = new AbortController();
const binaryHttp = nativeHttp(
  binaryController.signal,
  nativeClock(binaryController.signal)
);
const cancelBinary = async (): Promise<void> => {
  await setTimeout(50);
  binaryController.abort();
};
const binaryCancelJob = cancelBinary();
let binaryCancelled = false;
try {
  const { download: read } = binaryHttp;
  if (!read) {
    throw new Error("Missing binary transport.");
  }
  await read(`${base}/binary-hang`, "inth_transport_test", "image/png");
} catch (error) {
  binaryCancelled = error instanceof Error && error.name === "AbortError";
}
await binaryCancelJob;
check(binaryCancelled, "A pending binary download did not cancel.");
const sleeper = new AbortController();
const clock = nativeClock(sleeper.signal);
const stopSleep = async (): Promise<void> => {
  await setTimeout(20);
  sleeper.abort();
};
const sleepJob = stopSleep();
let sleepCancelled = false;
try {
  await clock.sleep(5000);
} catch (error) {
  sleepCancelled = error instanceof Error && error.name === "AbortError";
}
await sleepJob;
check(sleepCancelled, "Polling cancellation failed.");
console.log(
  "Static HTTP: Retry-After date/seconds, 429, redirects, request IDs, request cancellation and polling cancellation passed."
);
// Scriptc currently keeps AbortSignal.timeout timers alive after fetch completes.
// All requests and cleanup have finished; CLI entrypoints explicitly terminate.

const telemetryBody = telemetryPayload(
  parseArguments(["mcp", "list", "--json"]),
  "native-test",
  1,
  "",
  false
);
check(
  await sendTelemetry(telemetryBody, `${base}/telemetry`),
  "Native telemetry delivery failed."
);
const telemetryStarted = Date.now();
check(
  !(await sendTelemetry(telemetryBody, `${base}/hang`)),
  "Hung telemetry request succeeded."
);
check(Date.now() - telemetryStarted < 2500, "Telemetry delayed command exit.");
check(
  !(await sendTelemetry(telemetryBody, `${base}/disconnect`)),
  "Disconnected telemetry request succeeded."
);
check(
  !(await sendTelemetry(telemetryBody, `${base}/redirect`)),
  "Telemetry followed a redirect."
);

const identity = new NativeTelemetry(directory, false);
check(
  identity.installationId().length === 36,
  "Identity tests could not initialize private telemetry state."
);
check(
  (await identity.userId("browser-first", "", `${base}/telemetry/me`)) ===
    "user-one",
  "Browser identity lookup failed."
);
check(
  (await identity.userId("browser-first", "", `${base}/disconnect`)) ===
    "user-one",
  "Identity cache did not avoid another request."
);
check(
  (await identity.userId("browser-second", "", `${base}/telemetry/me`)) ===
    "user-two",
  "Changed credentials inherited another user's identity."
);
check(
  (await identity.userId(
    "invalid-identity",
    "",
    `${base}/telemetry/invalid`
  )) === "",
  "Malformed API identity was trusted."
);
check(
  (await identity.userId("api-key", "", `${base}/telemetry/key`)) === "",
  "API key was identified as its creator."
);
check(
  (await identity.userId("redirect", "", `${base}/redirect`)) === "",
  "Identity lookup followed a redirect."
);
const identityStarted = Date.now();
check(
  (await identity.userId("hung-identity", "", `${base}/hang`)) === "",
  "Hung identity request succeeded."
);
check(
  Date.now() - identityStarted < 2500,
  "Identity lookup exceeded its delivery budget."
);
identity.clearIdentity();
check(
  (await identity.userId("browser-second", "", `${base}/disconnect`)) === "",
  "Logout retained a cached identity."
);
console.log(
  "Native telemetry identity: API lookup, cache, account changes, key isolation, malformed responses and timeouts passed."
);
process.exit(0);
