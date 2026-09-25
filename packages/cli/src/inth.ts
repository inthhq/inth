/* eslint-disable require-await -- Browser approval implements the shared asynchronous login UI contract. */
import { mkdirSync } from "node:fs";
// eslint-disable-next-line unicorn/import-style -- Scriptc requires named node:path imports.
import { dirname, join } from "node:path";

import { AgentAuth } from "./agent-auth.ts";
import { runAgentCommand } from "./agent-commands.ts";
import { agentEnvironment, agentStateDirectory } from "./agent-environment.ts";
import type { AccessTokenProvider } from "./agent-types.ts";
import { apiKey } from "./api-options.ts";
import type { CliArguments } from "./arguments.ts";
import { parseArguments } from "./arguments.ts";
import { AuthFlow } from "./auth-flow.ts";
import { CliError } from "./cli-error.ts";
import { selectCommandConnection } from "./connection-selection.ts";
import { colorEnabled, organizationReference } from "./display.ts";
import { diagnosticStep, startErrorDiagnostics } from "./error-diagnostics.ts";
import { identitySummary } from "./identity.ts";
import { NativeApi, apiOutput } from "./native/native-api.ts";
import {
  openBrowser,
  outputColumns,
  prepareDirectory,
  productionBuild,
} from "./native/native-bindings.ts";
import { nativeClock, nativeHttp } from "./native/native-http.ts";
import { NativeKeychain } from "./native/native-keychain.ts";
import { runMcp } from "./native/native-mcp.ts";
import { httpsUrl } from "./native/native-protocol.ts";
import { formatNativeResource } from "./native/native-resource-output.ts";
import { reportUnexpectedError } from "./native/native-sentry.ts";
import { NativeContext } from "./native/native-state.ts";
import { NativeStore } from "./native/native-store.ts";
import {
  NativeTelemetry,
  telemetryDisabled,
} from "./native/native-telemetry.ts";
import { nativeUI } from "./native/native-ui.ts";
import {
  chooseOrganization,
  createdOrganizationMessage,
} from "./organizations.ts";
import {
  printResult,
  printHelp,
  reportError,
  requireInteractiveLogin,
} from "./output.ts";
import { nativeStateDirectory } from "./platform.ts";
import {
  buildResourceRequest,
  rawApiRequest,
  resourceCommand,
} from "./resource-commands.ts";
import { agentSandbox, sandboxError } from "./sandbox.ts";
import { runSkills } from "./skills.ts";
import {
  telemetryCommand,
  telemetryError,
  telemetryPayload,
} from "./telemetry.ts";

let telemetryToken = "";
let knownTelemetryUser = "";
const observeCredential = (token: string): void => {
  if (token !== telemetryToken) {
    knownTelemetryUser = "";
  }
  telemetryToken = token;
};
const observeIdentity = (token: string, userId: string): void => {
  observeCredential(token);
  knownTelemetryUser = userId;
};
const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());
const runLogin = async (
  options: CliArguments,
  key: string | undefined,
  getAuth: () => AuthFlow,
  api: NativeApi,
  context: NativeContext,
  allowInteractive: boolean
): Promise<void> => {
  if (key) {
    printResult(
      options.json,
      "Using the supplied organization API key. No browser sign-in needed.",
      JSON.stringify({ credentialSource: "api_key", validated: false })
    );
  } else {
    requireInteractiveLogin(
      allowInteractive && Boolean(process.stdin.isTTY && process.stdout.isTTY)
    );
    await getAuth().login({
      show: async (device) => {
        if (!httpsUrl(device.verification_uri_complete)) {
          throw new Error("Invalid browser approval URL.");
        }
        console.log(
          `Your code: ${device.user_code.replaceAll(/[^\u0020-\u007E]/gu, "")}`
        );
        console.log(`Approve sign-in: ${device.verification_uri_complete}`);
        if (
          !options.noBrowser &&
          openBrowser(device.verification_uri_complete) !== 0
        ) {
          console.error(
            "Could not open the browser. Open the approval link above."
          );
        }
        console.log("Waiting for approval. Press Ctrl+C to cancel.");
      },
    });
    await context.selectConnection("browser");
    console.log("Signed in.");
    const organizations = await api.organizations();
    if (organizations.length === 0 && !options.organization) {
      console.log(
        "Create your first organization with inth org create --name <name> --slug <slug>."
      );
      return;
    }
    const selected = await chooseOrganization(
      organizations,
      options.organization,
      await context.defaultOrganization(),
      nativeUI(controller.signal, allowInteractive)
    );
    await context.select(selected);
    printResult(
      options.json,
      `Default organization: ${organizationReference(organizations, selected)}`,
      JSON.stringify({ organizationId: selected, scope: "user" })
    );
  }
};

