import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { AsyncEntry } from "@napi-rs/keyring";

import { Auth } from "../../experiments/node/auth.ts";
import { showDevice } from "../../experiments/node/commands.ts";
import { HttpClient, systemClock } from "../../experiments/node/http.ts";
import {
  API_ORIGIN,
  CLIENT_ID,
  DISCOVERY_URL,
  discoverySchema,
  tokenSchema,
} from "../../experiments/node/protocol.ts";
import { PlatformStore } from "../../experiments/node/store.ts";

// This explicit live test creates and revokes its own dashboard session. It never
// reads the com.inth.cli/oauth account used by the production executable.
const directory = await mkdtemp(path.join(os.tmpdir(), "inth-live-auth-"));
const store = new PlatformStore(
  new AsyncEntry("com.inth.cli.live-test", randomUUID()),
  directory
);
const controller = new AbortController();
const cancel = () => controller.abort();
process.once("SIGINT", cancel);
process.once("SIGTERM", cancel);
const http = new HttpClient(
  fetch,
  systemClock(controller.signal),
  controller.signal
);
const auth = new Auth(http, store);
let signedIn = false;
try {
  console.log(
    "Testing a temporary CLI session. It will be revoked after the test."
  );
  await auth.login({ show: (device) => showDevice(device, false) });
  signedIn = true;
  const initial = await store.read();
  assert.ok(initial, "Login did not save credentials to Keychain.");
  assert.ok(
    initial.expires_at > Date.now(),
    "The issued token is already expired."
  );
  console.log("Live device approval and credential storage passed.");

  // Force the same path used after a 401; both calls must share a single rotation.
  const access = await Promise.all([
    auth.accessToken(initial.access_token),
    new Auth(http, store).accessToken(initial.access_token),
  ]);
  assert.ok(
    access[0] === access[1],
    "Concurrent requests did not share the refreshed access token."
  );
  const refreshed = await store.read();
  assert.ok(refreshed, "Refresh did not preserve the saved session.");
  assert.ok(
    refreshed.refresh_token !== initial.refresh_token,
    "The refresh token did not rotate."
  );
  console.log(
    "Live refresh rotation and concurrent credential locking passed."
  );

  await auth.logout();
  signedIn = false;
  const deleted = await store.read();
  assert.ok(deleted === null, "Logout left credentials in the OS store.");

  const metadata = await http.json(
    await http.request(DISCOVERY_URL),
    discoverySchema
  );
  const revoked = await http.form(
    metadata.token_endpoint,
    new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: refreshed.refresh_token,
      resource: API_ORIGIN,
    })
  );
  if (revoked.ok) {
    // Preserve any unexpectedly issued session long enough to revoke it in cleanup.
    const unexpected = await http.json(revoked, tokenSchema);
    await store.write({
      access_token: unexpected.access_token,
      expires_at: Date.now() + unexpected.expires_in * 1000,
      refresh_token: unexpected.refresh_token,
    });
    signedIn = true;
    throw new Error(
      "The revoked refresh token unexpectedly issued a new session."
    );
  }
  const rejection = await http.error(revoked);
  assert.ok(
    rejection.code === "invalid_grant",
    `The revocation check failed. ${rejection.message}`
  );
  console.log("Live revocation and local credential deletion passed.");
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Live authentication test failed."
  );
  process.exitCode = controller.signal.aborted ? 130 : 1;
} finally {
  try {
    if (signedIn) {
      // Cleanup gets a fresh signal so Ctrl+C cannot prevent session revocation.
      const cleanupSignal = AbortSignal.timeout(30_000);
      const cleanupHttp = new HttpClient(
        fetch,
        systemClock(cleanupSignal),
        cleanupSignal
      );
      await new Auth(cleanupHttp, store).logout();
    }
  } finally {
    await store.clear();
    await rm(directory, { force: true, recursive: true });
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
  }
}
