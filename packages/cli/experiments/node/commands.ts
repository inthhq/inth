import type { AgentAuth } from "../../src/agent-auth.ts";
import { runSelectedAgentCommand } from "../../src/agent-commands.ts";
import {
  agentEnvironment,
  agentStateDirectory,
} from "../../src/agent-environment.ts";
import { parseArguments } from "../../src/arguments.ts";
import type { CliArguments } from "../../src/arguments.ts";
import { CliError } from "../../src/cli-error.ts";
import { selectCommandConnection } from "../../src/connection-selection.ts";
import { colorEnabled, organizationReference } from "../../src/display.ts";
import { identitySummary } from "../../src/identity.ts";
import type { OrganizationUI } from "../../src/organizations.ts";
import {
  chooseOrganization,
  createdOrganizationMessage,
} from "../../src/organizations.ts";
import {
  printResult,
  printHelp,
  requireInteractiveLogin,
} from "../../src/output.ts";
import {
  buildResourceRequest,
  rawApiRequest,
  resourceCommand,
} from "../../src/resource-commands.ts";
import { runSkills } from "../../src/skills.ts";
import { ApiClient, apiKey } from "./api.ts";
import type { CredentialStore } from "./auth.ts";
import { Auth } from "./auth.ts";
import { openBrowser } from "./browser.ts";
import { HttpClient, systemClock } from "./http.ts";
import { listOrganizations, organizationUI } from "./organization-ui.ts";
import { httpsUrl } from "./protocol.ts";
import type { DeviceAuthorization } from "./protocol.ts";
import { formatResource } from "./resource-output.ts";
import { OrganizationContext, stateDirectory } from "./state.ts";

export const showDevice = async (
  device: DeviceAuthorization,
  noBrowser: boolean
): Promise<void> => {
  const approvalUrl = httpsUrl.parse(device.verification_uri_complete);
  // Restrict terminal output to printable ASCII; codes are issued for humans to transcribe.
  const code = device.user_code.replaceAll(/[^\u0020-\u007E]/gu, "");
  console.log(`Your code: ${code}`);
  console.log(`Approve sign-in: ${approvalUrl}`);
  if (!noBrowser) {
    try {
      await openBrowser(approvalUrl);
    } catch {
      console.error(
        "Could not open your browser. Open the approval link above."
      );
    }
  }
  console.log("Waiting for approval. Press Ctrl+C to cancel.");
};

const runAuthCommand = async (
  options: CliArguments,
  key: string | undefined,
  getStore: () => Promise<CredentialStore>,
  getAuth: () => Promise<Auth>,
  context: OrganizationContext
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
    return;
  }
  if (options.argument === "refresh") {
    const auth = await getAuth();
    await auth.refresh();
    printResult(
      options.json,
      "Refreshed the saved sign-in.",
      JSON.stringify({ credentialSource: "browser", refreshed: true })
    );
    return;
  }
  const store = await getStore();
  const saved = await store.exclusive(() => store.read());
  if (!saved) {
    throw new CliError(
      "authentication_required",
      "Not signed in. Run inth login."
    );
  }
  printResult(
    options.json,
    `Saved browser sign-in. Access token expires ${new Date(saved.expires_at).toISOString()}.\nSession validity will be checked on the next API request.`,
    JSON.stringify({
      credentialPresent: true,
      credentialSource: "browser",
      expiresAt: saved.expires_at,
      organizationId: (await context.resolve(options.organization)) ?? null,
      validated: false,
    })
  );
};
export const selectLoginOrganization = async (
  options: CliArguments,
  api: ApiClient,
  context: OrganizationContext,
  ui: OrganizationUI
): Promise<void> => {
  const organizations = await listOrganizations(api);
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
    ui
  );
  await context.select(selected);
  printResult(
    options.json,
    `Default organization: ${organizationReference(organizations, selected)}`,
    JSON.stringify({
      credentialSource: "browser",
      organizationId: selected,
    })
  );
};
const runLogout = async (
  options: CliArguments,
  key: string | undefined,
  getAuth: () => Promise<Auth>
): Promise<void> => {
  const auth = await getAuth();
  await auth.logout();
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
};
const canLogin = (allowed: boolean): boolean =>
  allowed && Boolean(process.stdin.isTTY && process.stdout.isTTY);