const runAuth = async (
  options: CliArguments,
  key: string | undefined,
  getAuth: () => AuthFlow,
  getStore: () => NativeStore,
  context: NativeContext
): Promise<void> => {
  if (key) {
    if (options.argument === "refresh") {
      throw new CliError(
        "usage_error",
        "Organization API keys cannot be refreshed."
      );
    }
    printResult(
      options.json,
      "Using an organization API key. Its validity has not been checked.",
      JSON.stringify({
        credentialPresent: true,
        credentialSource: "api_key",
        expiresAt: null,
        validated: false,
      })
    );
  } else if (options.argument === "refresh") {
    await getAuth().refresh();
    printResult(
      options.json,
      "Refreshed the saved sign-in.",
      JSON.stringify({ credentialSource: "browser", refreshed: true })
    );
  } else {
    const store = getStore();
    const saved = await store.read();
    if (saved === null) {
      throw new CliError(
        "authentication_required",
        "Not signed in. Run inth login."
      );
    }
    const selected = await context.resolve(options.organization);
    printResult(
      options.json,
      `Saved browser sign-in. Access token expires ${new Date(saved.expires_at).toISOString()}.\nSession validity will be checked on the next API request.${selected ? `\nOrganization: ${selected}` : ""}`,
      JSON.stringify({
        credentialPresent: true,
        credentialSource: "browser",
        expiresAt: saved.expires_at,
        organizationId: selected ?? null,
        validated: false,
      })
    );
  }
};

const runTelemetry = (options: CliArguments): void => {
  const telemetry = new NativeTelemetry(
    nativeStateDirectory(),
    telemetryDisabled(process.env.INTH_TELEMETRY_DISABLED, process.env.CI)
  );
  if (options.argument !== "status") {
    telemetry.setEnabled(options.argument === "enable");
  }
  const enabled = telemetry.enabled();
  let message = "Usage telemetry is disabled in development builds.";
  if (productionBuild() === 1) {
    message = enabled
      ? "Usage telemetry is enabled. To opt out, run `inth telemetry disable`."
      : "Usage telemetry is disabled. To enable it, run `inth telemetry enable`. INTH_TELEMETRY_DISABLED and CI override the saved preference.";
  }
  printResult(options.json, message, JSON.stringify({ enabled }));
};

const runResource = async (
  options: CliArguments,
  api: NativeApi,
  context: NativeContext
): Promise<void> => {
  const request =
    options.command === "api"
      ? rawApiRequest(options)
      : buildResourceRequest(options);
  const response = await api.execute(
    request.path,
    request.method,
    request.body,
    request.scoped ? await context.resolve(options.organization) : undefined
  );
  const output = apiOutput(response);
  diagnosticStep("resource_format");
  const message =
    options.json || options.command === "api"
      ? output
      : formatNativeResource(options, response, {
          color: colorEnabled(Boolean(process.stdout.isTTY)),
          columns: outputColumns(),
        });
  printResult(options.json, message, output || "null");
};

const promptsAllowed = (options: CliArguments): boolean =>
  !options.json && !options.nonInteractive;

