/* eslint-disable require-await -- Browser approval implements the shared asynchronous login UI contract. */
import { homedir } from "node:os";
// eslint-disable-next-line unicorn/import-style -- Scriptc requires named node:path imports.
import { join } from "node:path";

import { apiKey } from "./api-options.ts";
import { parseArguments } from "./arguments.ts";
import { AuthFlow } from "./auth-flow.ts";
import { CliError } from "./cli-error.ts";
import { colorEnabled, organizationReference } from "./display.ts";
import { identitySummary } from "./identity.ts";
import { NativeApi, apiOutput } from "./native/native-api.ts";
import {
  openBrowser,
  outputColumns,
  prepareDirectory,
} from "./native/native-bindings.ts";
import { nativeClock, nativeHttp } from "./native/native-http.ts";
import { NativeKeychain } from "./native/native-keychain.ts";
import { httpsUrl } from "./native/native-protocol.ts";
import { formatNativeResource } from "./native/native-resource-output.ts";
import { NativeContext } from "./native/native-state.ts";
import { NativeStore } from "./native/native-store.ts";
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
import {
  buildResourceRequest,
  rawApiRequest,
  resourceCommand,
} from "./resource-commands.ts";

const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());
let exitCode = 0;
try {
  const options = parseArguments(process.argv.slice(2));
  if (options.version || options.help || !options.command) {
    printHelp(options.json, options.version);
    process.exit(0);
  }
  const allowInteractive = !options.json && !options.nonInteractive;
  const key = apiKey(options.token, process.env.INTH_TOKEN);
  // Preserve the existing native sign-in and defaults while Node/yao retain their own store.
  const directory = join(
    homedir(),
    "Library",
    "Application Support",
    "inth-scriptc"
  );
  const context = new NativeContext(directory, process.cwd());
  const http = nativeHttp(controller.signal, nativeClock(controller.signal));
  const getStore = (): NativeStore => {
    if (prepareDirectory(directory) !== 0) {
      throw new Error("Cannot create a private credential directory.");
    }
    return new NativeStore(
      new NativeKeychain("com.inth.cli.scriptc", "oauth"),
      join(directory, "credentials.lock"),
      () => controller.signal.throwIfAborted()
    );
  };
  const getAuth = (): AuthFlow => new AuthFlow(http, getStore().adapter());
  const api = new NativeApi(http, getAuth, key);
  if (options.command === "login") {
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
      console.log("Signed in.");
      const organizations = await api.organizations();
      if (organizations.length === 0 && !options.organization) {
        console.log(
          "Create your first organization with inth org create --name <name> --slug <slug>."
        );
        process.exit(0);
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
  } else if (options.command === "whoami") {
    const identity = await api.getMe(true);
    printResult(
      options.json,
      options.json
        ? ""
        : identitySummary(identity.data, {
            color: colorEnabled(Boolean(process.stdout.isTTY)),
            columns: outputColumns(),
            profile: identity.profile,
            selectedOrganization: await context.resolve(options.organization),
          }),
      JSON.stringify(identity)
    );
  } else if (options.command === "org" && options.argument === "create") {
    const created = await api.createOrganization({
      name: options.name ?? "",
      slug: options.slug ?? "",
    });
    printResult(
      options.json,
      createdOrganizationMessage(created.data),
      JSON.stringify(created)
    );
  } else if (options.command === "api" || resourceCommand(options)) {
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
    const message =
      options.json || options.command === "api"
        ? output
        : formatNativeResource(options, response, {
            color: colorEnabled(Boolean(process.stdout.isTTY)),
            columns: outputColumns(),
          });
    printResult(options.json, message, output || "null");
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
} catch (error) {
  exitCode = reportError(
    process.argv.includes("--json"),
    error instanceof Error ? error : new Error("Command failed."),
    controller.signal.aborted
  );
}
process.exit(exitCode);
