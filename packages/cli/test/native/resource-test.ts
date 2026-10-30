/* eslint-disable require-await -- Scripted HTTP adapters implement asynchronous production contracts. */
import "../../src/native/native-file-identity.ts";
import "../../src/native/native-bindings.ts";
import "../../src/auth-flow.ts";
import {
  existsSync,
  readFileSync,
  renameSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
// eslint-disable-next-line unicorn/import-style -- Scriptc requires named path imports.
import { join } from "node:path";

import { requireAccessPerson } from "../../src/agent-access-commands.ts";
import { formatAccessResource } from "../../src/agent-access-output.ts";
import { productionAgentEnvironment } from "../../src/agent-environment.ts";
import { parseArguments } from "../../src/arguments.ts";
import { SCOPE } from "../../src/auth-types.ts";
import type { OAuthResponse } from "../../src/auth-types.ts";
import { chatRetryDiagnostic, requireChatPerson } from "../../src/chat.ts";
import { CliError } from "../../src/cli-error.ts";
import { selectCommandConnection } from "../../src/connection-selection.ts";
import { NativeApi, apiOutput } from "../../src/native/native-api.ts";
import { approveResource } from "../../src/resource-approval.ts";
import {
  RESOURCE_COMMANDS,
  buildResourceRequest,
  rawApiRequest,
} from "../../src/resource-commands.ts";
import {
  saveResourceDownload,
  validateDownloadOutput,
} from "../../src/resource-download.ts";
import {
  prepareResourceInput,
  readResourceInput,
} from "../../src/resource-input.ts";
import {
  accessRequestCases,
  invalidAccessRequests,
} from "../fixtures/agent-access-requests.ts";
import { v2ReadCases } from "../fixtures/agent-access-v2-reads.ts";
import {
  requestCases,
  invalidRequests,
} from "../fixtures/resource-requests.ts";

const check = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};
const { signal } = new AbortController();
const browserScopes = SCOPE.split(" ");
for (const spec of RESOURCE_COMMANDS) {
  if (!spec.scopes?.length) {
    continue;
  }
  const needsApproval = spec.scopes.some(
    (scope) => !browserScopes.includes(scope)
  );
  for (const selected of ["browser", "agent"]) {
    const options = parseArguments([spec.command, spec.action, "--help"]);
    let refused = false;
    let failure = "";
    try {
      // eslint-disable-next-line no-await-in-loop -- Check each command and connection with isolated mutable options.
      await selectCommandConnection(
        options,
        undefined,
        (): Promise<string | undefined> => Promise.resolve(selected),
        productionAgentEnvironment
      );
    } catch (error) {
      if (!(error instanceof CliError) || error.code !== "usage_error") {
        throw error;
      }
      refused = true;
      failure = error.message;
    }
    check(
      refused === (needsApproval && selected === "browser"),
      `Incorrect credential support for ${spec.command} ${spec.action}: selected=${selected}, needsApproval=${needsApproval}, refused=${refused}, failure=${failure}.`
    );
  }
}
if (process.argv.includes("--chat-stdin-cancel")) {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 25);
  let cancelled = false;
  try {
    await readResourceInput("-", "message-file", controller.signal);
  } catch {
    cancelled = controller.signal.aborted;
  }
  check(cancelled, "Pending stdin did not cancel");
  console.log("Pending chat stdin cancelled.");
  process.exit(0);
}
if (process.argv.includes("--chat-stdin")) {
  const options = parseArguments(["chat", "start", "--message-file", "-"]);
  await prepareResourceInput(options, signal);
  console.log(buildResourceRequest(options).body);
  process.exit(0);
}
const chat = parseArguments([
  "chat",
  "start",
  "--message",
  "  Cookie question  ",
]);
const unprepared = buildResourceRequest(chat);
check(
  unprepared.body === '{"message":"Cookie question"}',
  "Chat parse changed message text"
);
check(!chatRetryDiagnostic(chat), "Parsing generated a retry ID");
await prepareResourceInput(chat, signal);
const prepared = buildResourceRequest(chat);
await prepareResourceInput(chat, signal);
check(
  buildResourceRequest(chat).body === prepared.body,
  "Chat retry ID changed"
);
check(Boolean(chatRetryDiagnostic(chat)), "Generated retry ID is missing");
// SAFETY: This fixture exercises the same checked JSON boundary as the production request.
const chatBody = JSON.parse(prepared.body ?? "") as {
  message: string;
  clientMessageId: string;
};
check(chatBody.message === "Cookie question", "Prepared message changed");
check(
  prepared.body ===
    `{"message":"Cookie question","clientMessageId":"${chatBody.clientMessageId}"}`,
  "Absent chat fields leaked into JSON"
);
check(
  /^[\da-f-]{36}$/u.test(chatBody.clientMessageId),
  "Generated retry ID is invalid"
);
const chatJson = parseArguments([
  "chat",
  "send",
  "chat/a?b",
  "--data",
  '{"message":" hello ","clientMessageId":"b8dde372-1324-4d2e-a15a-fd3761964299"}',
]);
await prepareResourceInput(chatJson, signal);
check(
  buildResourceRequest(chatJson).path ===
    "/v1/agent-chats/chat%2Fa%3Fb/messages",
  "Chat ID was not encoded"
);
check(!chatRetryDiagnostic(chatJson), "Explicit retry ID printed a diagnostic");
check(
  buildResourceRequest(chatJson).body ===
    '{"message":"hello","clientMessageId":"b8dde372-1324-4d2e-a15a-fd3761964299"}',
  "JSON chat fields were not normalized"
);
const chatInbox = parseArguments([
  "chat",
  "start",
  "--data",
  '{"message":"hello","inboxItemId":"inbox_123"}',
]);
await prepareResourceInput(chatInbox, signal);
check(
  buildResourceRequest(chatInbox).body ===
    `{"message":"hello","clientMessageId":"${chatInbox.generatedClientMessageId}","inboxItemId":"inbox_123"}`,
  "Generated chat JSON lost Inbox context"
);
for (const args of [
  ["chat", "start", "--message", " "],
  ["chat", "start", "--data", '{"message":null}'],
  ["chat", "start", "--data", '{"message":"hello","unknown":"value"}'],
  [
    "chat",
    "send",
    "chat_123",
    "--message",
    "hello",
    "--organization",
    "org_123",
  ],
  ["chat", "start", "--message", "hello", "--client-message-id", "bad-id"],
]) {
  let rejected = false;
  try {
    parseArguments(args);
  } catch {
    rejected = true;
  }
  check(rejected, "Accepted invalid chat input");
}
let keyRejected = false;
try {
  requireChatPerson(chat, "inth_fixture");
} catch {
  keyRejected = true;
}
check(keyRejected, "Chat accepted an organization API key");
const inputPath = join(tmpdir(), `inth-chat-input-${process.pid}.txt`);
try {
  writeFileSync(inputPath, "東京\nquestion");
  check(
    (await readResourceInput(inputPath, "message-file", signal)) ===
      "東京\nquestion",
    "File input lost UTF-8"
  );
  writeFileSync(inputPath, new Uint8Array([0xc3, 0x28]));
  let invalidUtf8 = false;
  try {
    await readResourceInput(inputPath, "message-file", signal);
  } catch {
    invalidUtf8 = true;
  }
  check(invalidUtf8, "Accepted invalid UTF-8 input");
} finally {
  unlinkSync(inputPath);
}
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
const binaryPath = join(tmpdir(), `inth-raw-binary-${process.pid}.bin`);
const binaryOptions = parseArguments([
  "api",
  "GET",
  "/v1/agent-chat-attachments/att_123/content",
  "--output",
  binaryPath,
  "--json",
]);
const rawBinary = rawApiRequest(binaryOptions);
check(
  rawBinary.method === "GET" &&
    rawBinary.path === "/v1/agent-chat-attachments/att_123/content" &&
    rawBinary.body === undefined,
  "Raw binary GET normalization failed."
);
validateDownloadOutput(binaryOptions);
try {
  const saved = await saveResourceDownload(
    binaryOptions,
    {
      bytes: new Uint8Array([0, 255, 128, 13, 10, 65]),
      contentType: "image/png",
      requestId: "native-raw-binary",
    },
    signal
  );
  const fileBytes = readFileSync(binaryPath);
  check(
    fileBytes.byteLength === 6 &&
      fileBytes[0] === 0 &&
      fileBytes[1] === 255 &&
      fileBytes[2] === 128 &&
      fileBytes[3] === 13 &&
      fileBytes[4] === 10 &&
      fileBytes[5] === 65,
    "Raw download output changed binary bytes."
  );
  // SAFETY: The output helper returns the metadata contract under test.
  const metadata = JSON.parse(saved) as {
    bytes: number;
    contentType: string;
    path: string;
    requestId: string;
  };
  check(
    metadata.bytes === 6 &&
      metadata.path === binaryPath &&
      metadata.contentType === "image/png" &&
      metadata.requestId === "native-raw-binary",
    "Raw download metadata was lost."
  );
  let overwriteRejected = false;
  try {
    validateDownloadOutput(binaryOptions);
  } catch {
    overwriteRejected = true;
  }
  check(overwriteRejected, "Raw output validation accepted an existing file.");
  let replaced = false;
  try {
    await saveResourceDownload(
      binaryOptions,
      { bytes: new Uint8Array([7]), contentType: "image/png", requestId: null },
      signal
    );
    replaced = true;
  } catch {
    /* An existing file must stay intact. */
  }
  check(
    !replaced && readFileSync(binaryPath).byteLength === 6,
    "Raw download overwrote an existing file."
  );
} finally {
  unlinkSync(binaryPath);
}
// Scriptc's Windows CRT opens do not share delete access for renaming open files.
const interruptedDownloads =
  process.platform === "win32" ? ["cancel"] : ["cancel", "missing", "file"];