const runOrganizationCreate = async (
  options: CliArguments,
  api: NativeApi
): Promise<void> => {
  const created = await api.createOrganization({
    name: options.name ?? "",
    slug: options.slug ?? "",
  });
  printResult(
    options.json,
    createdOrganizationMessage(created.data),
    JSON.stringify(created)
  );
};
const run = async (options: CliArguments): Promise<void> => {
  diagnosticStep("command_setup");
  if (options.version || options.help || !options.command) {
    printHelp(
      options.json,
      options.version,
      options.command,
      options.argument,
      outputColumns()
    );
    return;
  }
  if (options.command === "telemetry") {
    runTelemetry(options);
    return;
  }
  const environment = agentEnvironment(
    process.env.INTH_DEV_API_ORIGIN,
    process.env.INTH_DEV_DASHBOARD_ORIGIN,
    options.authMode ?? "agent"
  );
  if (options.command === "mcp") {
    diagnosticStep("mcp_command");
    await runMcp(options, controller.signal);
    return;
  }
  const allowInteractive = promptsAllowed(options);
  const key = apiKey(options.token, process.env.INTH_TOKEN);
  const directory = agentStateDirectory(nativeStateDirectory(), environment);
  const context = new NativeContext(directory, process.cwd());
  await selectCommandConnection(
    options,
    key,
    () => context.selectedConnection(),
    environment
  );
  const http = nativeHttp(controller.signal, nativeClock(controller.signal));
  const getStore = (): NativeStore => {
    mkdirSync(dirname(directory), { recursive: true });
    if (prepareDirectory(directory) !== 0) {
      throw new Error("Cannot create a private credential directory.");
    }
    return new NativeStore(
      new NativeKeychain("com.inth.cli", "oauth"),
      join(directory, "credentials.lock"),
      () => controller.signal.throwIfAborted(),
      observeCredential
    );
  };
  const getAuth = (): AuthFlow => new AuthFlow(http, getStore().adapter());
  const getAgent = (): AgentAuth => {
    getStore();
    const entry = new NativeKeychain("com.inth.cli", environment.account);
    const lock = new NativeStore(entry, join(directory, "agent.lock"), () =>
      controller.signal.throwIfAborted()
    );
    return new AgentAuth(
      nativeHttp(controller.signal, http.clock, false),
      {
        clear: async () => entry.clear(),
        exclusive: (work, deadline) => lock.exclusive(work, deadline),
        read: async () => entry.read(),
        write: async (value) => entry.write(value),
      },
      environment
    );
  };
  const getSelectedAuth = (): AccessTokenProvider => {
    if (options.authMode === "agent") {
      const agent = getAgent();
      return {
        accessToken: (rejected, force) => agent.accessToken(rejected, force),
        userInfoEndpoint: () => agent.userInfoEndpoint(),
      };
    }
    return getAuth().tokenProvider();
  };
  const api = new NativeApi(
    http,
    getSelectedAuth,
    key,
    observeIdentity,
    environment.apiOrigin
  );
  if (
    await runAgentCommand(
      options,
      async () => getAgent(),
      () => context.selectConnection("agent"),
      () => context.selectedConnection()
    )
  ) {
    return;
  }
  if (options.command === "login") {
    await runLogin(options, key, getAuth, api, context, allowInteractive);
  } else if (options.command === "logout") {
    await getAuth().logout();
    let message = "Signed out.";
    if (key) {
      message +=
        "\nThe supplied API key remains active. Unset INTH_TOKEN or revoke the key in the dashboard.";
    }
    printResult(
      options.json,
      message,
      JSON.stringify({ apiKeyStillActive: Boolean(key), signedOut: true })
    );
  } else if (options.command === "auth") {
    await runAuth(options, key, getAuth, getStore, context);
  } else if (options.command === "whoami") {
    const identity = await api.getMe(true);
    printResult(
      options.json,
      options.json
        ? ""
        : identitySummary(identity.data, {
            authMode: options.authMode,
            color: colorEnabled(Boolean(process.stdout.isTTY)),
            columns: outputColumns(),
            profile: identity.profile,
            selectedOrganization: await context.resolve(options.organization),
          }),
      JSON.stringify(identity)
    );
  } else if (options.command === "org" && options.argument === "create") {
    await runOrganizationCreate(options, api);
  } else if (options.command === "api" || resourceCommand(options)) {
    await runResource(options, api, context);
  } else {
    const organizations = await api.organizations();
    const selected = await chooseOrganization(
      organizations,
      options.argument || options.organization,
      undefined,
      nativeUI(controller.signal, allowInteractive)
    );
    if (options.command === "switch") {
      await context.select(selected);
      printResult(
        options.json,
        `Default organization: ${organizationReference(organizations, selected)}`,
        JSON.stringify({ organizationId: selected, scope: "user" })
      );
    } else {
      await context.link(selected);
      printResult(
        options.json,
        "Organization saved in .inth/project.json.",
        JSON.stringify({ organizationId: selected, scope: "project" })
      );
    }
  }
};