const terminalColumns = (): number => process.stdout.columns || 80;
const runResourceCommand = async (
  options: CliArguments,
  api: ApiClient,
  context: OrganizationContext
): Promise<boolean> => {
  if (options.command === "org" && options.argument === "create") {
    const created = await api.createOrganization({
      name: options.name ?? "",
      slug: options.slug ?? "",
    });
    printResult(
      options.json,
      createdOrganizationMessage(created.data),
      JSON.stringify(created)
    );
    return true;
  }
  if (options.command === "api" || resourceCommand(options)) {
    const request =
      options.command === "api"
        ? rawApiRequest(options)
        : buildResourceRequest(options);
    const result = await api.execute(
      request.path,
      request.method,
      request.body,
      request.scoped ? await context.resolve(options.organization) : undefined
    );
    const message = formatResource(options, result, {
      color: colorEnabled(Boolean(process.stdout.isTTY)),
      columns: terminalColumns(),
    });
    printResult(options.json, message, result || "null");
    return true;
  }
  return false;
};
const runWhoami = async (
  options: CliArguments,
  api: ApiClient,
  context: OrganizationContext
): Promise<void> => {
  const identity = await api.getMe(true);
  printResult(
    options.json,
    options.json
      ? ""
      : identitySummary(identity.data, {
          authMode: options.authMode,
          color: colorEnabled(Boolean(process.stdout.isTTY)),
          columns: terminalColumns(),
          profile: identity.profile,
          selectedOrganization: await context.resolve(options.organization),
        }),
    JSON.stringify(identity)
  );
};

export const run = async (
  args: string[],
  signal: AbortSignal,
  createAgent?: () => Promise<AgentAuth>
): Promise<void> => {
  const options = parseArguments(args);
  if (options.help || options.version || !options.command) {
    printHelp(
      options.json,
      options.version,
      options.command,
      options.argument,
      process.stdout.columns
    );
    return;
  }
  const allowInteractive = !options.json && !options.nonInteractive;
  if (options.command === "skills") {
    process.exitCode = await runSkills(
      options,
      signal,
      organizationUI(
        signal,
        allowInteractive,
        "Choose an Inth skill",
        "Skills selection cancelled."
      )
    );
    return;
  }
  const environment = agentEnvironment(
    process.env.INTH_DEV_API_ORIGIN,
    process.env.INTH_DEV_DASHBOARD_ORIGIN,
    options.authMode || "agent"
  );
  const key = apiKey(options.token, process.env.INTH_TOKEN);
  const directory = agentStateDirectory(stateDirectory(), environment);
  const context = new OrganizationContext(directory, process.cwd());
  await selectCommandConnection(
    options,
    key,
    () => context.selectedConnection(),
    environment
  );
  const http = new HttpClient(
    (url, init) => fetch(url, init),
    systemClock(signal),
    signal
  );
  const getStore = async () => {
    const { platformStore } = await import("./store.ts");
    return platformStore(directory);
  };
  const getAuth = async () => new Auth(http, await getStore());
  const createPlatformAgent = async () => {
    const { agentAuth } = await import("./agent-auth.ts");
    return agentAuth(
      new HttpClient(
        (url, init) => fetch(url, init),
        http.clock,
        signal,
        false
      ),
      directory,
      environment
    );
  };
  let agent: Promise<AgentAuth> | undefined;
  const getAgent = () => (agent ??= (createAgent ?? createPlatformAgent)());
  const getSelectedAuth = () =>
    options.authMode === "agent" ? getAgent() : getAuth();
  const api = new ApiClient(http, getSelectedAuth, key, environment.apiOrigin);
  if (
    await runSelectedAgentCommand(
      options,
      getAgent,
      () => context.selectConnection("agent"),
      () => context.selectedConnection()
    )
  ) {
    return;
  }
  if (await runResourceCommand(options, api, context)) {
    return;
  }
  switch (options.command) {
    case "login": {
      if (key) {
        printResult(
          options.json,
          "Using the supplied organization API key. No browser sign-in needed.",
          JSON.stringify({ credentialSource: "api_key", validated: false })
        );
        return;
      }
      requireInteractiveLogin(canLogin(allowInteractive));
      const auth = await getAuth();
      await auth.login({
        show: (device) => showDevice(device, options.noBrowser),
      });
      await context.selectConnection("browser");
      console.log("Signed in.");
      await selectLoginOrganization(
        options,
        api,
        context,
        organizationUI(signal, allowInteractive)
      );
      return;
    }
    case "logout": {
      await runLogout(options, key, getAuth);
      return;
    }
    case "auth": {
      await runAuthCommand(options, key, getStore, getAuth, context);
      return;
    }
    case "whoami": {
      await runWhoami(options, api, context);
      return;
    }
    case "switch":
    case "link": {
      const organizations = await listOrganizations(api);
      const selected = await chooseOrganization(
        organizations,
        options.argument || options.organization,
        undefined,
        organizationUI(signal, allowInteractive)
      );
      await (options.command === "switch"
        ? context.select(selected)
        : context.link(selected));
      printResult(
        options.json,
        options.command === "switch"
          ? `Default organization: ${organizationReference(organizations, selected)}`
          : "Organization saved in .inth/project.json.",
        JSON.stringify({
          organizationId: selected,
          scope: options.command === "switch" ? "user" : "project",
        })
      );
      return;
    }
    default: {
      throw new CliError("usage_error", "Unknown command. Run inth --help.");
    }
  }
};
