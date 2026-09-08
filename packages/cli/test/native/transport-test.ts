import { setTimeout } from "node:timers/promises";

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
} catch {
  redirectRejected = true;
}
check(redirectRejected, "The native transport followed a redirect.");
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
} catch {
  cancelled = true;
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
} catch {
  sleepCancelled = true;
}
await sleepJob;
check(sleepCancelled, "Polling cancellation failed.");
console.log(
  "Static HTTP: Retry-After date/seconds, 429, redirects, request IDs, request cancellation and polling cancellation passed."
);
// Scriptc currently keeps AbortSignal.timeout timers alive after fetch completes.
// All requests and cleanup have finished; CLI entrypoints explicitly terminate.
process.exit(0);