let exitCode = 0;
let errorCode = "";
let installationId = "";
let options: CliArguments | undefined;
const started = Date.now();
const localApiConfigured = Boolean(
  process.env.INTH_DEV_API_ORIGIN || process.env.INTH_DEV_DASHBOARD_ORIGIN
);
try {
  startErrorDiagnostics();
  diagnosticStep("argument_parse");
  options = parseArguments(process.argv.slice(2));
  if (
    telemetryCommand(options) &&
    !localApiConfigured &&
    !telemetryDisabled(process.env.INTH_TELEMETRY_DISABLED, process.env.CI)
  ) {
    // Telemetry state must never prevent a command from running.
    try {
      const telemetry = new NativeTelemetry(nativeStateDirectory(), false);
      installationId = telemetry.installationId();
      if (
        installationId &&
        promptsAllowed(options) &&
        process.stdin.isTTY &&
        process.stderr.isTTY
      ) {
        const notice = telemetry.notice(
          outputColumns(),
          colorEnabled(Boolean(process.stderr.isTTY))
        );
        if (notice) {
          console.error(notice);
        }
      }
    } catch {
      installationId = "";
    }
  }
  if (options.command === "skills" && !options.help && !options.version) {
    diagnosticStep("skills_command");
    exitCode = await runSkills(
      options,
      controller.signal,
      nativeUI(
        controller.signal,
        promptsAllowed(options),
        "Choose an Inth skill",
        false,
        "Skills selection"
      )
    );
    if (exitCode !== 0) {
      errorCode = [130, 143].includes(exitCode)
        ? "cancelled"
        : "command_failed";
    }
  } else {
    await run(options);
  }
} catch (error) {
  const failure = sandboxError(
    error instanceof Error ? error : new Error("Command failed."),
    agentSandbox(process.env.CURSOR_SANDBOX),
    nativeStateDirectory()
  );
  errorCode = controller.signal.aborted ? "cancelled" : telemetryError(failure);
  exitCode = reportError(
    process.argv.includes("--json"),
    failure,
    controller.signal.aborted
  );
  // SDK initialization and transmission happen only on the unexpected-error path.
  try {
    if (!localApiConfigured) {
      await reportUnexpectedError(
        failure,
        controller.signal.aborted,
        options,
        nativeStateDirectory(),
        options?.token || process.env.INTH_TOKEN ? "" : knownTelemetryUser
      );
    }
  } catch {
    // Preserve the original output and exit status even if state resolution fails.
  }
}
if (options && installationId) {
  const duration = Date.now() - started;
  const interactive =
    promptsAllowed(options) &&
    Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const telemetry = new NativeTelemetry(nativeStateDirectory(), false);
  if (options.command === "logout" || errorCode === "authentication_required") {
    observeCredential("");
    telemetry.clearIdentity();
  }
  const userId =
    options.token || process.env.INTH_TOKEN
      ? ""
      : await telemetry.userId(telemetryToken, knownTelemetryUser);
  await telemetry.send(
    telemetryPayload(
      options,
      installationId,
      duration,
      errorCode,
      interactive,
      userId
    )
  );
}
process.exit(exitCode);
