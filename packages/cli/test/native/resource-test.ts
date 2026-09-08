/* eslint-disable require-await -- Scripted HTTP adapters implement asynchronous production contracts. */
import "../../src/native/native-bindings.ts";
import "../../src/auth-flow.ts";
import { parseArguments } from "../../src/arguments.ts";
import type { OAuthResponse } from "../../src/auth-types.ts";
import { NativeApi, apiOutput } from "../../src/native/native-api.ts";
import {
  buildResourceRequest,
  rawApiRequest,
} from "../../src/resource-commands.ts";
import {
  requestCases,
  invalidRequests,
} from "../fixtures/resource-requests.ts";

const check = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};
let expectedMethod = "";
let expectedUrl = "";
let expectedBody: string | undefined;
let calls = 0;
const verify = async (
  url: string,
  token: string,
  method: string,
  body?: string
): Promise<OAuthResponse> => {
  check(url === expectedUrl, `Wrong URL for ${expectedMethod}: ${url}`);
  check(method === expectedMethod, "Wrong HTTP method");
  check(body === expectedBody, "Wrong request body");
  check(token === "inth_fixture", "Wrong bearer token");
  calls += 1;
  return {
    body: '{"success":true,"data":{"id":"resource_123"}}',
    ok: true,
    requestId: "resource-id",
    status: 200,
  };
};
const api = new NativeApi(
  {
    get: (url, token) => verify(url, token, "GET"),
    post: (url, token, body) => verify(url, token, "POST", body),
    send: verify,
  },
  () => {
    throw new Error("API key accessed credentials");
  },
  "inth_fixture"
);
for (const example of requestCases) {
  const request = buildResourceRequest(parseArguments(example.args));
  check(request.path === example.path, `Wrong command path: ${request.path}`);
  check(request.method === example.method, "Wrong command method");
  check(request.body === example.body, "Wrong command body");
  check(request.scoped === example.scoped, "Wrong organization scope");
  check(
    !example.scoped || Boolean(example.scopedPath),
    "Missing scoped URL fixture"
  );
  expectedUrl = `https://api.inth.com${example.scoped ? example.scopedPath : example.path}`;
  expectedMethod = example.method;
  expectedBody = example.body;
  // eslint-disable-next-line no-await-in-loop -- Exercise one request and expectation at a time.
  const response = await api.execute(
    request.path,
    request.method,
    request.body,
    request.scoped ? "org_default" : undefined
  );
  check(apiOutput(response).includes("resource_123"), "Lost API result");
}
check(calls === requestCases.length, "Unexpected request replay");
for (const args of invalidRequests) {
  let rejected = false;
  try {
    parseArguments(args);
  } catch {
    rejected = true;
  }
  check(rejected, `Accepted invalid arguments: ${args.join(" ")}`);
}
const raw = rawApiRequest(
  parseArguments([
    "api",
    "/v1/projects/prj_123",
    "--method",
    "patch",
    "--data",
    '{"description":null}',
  ])
);
check(
  raw.method === "PATCH" && raw.body === '{"description":null}',
  "Raw mutation changed"
);
let pages = 0;
const listing = new NativeApi(
  {
    get: async (url): Promise<OAuthResponse> => {
      pages += 1;
      check(
        url ===
          (pages === 1
            ? "https://api.inth.com/v1/organizations?limit=100"
            : "https://api.inth.com/v1/organizations?limit=100&cursor=next%2B%2F%3D"),
        "Wrong organization page URL"
      );
      return {
        body: JSON.stringify({
          data: [
            {
              id: `org_${pages}`,
              name: "Team",
              role: "owner",
              slug: `team-${pages}`,
            },
          ],
          pagination: {
            hasMore: pages === 1,
            nextCursor: pages === 1 ? "next+/=" : null,
          },
          success: true,
        }),
        ok: true,
        requestId: "page-id",
        status: 200,
      };
    },
    post: () => {
      throw new Error("Unexpected POST");
    },
    send: () => {
      throw new Error("Unexpected mutation");
    },
  },
  () => {
    throw new Error("Unexpected credentials");
  },
  "inth_fixture"
);
const organizations = await listing.organizations();
check(
  organizations.length === 2 && organizations[1]?.id === "org_2",
  "Lost later memberships"
);
console.log(
  "Native resource requests, input validation, writes, and organization pagination passed."
);
process.exit(0);
