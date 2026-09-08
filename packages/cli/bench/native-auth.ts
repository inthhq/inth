/* eslint-disable require-await -- The in-memory transport implements the asynchronous OAuth contract. */
import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
// eslint-disable-next-line unicorn/import-style -- Scriptc requires named node:path imports.
import { join } from "node:path";

import { AuthFlow } from "../src/auth-flow.ts";
import type { OAuthTransport } from "../src/auth-types.ts";
import { removeDirectory } from "../src/native/native-bindings.ts";
import { NativeKeychain } from "../src/native/native-keychain.ts";
import {
  parseDevice,
  parseDiscovery,
  parseTokens,
  responseError,
} from "../src/native/native-protocol.ts";
import { NativeStore } from "../src/native/native-store.ts";
import { AuthScenario, check, workload } from "./auth-workload.ts";

const directory = join(tmpdir(), `inth-auth-bench-${randomUUID()}`);
await mkdir(directory, { mode: 0o700 });
const store = new NativeStore(
  new NativeKeychain("com.inth.cli.auth-benchmark", randomUUID()),
  join(directory, "credentials.lock")
);
const scenario = new AuthScenario();
const http: OAuthTransport = {
  clock: { now: () => scenario.time, sleep: (ms) => scenario.sleep(ms) },
  device: async (response) => parseDevice(response.body),
  discovery: async (response) => parseDiscovery(response.body),
  error: (response) => responseError(response),
  form: async (url, fields, _deadline) => scenario.next(url, fields),
  request: async (url) => scenario.next(url, new URLSearchParams()),
  tokens: async (response) => parseTokens(response.body),
};
try {
  await workload(
    new AuthFlow(http, store.adapter()),
    store.adapter(),
    scenario
  );
} finally {
  await store.clear();
  await rm(join(directory, "credentials.lock"));
  check(removeDirectory(directory) === 0, "Cannot remove benchmark directory.");
}
process.exit(0);
