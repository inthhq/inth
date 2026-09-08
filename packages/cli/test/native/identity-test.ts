/* eslint-disable require-await -- In-memory transports implement the production asynchronous API contract. */
import "../../src/auth-flow.ts";
import type { OAuthResponse } from "../../src/auth-types.ts";
import { CliError } from "../../src/cli-error.ts";
import { colorEnabled } from "../../src/display.ts";
import { identitySummary } from "../../src/identity.ts";
import { NativeApi } from "../../src/native/native-api.ts";
import { outputColumns } from "../../src/native/native-bindings.ts";
import { printResult, reportError } from "../../src/output.ts";
import {
  keyIdentity,
  layoutIdentity,
  userIdentity,
} from "../fixtures/identity.ts";

const check = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};
const scenario = process.argv.length > 2 ? process.argv[2] : "user";
let body = JSON.stringify(userIdentity);
if (scenario === "key") {
  body = JSON.stringify(keyIdentity);
}
if (scenario === "layout") {
  body = JSON.stringify(layoutIdentity);
}
if (scenario === "unicode") {
  body = JSON.stringify({
    ...layoutIdentity,
    data: {
      ...layoutIdentity.data,
      organizations: [
        {
          id: "org-one",
          name: "東京開発チーム🌱".repeat(4),
          role: "owner",
          slug: "a-very-long-organization-slug-that-must-stay-readable",
        },
      ],
    },
  });
}
if (scenario === "future") {
  body = JSON.stringify({
    ...userIdentity,
    data: { ...userIdentity.data, principal: { type: "service" } },
  });
}
if (scenario === "malformed") {
  body = JSON.stringify({
    ...userIdentity,
    data: { ...userIdentity.data, principal: { type: "" } },
  });
}
if (scenario === "missing") {
  body =
    '{"success":true,"data":{"principal":{"type":"oauth"},"organizations":[]}}';
}
if (scenario === "failed") {
  body =
    '{"success":false,"data":{"principal":{"type":"oauth"},"activeOrganizationId":null,"organizations":[]}}';
}
if (scenario === "scopes") {
  body = JSON.stringify({
    ...userIdentity,
    data: { ...userIdentity.data, scopes: [42] },
  });
}
if (scenario === "missing-capabilities") {
  body =
    '{"success":true,"data":{"principal":{"type":"oauth"},"activeOrganizationId":null,"organizations":[]}}';
}
const api = new NativeApi(
  {
    get: async (url, token): Promise<OAuthResponse> => {
      check(
        url === "https://api.inth.com/v1/me",
        "Identity request must not include an organization filter."
      );
      check(token === "inth_fixture", "Wrong bearer token.");
      return { body, ok: true, requestId: "whoami-id", status: 200 };
    },
    post: async () => {
      throw new Error("Unexpected POST");
    },
    send: async () => {
      throw new Error("Unexpected mutation");
    },
  },
  () => {
    throw new Error("Identity key request accessed credentials.");
  },
  "inth_fixture"
);
try {
  const identity = await api.getMe();
  printResult(
    process.argv.includes("--json"),
    identitySummary(identity.data, {
      color: colorEnabled(Boolean(process.stdout.isTTY)),
      columns: outputColumns(),
      selectedOrganization: process.argv.includes("--selected")
        ? "org-one"
        : undefined,
    }),
    JSON.stringify(identity)
  );
  process.exit(0);
} catch (error) {
  check(error instanceof CliError, "Unexpected error type.");
  process.exit(
    reportError(
      process.argv.includes("--json"),
      error instanceof Error ? error : new Error("Failed."),
      false
    )
  );
}
