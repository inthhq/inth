/* eslint-disable require-await -- Scripted HTTP adapters implement asynchronous production contracts. */
// Runs `inth c15t` against a scripted API from the working directory that
// scripts/c15t-checks.ts chooses. Arguments are the CLI arguments after `inth`.
import "../../src/native/native-bindings.ts";
import { parseArguments } from "../../src/arguments.ts";
import type { OAuthResponse } from "../../src/auth-types.ts";
import { NativeApi } from "../../src/native/native-api.ts";
import { runC15t } from "../../src/native/native-c15t.ts";
import type { HostedAgent } from "../../src/native/native-c15t.ts";
import { NativeContext } from "../../src/native/native-state.ts";

const BACKEND = "https://acme-website.c15t.dev";
const calls: string[] = [];
let lookups = 0;
const respond = (body: string): OAuthResponse => ({
  body,
  ok: true,
  requestId: "c15t-test",
  status: 200,
});
const project = (name: string, backend: string): string =>
  JSON.stringify({
    consent: backend ? { backendUrl: backend } : null,
    id: `prj_${name.toLowerCase()}`,
    name,
    organizationSlug: "acme",
  });
const reply = async (
  url: string,
  method: string,
  body?: string
): Promise<OAuthResponse> => {
  const path = url.replace("https://api.inth.com", "");
  calls.push(`${method} ${path}${body ? ` ${body}` : ""}`);
  if (method === "GET" && path.startsWith("/v1/projects?")) {
    return respond(
      `{"success":true,"data":[${project("Website", BACKEND)},${project("Pending", "")}],"pagination":{"hasMore":false,"nextCursor":null}}`
    );
  }
  if (method === "GET" && path === "/v1/regions") {
    return respond(
      '{"success":true,"data":[{"id":"eu","label":"Europe"},{"id":"us","label":"United States"}]}'
    );
  }
  if (method === "POST" && path.startsWith("/v1/projects?")) {
    if (!body?.includes('"consent":{"branding":"c15t"}')) {
      throw new Error(`Project creation needs consent.branding: ${body ?? ""}`);
    }
    return respond(`{"success":true,"data":${project("Created", "")}}`);
  }
  if (method === "GET" && path === "/v1/projects/prj_created") {
    // Provisioning finishes on the second lookup.
    lookups += 1;
    return respond(
      `{"success":true,"data":${project("Created", lookups > 1 ? BACKEND : "")}}`
    );
  }
  if (method === "POST" && path.startsWith("/v1/wizard/sessions")) {
    // scripts/c15t-checks.ts serves the gateway and the fx archive.
    const gateway = process.env.INTH_TEST_GATEWAY ?? "";
    return respond(
      `{"success":true,"data":{"sessionId":"wzs_1","token":"iwz_v1.test.sig","gatewayUrl":${JSON.stringify(gateway)},"model":"claude-opus-5-5","smallModel":"claude-haiku-5-5","expiresAt":"2030-01-01T00:00:00.000Z"}}`
    );
  }
  throw new Error(`Unexpected request: ${method} ${path}`);
};
const api = new NativeApi(
  {
    get: async (url): Promise<OAuthResponse> => reply(url, "GET"),
    post: async (url, _token, body): Promise<OAuthResponse> =>
      reply(url, "POST", body),
    send: async (url, _token, method, body): Promise<OAuthResponse> =>
      reply(url, method, body),
  },
  () => {
    throw new Error("The API key path read saved credentials.");
  },
  "inth_fixture"
);
// The hosted agent's archive comes from the check's local server, pinned to
// the checksum the check computed.
const hosted: HostedAgent = {
  release: {
    assets: {
      [`${process.platform}-${process.arch}`]: {
        name: "fx.tar.gz",
        sha256: process.env.INTH_TEST_FX_SHA256 ?? "",
      },
    },
    baseUrl: process.env.INTH_TEST_FX_URL ?? "http://127.0.0.1:9/",
    version: "0.0.0-test",
  },
  stateDirectory: process.env.INTH_TEST_STATE ?? process.cwd(),
};
const controller = new AbortController();
let exitCode = 0;
try {
  const options = parseArguments(process.argv.slice(2));
  await runC15t(
    options,
    api,
    new NativeContext(process.cwd(), process.cwd()),
    controller.signal,
    // scripts/test-c15t-ui.py drives the pickers through a terminal.
    process.env.INTH_TEST_C15T_INTERACTIVE === "1",
    hosted
  );
} catch (error) {
  console.error(`ERROR ${error instanceof Error ? error.message : "failed"}`);
  exitCode = 1;
}
console.error(`CALLS ${JSON.stringify(calls)}`);
process.exit(exitCode);
