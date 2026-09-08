import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { AsyncEntry } from "@napi-rs/keyring";

import { ApiClient } from "../../experiments/node/api.ts";
import { Auth } from "../../experiments/node/auth.ts";
import { PlatformStore } from "../../experiments/node/store.ts";
import type { SecretEntry } from "../../experiments/node/store.ts";
import {
  credentials,
  device,
  metadata,
  setup,
  tokens,
} from "../../test/fixtures.ts";

const directory = await mkdtemp(path.join(os.tmpdir(), "inth-packaged-auth-"));
let saved: string | undefined;
const memory: SecretEntry = {
  deleteCredential: () => {
    saved = undefined;
    return Promise.resolve(true);
  },
  getPassword: () => Promise.resolve(saved),
  setPassword: (value) => {
    saved = value;
    return Promise.resolve();
  },
};
const useKeyring = process.argv.includes("--keyring");
// An isolated service/account prevents the packaged test from reading or replacing a person's login.
const entry = useKeyring
  ? new AsyncEntry("com.inth.cli.packaged-test", randomUUID())
  : memory;
const store = new PlatformStore(entry, directory);
const f = setup([
  Response.json(metadata),
  Response.json(device),
  Response.json(tokens),
  Response.json({
    ...tokens,
    access_token: "refreshed",
    refresh_token: "rotated",
  }),
  new Response(null, { status: 401 }),
  Response.json({
    ...tokens,
    access_token: "recovered",
    refresh_token: "rotated-again",
  }),
  Response.json({ ok: true }),
  new Response(null, { status: 200 }),
  Response.json(
    { error: "invalid_grant" },
    { headers: { "X-Request-Id": "revoked-test" }, status: 400 }
  ),
]);
const auth = new Auth(f.http, store);
try {
  await auth.login({
    show: (authorization) => {
      assert.equal(authorization.user_code, device.user_code);
      return Promise.resolve();
    },
  });
  const signedIn = await store.read();
  assert.equal(signedIn?.refresh_token, tokens.refresh_token);
  f.clock.time += 850_000;
  const api = new ApiClient(f.http, () => Promise.resolve(auth));
  assert.equal(await api.get("/v1/projects", "org-test"), '{\n  "ok": true\n}');
  const refreshed = await store.read();
  assert.equal(refreshed?.refresh_token, "rotated-again");
  assert.match(String(f.server.calls[5]?.init.body), /refresh_token=rotated/u);
  assert.match(f.server.calls[6]?.url ?? "", /organizationId=org-test/u);
  await auth.logout();
  assert.equal(await store.read(), null);
  assert.match(String(f.server.calls[7]?.init.body), /token=rotated-again/u);
  await store.write(credentials);
  await assert.rejects(() => auth.accessToken(), /revoked-test/u);
  assert.equal(await store.read(), null);
  assert.deepEqual(await readdir(directory), []);
  console.log(
    `Packaged OAuth, refresh, 401 recovery, revocation and ${useKeyring ? "OS keyring" : "credential adapter"} passed.`
  );
} finally {
  await store.clear();
  await rm(directory, { force: true, recursive: true });
}
