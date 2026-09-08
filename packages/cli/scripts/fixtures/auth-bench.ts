import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { AsyncEntry } from "@napi-rs/keyring";
import { z } from "zod";

import { AuthScenario, workload } from "../../bench/auth-workload.ts";
import { Auth } from "../../experiments/node/auth.ts";
import { HttpClient } from "../../experiments/node/http.ts";
import { PlatformStore } from "../../experiments/node/store.ts";

const directory = await mkdtemp(path.join(os.tmpdir(), "inth-auth-bench-"));
const store = new PlatformStore(
  new AsyncEntry("com.inth.cli.auth-benchmark", randomUUID()),
  directory
);
const scenario = new AuthScenario();
const http = new HttpClient(
  (url, init) => {
    const response = scenario.next(
      url,
      new URLSearchParams(z.string().optional().parse(init.body) ?? "")
    );
    return Promise.resolve(
      new Response(response.body || null, { status: response.status })
    );
  },
  { now: () => scenario.time, sleep: (ms) => scenario.sleep(ms) },
  new AbortController().signal
);
try {
  await workload(new Auth(http, store), store, scenario);
} finally {
  await store.clear();
  await rm(directory, { force: true, recursive: true });
}