for (const replacement of interruptedDownloads) {
  const movedPath = `${binaryPath}.partial`;
  const controller = new AbortController();
  const reason = new Error("Download stopped");
  const saving = saveResourceDownload(
    binaryOptions,
    {
      bytes: new Uint8Array(1_048_576),
      contentType: "image/png",
      requestId: null,
    },
    controller.signal
  );
  const waitForCancellation = async (): Promise<boolean> => {
    try {
      await saving;
      return false;
    } catch (error) {
      return error === reason;
    }
  };
  const cancelled = waitForCancellation();
  try {
    check(
      readFileSync(binaryPath).byteLength === 65_536,
      "Interrupted download did not write its first chunk."
    );
    if (replacement !== "cancel") {
      renameSync(binaryPath, movedPath);
      if (replacement === "file") {
        writeFileSync(binaryPath, "keep me");
      }
    }
    controller.abort(reason);
    // eslint-disable-next-line no-await-in-loop -- Each interruption reuses the same output paths after cleanup.
    check(await cancelled, "Download cleanup lost the cancellation reason.");
    if (replacement !== "cancel") {
      check(
        readFileSync(movedPath).byteLength === 65_536,
        "Download cleanup changed the moved partial file."
      );
    }
    check(
      replacement === "file"
        ? readFileSync(binaryPath, "utf-8") === "keep me"
        : !existsSync(binaryPath),
      "Download cleanup changed the replacement path."
    );
  } finally {
    controller.abort(reason);
    // eslint-disable-next-line no-await-in-loop -- Close the download before cleaning up, including failed race setup.
    await cancelled;
    if (existsSync(binaryPath)) {
      unlinkSync(binaryPath);
    }
    if (existsSync(movedPath)) {
      unlinkSync(movedPath);
    }
  }
}
for (const args of [
  ["api", "GET", "/v1/file", "--method", "GET", "--output", binaryPath],
  ["api", "/v1/file", "--method", "POST", "--output", binaryPath],
  ["api", "GET", "/v1/file", "--data", "{}", "--output", binaryPath],
]) {
  let rejected = false;
  try {
    parseArguments(args);
  } catch {
    rejected = true;
  }
  check(rejected, "A raw binary download accepted conflicting inputs.");
}
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
for (const example of accessRequestCases) {
  const options = parseArguments(example.args);
  // eslint-disable-next-line no-await-in-loop -- Native input preparation must preserve each command independently.
  await prepareResourceInput(options, signal);
  const request = buildResourceRequest(options);
  check(request.path === example.path, `Wrong access route: ${request.path}`);
  check(
    request.method === example.method && request.body === example.body,
    "Wrong access request inputs"
  );
  let personRequired = false;
  try {
    requireAccessPerson(options, "inth_fixture");
  } catch {
    personRequired = true;
  }
  check(personRequired, "A delegated access command accepted an API key");
}
for (const example of v2ReadCases) {
  const options = parseArguments(example.args);
  const request = buildResourceRequest(options);
  check(request.path === example.path, `Wrong V2 read route: ${request.path}`);
  check(
    request.method === "GET" && request.body === undefined,
    "A V2 read gained a request body"
  );
  const summary = formatAccessResource(options, example.body) ?? "";
  for (const expected of example.expected) {
    check(summary.includes(expected), `Missing V2 read value: ${expected}`);
  }
  let personRequired = false;
  try {
    requireAccessPerson(options, "inth_fixture");
  } catch {
    personRequired = true;
  }
  check(
    personRequired === !["billing", "code-audit"].includes(options.command),
    "Wrong V2 credential boundary"
  );
}
for (const args of [
  ["chat", "get", "chat_\u0085x"],
  ["chat", "get", "chat_\u2003x"],
  ["billing", "ledger", "--since", "2026-02-30T00:00:00Z"],
  ["billing", "ledger", "--since", "2026-01-01T00:00:00.1234567890Z"],
  [
    "billing",
    "ledger",
    "--since",
    "2026-10-29T09:00:00-02:00",
    "--until",
    "2026-10-29T10:00:00Z",
  ],
  ["billing", "ledger", "--product", "consent"],
  ["integration", "status", "--limit", "20"],
  ["org", "settings-get", "org_123", "--organization", "org_123"],
]) {
  let rejected = false;
  try {
    parseArguments(args);
  } catch {
    rejected = true;
  }
  check(rejected, `Accepted invalid resource input: ${args.join(" ")}`);
}
for (const args of invalidAccessRequests) {
  let rejected = false;
  try {
    parseArguments(args);
  } catch {
    rejected = true;
  }
  check(rejected, `Accepted invalid delegated input: ${args.join(" ")}`);
}
let approvals = 0;
const confirm = parseArguments([
  "chat",
  "share",
  "chat_123",
  "--visibility",
  "organization",
]);
await approveResource(confirm, {
  interactive: true,
  select: async (entries): Promise<string> => {
    check(
      entries.length === 2 && entries[0]?.id === "cancel",
      "Approval must default to cancellation"
    );
    check(
      Boolean(entries[1]?.slug.includes("chat_123")),
      "Approval lost explicit target"
    );
    approvals += 1;
    return "confirm";
  },
});
check(approvals === 1, "Irreversible sharing did not ask exactly once");
const usageSummary = formatAccessResource(
  parseArguments(["billing", "usage"]),
  '{"success":true,"data":{"creditUsage":{"items":[],"page":1,"totalPages":2,"periodDays":30}}}'
);
check(
  Boolean(usageSummary?.includes("--page 2")),
  "Credit usage continuation is missing"
);
const writeSummary = formatAccessResource(
  parseArguments(["website", "policies-set", "target_123", "--urls", "[]"]),
  '{"success":true,"data":{"unknown":{"retained":true}}}'
);
check(
  Boolean(writeSummary?.includes("retained")),
  "Human write response lost returned data"
);
console.log(
  "Native resource requests, input validation, writes, and organization pagination passed."
);
process.exit(0);
