/* eslint-disable no-await-in-loop -- Exercise native mutations and their fixtures in order. */
import "../../src/native/native-file-identity.ts";
// eslint-disable-next-line unicorn/import-style -- Scriptc requires named path imports.
import { join } from "node:path";

import { validateWriteSchema } from "../../src/agent-access-write-input.ts";
import { runV2Write } from "../../src/agent-access-write-runner.ts";
import type { AccessTokenProvider } from "../../src/agent-types.ts";
import { parseArguments } from "../../src/arguments.ts";
import { CliError } from "../../src/cli-error.ts";
import { NativeApi, apiOutput } from "../../src/native/native-api.ts";
import { nativeClock, nativeHttp } from "../../src/native/native-http.ts";
import { nativeUI } from "../../src/native/native-ui.ts";
import type { OrganizationUI } from "../../src/organizations.ts";
import { buildResourceRequest } from "../../src/resource-commands.ts";
import { prepareResourceInput } from "../../src/resource-input.ts";
import {
  billingQuote,
  v2WriteCases,
  writeUuid,
} from "../fixtures/agent-access-v2-writes.ts";

const base = process.argv[2] ?? "";
const directory = process.argv[3] ?? "";
const scenario = process.argv[4] ?? "all";
if (!base.startsWith("http://127.0.0.1:") || !directory) {
  throw new Error("Expected a local fixture URL and directory.");
}
// eslint-disable-next-line prefer-destructuring -- Scriptc lowers property access on this native handle.
const signal = new AbortController().signal;
const http = nativeHttp(signal, nativeClock(signal));
const imagePut = http.putImage;
if (!imagePut) {
  throw new Error("Missing native image transport.");
}
const local = (url: string): string => {
  if (!url.startsWith("https://api.inth.com/v1/")) {
    throw new Error("Unexpected trusted API URL.");
  }
  return base + url.slice("https://api.inth.com".length);
};
let authorizations = 0;
const auth: AccessTokenProvider = {
  accessToken: () => {
    authorizations += 1;
    if (
      scenario.endsWith("auth-missing") ||
      (scenario.endsWith("refresh-auth") && authorizations === 2)
    ) {
      throw new CliError("authentication_required", "Sign in first.");
    }
    if (scenario.endsWith("auth-discovery")) {
      throw new Error("Authorization discovery unavailable.");
    }
    return Promise.resolve(
      authorizations === 1 ? "native-write-token" : "native-refreshed-token"
    );
  },
  // eslint-disable-next-line unicorn/no-useless-undefined -- The auth interface requires a string or undefined result, not void.
  userInfoEndpoint: () => Promise.resolve(undefined),
};
const api = new NativeApi(
  {
    get: (url, token) => http.get(local(url), token),
    post: (url, token, body) => http.post(local(url), token, body),
    putImage: (url, token, bytes, mediaType) =>
      imagePut(local(url), token, bytes, mediaType),
    send: (url, token, method, body, accept, once) =>
      http.send(local(url), token, method, body, accept, once),
  },
  () => auth
);
const run = async (args: string[]): Promise<string> => {
  const options = parseArguments([...args, "--json"]);
  await prepareResourceInput(options, signal);
  let resolutions = 0;
  const result = await runV2Write(
    options,
    buildResourceRequest(options),
    {
      execute: async (
        path,
        method,
        body,
        organization,
        accept,
        once,
        observeDispatch
      ) =>
        apiOutput(
          await api.execute(
            path,
            method,
            body,
            organization,
            accept,
            once,
            observeDispatch
          )
        ),
      putImage: async (path, bytes, mediaType, organization, observeDispatch) =>
        apiOutput(
          await api.putImage(
            path,
            bytes,
            mediaType,
            organization,
            observeDispatch
          )
        ),
    },
    (organization?: string): Promise<string | undefined> => {
      resolutions += 1;
      return Promise.resolve(organization ?? "org_123");
    },
    (_message: string): OrganizationUI => ({
      interactive: false,
      select: () => Promise.resolve("cancel"),
    })
  );
  if (resolutions > 1) {
    throw new Error("Resolved the organization more than once.");
  }
  return result;
};
const fixtureArgs = (index: number): string[] => {
  const example = v2WriteCases[index];
  if (!example) {
    throw new Error("Missing write fixture.");
  }
  const args = [...example.args];
  if (example.image) {
    args[args.indexOf("--file") + 1] = join(directory, "image.png");
  }
  return args;
};
if (scenario === "validation") {
  for (const startsAt of [
    "2026-01-01T24:00:00Z",
    "2024-02-29T23:59:59.1Z",
    "2024-02-29T23:59:59.12+05:30",
    "2024-02-29T23:59:59.123456789Z",
  ]) {
    let rejected = false;
    try {
      validateWriteSchema("BillingPlanChangeInput", {
        approvedQuote: {
          ...billingQuote,
          nextCycle: { startsAt, total: 1200 },
        },
        input: {
          checkoutAttemptId: writeUuid,
          plan: "starter",
          product: "inth",
        },
      });
    } catch (error) {
      rejected = error instanceof CliError && error.code === "usage_error";
    }
    if (rejected !== startsAt.includes("T24:")) {
      throw new Error(
        `Native billing quote timestamp validation failed: ${startsAt}`
      );
    }
  }
  const invalid = [
    ["org", "settings-update", "org_123", "--name", "a"],
    [
      "consent",
      "runtime-key-create",
      "--project",
      "prj_123",
      "--data",
      '{"name":"a\\u200Bb"}',
    ],
    [
      "integration",
      "github-repository-update",
      "repo_123",
      "--branch-filters",
      '[""]',
    ],
    [
      "integration",
      "github-repository-update",
      "repo_123",
      "--ignored-paths",
      JSON.stringify(["a".repeat(1025)]),
    ],
  ];
  for (const args of invalid) {
    let rejected = false;
    try {
      parseArguments(args);
    } catch (error) {
      rejected = error instanceof CliError && error.code === "usage_error";
    }
    if (!rejected) {
      throw new Error("Native parser accepted invalid bounded input.");
    }
  }
  const website = v2WriteCases.at(0);
  if (!website?.body) {
    throw new Error("Missing website fixture.");
  }
  for (const origin of ["not a domain", "ftp://example.com", "example.com"]) {
    const args = [...website.args];
    args[args.indexOf("--data") + 1] = website.body.replace(
      "https://example.com",
      origin
    );
    let rejected = false;
    try {
      parseArguments(args);
    } catch (error) {
      rejected = error instanceof CliError && error.code === "usage_error";
    }
    if (rejected !== (origin !== "example.com")) {
      throw new Error(
        "Native website origin validation differs from the input contract."
      );
    }
  }
  parseArguments([
    "org",
    "settings-update",
    "org_123",
    "--name",
    "a".repeat(255),
  ]);
  parseArguments([
    "integration",
    "github-repository-update",
    "repo_123",
    "--branch-filters",
    "[]",
  ]);
} else if (scenario === "interactive") {
  const example = v2WriteCases.at(12);
  if (!example) {
    throw new Error("Missing plan change fixture.");
  }
  const options = parseArguments(example.args.filter((arg) => arg !== "--yes"));
  let mutations = 0;
  try {
    await runV2Write(
      options,
      buildResourceRequest(options),
      {
        execute: () => {
          mutations += 1;
          return Promise.resolve(example.response);
        },
        putImage: () => {
          throw new Error("Unexpected image upload.");
        },
      },
      (_organization?: string): Promise<string | undefined> =>
        Promise.resolve("org_123"),
      (message) => nativeUI(signal, true, message, false, "Action")
    );
    if (mutations !== 1) {
      throw new Error("Expected one confirmed mutation.");
    }
  } catch (error) {
    if (
      !(error instanceof CliError) ||
      error.code !== "cancelled" ||
      mutations !== 0
    ) {
      throw error;
    }
    process.exitCode = 130;
  }
  console.log(JSON.stringify({ mutations }));
} else if (scenario === "approval") {
  const path = join(directory, "approval.json");
  await run([...fixtureArgs(13), "--save-approval", path]);
  await run(["billing", "credit-purchase", "--data-file", path, "--yes"]);
} else if (scenario === "all") {
  for (let i = 0; i < v2WriteCases.length; i += 1) {
    const result = await run(fixtureArgs(i));
    const expected = v2WriteCases[i];
    if (
      !expected ||
      JSON.stringify(JSON.parse(result)) !==
        JSON.stringify(JSON.parse(expected.response))
    ) {
      throw new Error(`Native write response mismatch at ${i}.`);
    }
  }
} else {
  let index = 40;
  if (scenario.startsWith("refresh")) {
    index = 22;
  }
  if (scenario.startsWith("image")) {
    index = 28;
  }
  if (scenario === "pending") {
    index = 49;
  }
  if (
    scenario.endsWith("auth-missing") ||
    scenario.endsWith("auth-discovery") ||
    scenario.endsWith("refresh-auth")
  ) {
    let caught = false;
    try {
      await run(fixtureArgs(index));
    } catch (error) {
      caught = scenario.endsWith("auth-discovery")
        ? error instanceof Error &&
          error.message === "Authorization discovery unavailable."
        : error instanceof CliError && error.code === "authentication_required";
    }
    if (!caught) {
      throw new Error(
        "A credential failure lost its original error before dispatch."
      );
    }
  } else if (
    scenario.endsWith("lost") ||
    ["rate", "image-rate", "image-redirect"].includes(scenario)
  ) {
    let caught = false;
    try {
      await run(fixtureArgs(index));
    } catch (error) {
      caught =
        error instanceof CliError && error.code === "mutation_outcome_unknown";
    }
    if (!caught) {
      throw new Error(
        "A failed one-shot write did not report unknown outcome."
      );
    }
  } else {
    await run(fixtureArgs(index));
    if (scenario.includes("refresh") && authorizations !== 2) {
      throw new Error("Expected exactly one safe authentication refresh.");
    }
  }
}
console.log(JSON.stringify({ passed: true, scenario }));
