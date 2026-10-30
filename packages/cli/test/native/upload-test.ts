/* eslint-disable no-await-in-loop -- Native fixture operations share one transport and run sequentially. */
import "../../src/native/native-file-identity.ts";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { setTimeout } from "node:timers/promises";

import { parseArguments } from "../../src/arguments.ts";
import { CliError } from "../../src/cli-error.ts";
import { NativeApi } from "../../src/native/native-api.ts";
import { nativeClock, nativeHttp } from "../../src/native/native-http.ts";
import { buildResourceRequest } from "../../src/resource-commands.ts";
import { prepareResourceInput } from "../../src/resource-input.ts";
import { runResourceUpload } from "../../src/resource-upload.ts";
import { putSupportFile } from "../../src/storage-upload.ts";

const check = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};
const [base, directory] = process.argv.slice(2);
if (!base || !directory) {
  throw new Error("Expected local upload fixture URL and directory.");
}
const controller = new AbortController();
const { signal } = controller;
const fixtureOrganization = (): Promise<string | undefined> =>
  Promise.resolve<string | undefined>("org_native");
const http = nativeHttp(signal, nativeClock(signal));
const destination = (url: string): string =>
  `${base}${new URL(url).pathname}${new URL(url).search}`;
const api = new NativeApi(
  {
    get: (url, token) => http.get(destination(url), token),
    post: (url, token, body) => http.post(destination(url), token, body),
    send: (url, token, method, body, accept) =>
      http.send(destination(url), token, method, body, accept),
    uploadChat: (url, token, body) => {
      const send = http.uploadChat;
      if (!send) {
        throw new Error("Missing one-shot native upload transport.");
      }
      return send(destination(url), token, body);
    },
  },
  () => ({
    accessToken: () => Promise.resolve("native-upload-token"),
    userInfoEndpoint: (): Promise<string | undefined> =>
      Promise.resolve<string | undefined>("https://api.inth.com/userinfo"),
  })
);
const uploadApi = {
  execute: async (
    path: string,
    method: string,
    body?: string,
    organization?: string
  ) => {
    const response = await api.execute(path, method, body, organization);
    return response.body;
  },
  uploadChat: (body: string, organization?: string) =>
    api.uploadChat(body, organization),
};
for (const replaced of [false, true]) {
  const receiptPath = `${directory}/selection-${replaced}.json`;
  let refused = false;
  try {
    await runResourceUpload(
      parseArguments([
        "support",
        "attachment-upload",
        "--file",
        `${directory}/recording.webm`,
        "--receipt",
        receiptPath,
      ]),
      uploadApi,
      () => {
        if (replaced) {
          renameSync(receiptPath, `${receiptPath}.original`);
          writeFileSync(receiptPath, "replacement receipt");
        }
        throw new CliError("usage_error", "Organization selection failed.");
      },
      signal,
      "https://api.inth.com"
    );
  } catch (error) {
    refused = error instanceof CliError && error.code === "usage_error";
  }
  check(refused, "Native organization selection lost its original failure.");
  check(
    replaced
      ? readFileSync(receiptPath, "utf-8") === "replacement receipt"
      : !existsSync(receiptPath),
    "Native organization selection did not safely clean up its receipt."
  );
}
let replayBody = "";
for (const source of [
  '{"attachmentIds":["aga_second","aga_first"]}',
  '{"message":"","attachmentIds":["aga_second","aga_first"]}',
]) {
  const options = parseArguments(["chat", "start", "--data", source]);
  await prepareResourceInput(options, signal);
  const body = buildResourceRequest(options).body ?? "";
  replayBody = body;
  // SAFETY: prepareResourceInput validated the request body before this native behavior assertion.
  const decoded = JSON.parse(body) as {
    message: string;
    attachmentIds: string[];
    clientMessageId: string;
  };
  check(
    decoded.message === "" &&
      decoded.attachmentIds.join(",") === "aga_second,aga_first" &&
      !!decoded.clientMessageId,
    "Native attachment-only preparation lost the manifest or UUID."
  );
  await prepareResourceInput(options, signal);
  check(
    buildResourceRequest(options).body === body,
    "Native preparation regenerated message identity."
  );
}
const replayed = await api.execute(
  "/v1/agent-chats",
  "POST",
  replayBody,
  "org_native"
);
check(
  replayed.status === 202,
  "Native chat attachment message replay did not recover."
);
for (const source of [
  '{"message":"x","attachmentIds":[1]}',
  '{"message":"x","attachmentIds":["aga_first","aga_first"]}',
  '{"message":"x","extra":"field"}',
]) {
  let refused = false;
  try {
    parseArguments(["chat", "start", "--data", source]);
  } catch {
    refused = true;
  }
  check(refused, "Native chat input accepted invalid attachment JSON.");
}
const chat = await runResourceUpload(
  parseArguments([
    "chat",
    "attachment-upload",
    "--file",
    `${directory}/document.pdf`,
  ]),
  uploadApi,
  fixtureOrganization,
  signal,
  "https://api.inth.com"
);
check(
  chat.includes('"aga_native"') && !chat.includes('"data":"'),
  "Native chat upload omitted ready metadata or exposed content."
);
const sendOnce = http.uploadChat;
if (!sendOnce) {
  throw new Error("Missing upload transport");
}
const limited = await sendOnce(
  `${base}/chat-rate-limit`,
  "native-upload-token",
  "{}"
);
check(limited.status === 429, "Native chat upload retried rate limit.");
const support = await runResourceUpload(
  parseArguments([
    "support",
    "attachment-upload",
    "--file",
    `${directory}/recording.webm`,
    "--receipt",
    `${directory}/receipt.json`,
    "--client-attachment-id",
    "b8dde372-1324-4d2e-a15a-fd3761964299",
  ]),
  uploadApi,
  fixtureOrganization,
  signal,
  "https://api.inth.com",
  (file, grant, id, transferSignal) =>
    putSupportFile(file, grant, id, transferSignal, (_url, init) =>
      fetch(`${base}/storage`, init)
    )
);
check(
  support.includes('"ready"') && !support.includes("vercel-blob"),
  "Native Support upload did not finalize safely."
);
const cancellation = new AbortController();
const cancelledUpload = runResourceUpload(
  parseArguments([
    "support",
    "attachment-upload",
    "--file",
    `${directory}/recording.webm`,
    "--client-attachment-id",
    "65c07b5a-2e96-43b0-9c73-feced0a76530",
  ]),
  uploadApi,
  fixtureOrganization,
  cancellation.signal,
  "https://api.inth.com",
  async (file, grant, id, transferSignal) => {
    const putting = putSupportFile(
      file,
      grant,
      id,
      transferSignal,
      (_url, init) => fetch(`${base}/cancel-storage`, init)
    );
    await setTimeout(15);
    cancellation.abort();
    await putting;
  }
);
let cancelled = false;
try {
  await cancelledUpload;
} catch {
  cancelled = cancellation.signal.aborted;
}
check(cancelled, "Native 100 MiB transfer did not cancel.");
console.log("upload-test passed");
