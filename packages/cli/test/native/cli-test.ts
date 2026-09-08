/* eslint-disable require-await -- Scripted transports implement the async production contract. */
import { randomUUID } from "node:crypto";
// eslint-disable-next-line unicorn/import-style -- Scriptc requires named node:path imports.
import { join } from "node:path";

import { check, AuthScenario } from "../../bench/auth-workload.ts";
import { apiUrl } from "../../src/api-options.ts";
import { AuthFlow } from "../../src/auth-flow.ts";
import type { OAuthTransport, OAuthResponse } from "../../src/auth-types.ts";
import { NativeApi, apiOutput } from "../../src/native/native-api.ts";
import { writeConfig } from "../../src/native/native-bindings.ts";
import { NativeKeychain } from "../../src/native/native-keychain.ts";
import {
  parseDevice,
  parseDiscovery,
  parseTokens,
  responseError,
} from "../../src/native/native-protocol.ts";
import { NativeContext } from "../../src/native/native-state.ts";
import { NativeStore } from "../../src/native/native-store.ts";
import { chooseOrganization } from "../../src/organizations.ts";
import type { Organization } from "../../src/organizations.ts";

const directory = process.argv.length > 2 ? process.argv[2] : undefined;
if (!directory) {
  throw new Error("Missing test directory.");
}
const state = join(directory, "state");
const project = join(directory, "project");
const store = new NativeStore(
  new NativeKeychain("com.inth.cli.commands-test", randomUUID()),
  join(state, "credentials.lock")
);
const scenario = new AuthScenario();
const http: OAuthTransport = {
  clock: { now: () => scenario.time, sleep: (ms) => scenario.sleep(ms) },
  device: async (response) => parseDevice(response.body),
  discovery: async (response) => parseDiscovery(response.body),
  error: (response) => responseError(response),
  form: async (url, fields, _deadline) => scenario.next(url, fields),
  request: async (url) => scenario.next(url, new URLSearchParams()),
  tokens: async (response, previousRefreshToken) =>
    parseTokens(response.body, previousRefreshToken),
};
const auth = new AuthFlow(http, store.adapter());
try {
  await auth.login({
    show: async (device) => {
      check(device.user_code === "BENCH", "Wrong user code.");
    },
  });
  let requests = 0;
  const api = new NativeApi(
    {
      get: async (url, token): Promise<OAuthResponse> => {
        check(
          url === "https://api.inth.com/v1/projects?organizationId=org-one",
          "Missing organization query."
        );
        requests += 1;
        if (requests === 1) {
          check(token === "bench-first", "Wrong initial bearer.");
          return { body: "", ok: false, requestId: "test-401", status: 401 };
        }
        check(
          requests === 2 && token === "bench-second",
          "Incorrect 401 refresh retry."
        );
        return {
          body: '{"success":true,"data":[]}',
          ok: true,
          requestId: null,
          status: 200,
        };
      },
      post: async () => {
        throw new Error("Unexpected POST");
      },
      send: async () => {
        throw new Error("Unexpected mutation");
      },
    },
    () => auth
  );
  const response = await api.get("/v1/projects", "org-one");
  check(response.status === 200, "API request failed.");
  await auth.logout();
  check(scenario.position === 7, "Refresh or revocation was skipped.");
  check(
    apiOutput({
      body: '{"value":true}',
      ok: true,
      requestId: null,
      status: 200,
    }) === '{\n  "value": true\n}',
    "API JSON formatting failed."
  );
  let malformedOutput = false;
  try {
    apiOutput({
      body: "secret-invalid-json",
      ok: true,
      requestId: "bad-json",
      status: 200,
    });
  } catch (error) {
    malformedOutput =
      error instanceof Error &&
      error.message.includes("bad-json") &&
      !error.message.includes("secret-invalid-json");
  }
  check(
    malformedOutput,
    "Malformed API JSON was printed or lost its request ID."
  );
  const organizationBody =
    '{"success":true,"data":[{"id":"org-one","slug":"one","name":"One","role":"owner"}],"pagination":{"nextCursor":null,"hasMore":false}}';
  const listing = new NativeApi(
    {
      get: async (url, _token): Promise<OAuthResponse> => {
        check(
          url === "https://api.inth.com/v1/organizations?limit=100",
          "Wrong membership endpoint."
        );
        return {
          body: organizationBody,
          ok: true,
          requestId: null,
          status: 200,
        };
      },
      post: async () => {
        throw new Error("Unexpected POST");
      },
      send: async () => {
        throw new Error("Unexpected mutation");
      },
    },
    () => {
      throw new Error("Key listing touched credentials.");
    },
    "inth_key"
  );
  const listed = await listing.organizations();
  check(
    listed.length === 1 && listed[0]?.id === "org-one",
    "Membership response was not decoded."
  );
  const malformedListing = new NativeApi(
    {
      get: async (_url, _token): Promise<OAuthResponse> => ({
        body: '{"success":true,"data":[{"id":false,"slug":"one","name":"One","role":"owner"}],"pagination":{"nextCursor":null,"hasMore":false}}',
        ok: true,
        requestId: "bad-orgs",
        status: 200,
      }),
      post: async () => {
        throw new Error("Unexpected POST");
      },
      send: async () => {
        throw new Error("Unexpected mutation");
      },
    },
    () => {
      throw new Error("Key listing touched credentials.");
    },
    "inth_key"
  );
  let malformedOrganizations = false;
  try {
    await malformedListing.organizations();
  } catch (error) {
    malformedOrganizations =
      error instanceof Error && error.message.includes("bad-orgs");
  }
  check(malformedOrganizations, "Malformed membership fields were accepted.");
  let keyRequests = 0;
  const keyApi = new NativeApi(
    {
      get: async (_url, token): Promise<OAuthResponse> => {
        check(token === "inth_test_key", "Wrong organization key.");
        keyRequests += 1;
        return {
          body: '{"error":"access_denied"}',
          ok: false,
          requestId: "key-request",
          status: 401,
        };
      },
      post: async () => {
        throw new Error("Unexpected POST");
      },
      send: async () => {
        throw new Error("Unexpected mutation");
      },
    },
    () => {
      throw new Error("API key touched credentials.");
    },
    "inth_test_key"
  );
  let keyRejected = false;
  try {
    await keyApi.get("/v1/me");
  } catch (error) {
    keyRejected =
      error instanceof Error && error.message.includes("key-request");
  }
  check(
    keyRejected && keyRequests === 1,
    "API key retried or lost the request ID."
  );

  for (const path of [
    "https://evil.example/v1/me",
    "//evil.example/v1/me",
    "/v1/../private",
    "/v1/%2e%2e/private",
    "/v1/me#fragment",
    "https://user@api.inth.com/v1/me",
  ]) {
    let rejected = false;
    try {
      apiUrl(path);
    } catch {
      rejected = true;
    }
    check(rejected, "Unsafe bearer destination accepted.");
  }
  const context = new NativeContext(state, project);
  check(
    (await context.defaultOrganization()) === undefined,
    "Unexpected saved organization."
  );
  const organizations: Organization[] = [
    {
      id: "org-one",
      name: "One",
      role: "owner",
      slug: "one",
    },
    {
      id: "org-two",
      name: "Two",
      role: "member",
      slug: "two",
    },
  ];
  let prompts = 0;
  const selected = await chooseOrganization(
    organizations,
    undefined,
    undefined,
    {
      interactive: true,
      select: async (choices) => {
        prompts += 1;
        check(choices.length === 2, "Missing organization choices.");
        return "org-two";
      },
    }
  );
  check(
    selected === "org-two" && prompts === 1,
    "Organization selector did not return the chosen ID."
  );
  await context.select(selected);
  check(
    (await context.resolve()) === "org-two",
    "Default organization was not saved."
  );
  await context.link("org-one");
  check(
    (await context.resolve()) === "org-one",
    "Linked project did not override default."
  );
  check(
    (await context.defaultOrganization()) === "org-two",
    "Link changed the user default."
  );
  check(
    (await context.resolve("org-flag")) === "org-flag",
    "Flag did not override linked project."
  );
  const child = new NativeContext(state, join(project, "src", "nested"));
  check(
    (await child.resolve()) === "org-one",
    "Linked ancestor was not found."
  );
  check(
    writeConfig(join(state, "config.json"), '{"organizationId":false}') === 0,
    "Cannot write malformed test config."
  );
  let invalidConfig = false;
  try {
    await context.defaultOrganization();
  } catch {
    invalidConfig = true;
  }
  check(invalidConfig, "Malformed organization config was trusted.");
  await context.select("org-two");
  console.log(
    "Static CLI: API bearer, 401 refresh, API-key isolation, safe URLs, organization selection and project precedence passed."
  );
} finally {
  await store.clear();
}
process.exit(0);
