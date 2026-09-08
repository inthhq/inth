import { setTimeout } from "node:timers/promises";

import { httpDate } from "../../src/native/native-bindings.ts";
import {
  nativeClock,
  nativeHttp,
  retryDelay,
} from "../../src/native/native-http.ts";

const check = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};
if (process.argv.length !== 3) {
  throw new Error("Expected the local test server URL.");
}
const [base] = process.argv.slice(2);
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
const rateLimited = await http.request(`${base}/rate-limit`);
check(
  rateLimited.status === 200 && waits.join(",") === "3000",
  "HTTP 429 backoff failed."
);
const authenticated = await http.get(`${base}/bearer`, "inth_transport_test");
check(authenticated.status === 200, "Authenticated HTTP request failed.");
const created = await http.post(
  `${base}/create`,
  "inth_transport_test",
  '{"name":"Acme Team","slug":"acme"}'
);
check(created.status === 201, "Authenticated JSON POST failed");
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
  await http.request(`${base}/redirect`);
} catch (error) {
  redirectRejected =
    error instanceof Error &&
    error.message ===
      "Could not reach inth. Check your connection and try again.";
}
check(redirectRejected, "The native transport followed a redirect.");
let unreachable = false;
try {
  await http.request(`${base}/disconnect`);
} catch (error) {
  unreachable =
    error instanceof Error &&
    error.message ===
      "Could not reach inth. Check your connection and try again.";
}
check(unreachable, "Transport failures were not normalized.");
let invalidRejected = false;
try {
  await http.discovery(await http.request(`${base}/malformed`));
} catch (error) {
  invalidRejected =
    error instanceof Error && error.message.includes("native-malformed");
}
check(invalidRejected, "Invalid discovery did not report the request ID.");
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
  await cancellable.request(`${base}/hang`);
} catch (error) {
  cancelled = error instanceof Error && error.name === "AbortError";
}
await cancelJob;
check(cancelled, "HTTP cancellation failed.");
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
process.exit(0);
