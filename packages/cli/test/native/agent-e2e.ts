/* eslint-disable require-await -- Native credential FFI implements the async store contract. */
// eslint-disable-next-line unicorn/import-style -- Scriptc requires named path imports.
import { join } from "node:path";

import { AgentAuth } from "../../src/agent-auth.ts";
import { runAgentCommand } from "../../src/agent-commands.ts";
import { agentEnvironment } from "../../src/agent-environment.ts";
import { parseArguments } from "../../src/arguments.ts";
import { selectCommandConnection } from "../../src/connection-selection.ts";
import { NativeApi } from "../../src/native/native-api.ts";
import { prepareDirectory } from "../../src/native/native-bindings.ts";
import { nativeClock, nativeHttp } from "../../src/native/native-http.ts";
import { NativeKeychain } from "../../src/native/native-keychain.ts";
import { NativeContext } from "../../src/native/native-state.ts";
import { NativeStore } from "../../src/native/native-store.ts";
import { printResult, reportError } from "../../src/output.ts";

// Test-only entry point. Production command handlers, HTTP and keychain adapters
// run against a real local backend without touching the developer's credentials.
const [directory, account] = process.argv.slice(2);
if (
  !directory ||
  !account ||
  !process.env.INTH_DEV_API_ORIGIN ||
  !process.env.INTH_DEV_DASHBOARD_ORIGIN
) {
  throw new Error(
    "Provide an isolated state directory, account and local HTTPS origins."
  );
}
const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());
let exitCode = 0;
try {
  const environment = agentEnvironment(
    process.env.INTH_DEV_API_ORIGIN,
    process.env.INTH_DEV_DASHBOARD_ORIGIN,
    "agent"
  );
  if (prepareDirectory(directory) !== 0) {
    throw new Error("Cannot prepare test state.");
  }
  const options = parseArguments(process.argv.slice(4));
  const context = new NativeContext(directory, directory);
  await selectCommandConnection(
    options,
    undefined,
    () => context.selectedConnection(),
    environment
  );
  const entry = new NativeKeychain("com.inth.cli.agent-e2e", account);
  const lock = new NativeStore(entry, join(directory, "agent.lock"), () =>
    controller.signal.throwIfAborted()
  );
  const http = nativeHttp(
    controller.signal,
    nativeClock(controller.signal),
    false
  );
  const auth = new AgentAuth(
    http,
    {
      clear: async () => entry.clear(),
      exclusive: (work) => lock.exclusive(work),
      read: async () => entry.read(),
      write: async (value) => entry.write(value),
    },
    environment
  );
  if (
    !(await runAgentCommand(options, auth, () =>
      context.selectConnection("agent")
    ))
  ) {
    if (options.command !== "whoami") {
      throw new Error("Unsupported E2E command.");
    }
    const api = new NativeApi(
      http,
      () => ({
        accessToken: (rejected, force) => auth.accessToken(rejected, force),
        userInfoEndpoint: () => auth.userInfoEndpoint(),
      }),
      undefined,
      undefined,
      environment.apiOrigin
    );
    const identity = await api.getMe(true);
    printResult(true, "", JSON.stringify(identity));
  }
} catch (error) {
  exitCode = reportError(
    true,
    error instanceof Error ? error : new Error("E2E command failed"),
    controller.signal.aborted
  );
}
process.exit(exitCode);
