import { randomUUID } from "node:crypto";
import { closeSync, readSync } from "node:fs";
import { setTimeout } from "node:timers/promises";

import type { CliArguments } from "./arguments.ts";
import { encodeChatBody } from "./chat.ts";
import type { ChatBody } from "./chat.ts";
import { CliError } from "./cli-error.ts";
import { openStableRegularFile } from "./file-input.ts";
import { prepareImageInput } from "./image-input.ts";
import {
  buildResourceRequest,
  optionValue,
  resourceCommand,
  rawApiRequest,
} from "./resource-commands.ts";

const inputLimit = (option: string): number =>
  option === "message-file" ? 304_096 : 1_048_576;

const tooLarge = (option: string, limit: number): CliError =>
  new CliError(
    "usage_error",
    `--${option} exceeds the ${limit} byte input limit.`
  );

const stopStdin = (): void => {
  process.stdin.destroy();
};

const readStdin = async (
  option: string,
  limit: number,
  signal: AbortSignal
): Promise<string> => {
  if (process.stdin.isTTY) {
    throw new CliError(
      "usage_error",
      `Pipe UTF-8 input when using --${option} -.`
    );
  }
  signal.addEventListener("abort", stopStdin, { once: true });
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    for await (const chunk of process.stdin) {
      signal.throwIfAborted();
      // SAFETY: Node and Scriptc yield byte buffers from stdin without setEncoding.
      const input = chunk as Uint8Array;
      bytes += input.byteLength;
      if (bytes > limit) {
        throw tooLarge(option, limit);
      }
      text += decoder.decode(input, { stream: true });
    }
    signal.throwIfAborted();
    return text + decoder.decode();
  } finally {
    signal.removeEventListener("abort", stopStdin);
  }
};

export const readResourceInput = async (
  path: string,
  option: string,
  signal: AbortSignal,
  limit = inputLimit(option)
): Promise<string> => {
  signal.throwIfAborted();
  try {
    if (path === "-") {
      return await readStdin(option, limit, signal);
    }
    const { descriptor: handle, info } = openStableRegularFile(
      path,
      option,
      true
    );
    try {
      if (info.size > limit) {
        throw tooLarge(option, limit);
      }
      const decoder = new TextDecoder("utf-8", { fatal: true });
      const buffer = new Uint8Array(16_384);
      let bytes = 0;
      let text = "";
      for (;;) {
        signal.throwIfAborted();
        const count = readSync(handle, buffer, 0, buffer.byteLength, null);
        if (!count) {
          break;
        }
        bytes += count;
        if (bytes > limit) {
          throw tooLarge(option, limit);
        }
        text += decoder.decode(buffer.subarray(0, count), { stream: true });
        // Let signals interrupt a long read in both runtime adapters.
        // eslint-disable-next-line no-await-in-loop -- Yield between bounded reads so cancellation can interrupt large files.
        await setTimeout(0);
      }
      return text + decoder.decode();
    } finally {
      closeSync(handle);
    }
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof CliError) {
      throw error;
    }
    throw new CliError(
      "usage_error",
      `Cannot read --${option}. Use a readable UTF-8 file or piped input.`
    );
  }
};

export const prepareResourceInput = async (
  options: CliArguments,
  signal: AbortSignal
): Promise<void> => {
  if (!resourceCommand(options) && options.command !== "api") {
    return;
  }
  for (const option of ["data-file", "message-file"]) {
    const path = optionValue(options, option);
    if (path !== undefined) {
      // eslint-disable-next-line no-await-in-loop -- Input sources are exclusive and must be resolved before request validation.
      const input = await readResourceInput(
        path,
        option,
        signal,
        options.command === "feedback" ? 65_536 : inputLimit(option)
      );
      options.values = options.values.filter((entry) => entry.name !== option);
      options.values.push({
        name: option === "data-file" ? "data" : "message",
        value: input,
      });
    }
  }
  if (options.command === "api") {
    rawApiRequest(options);
    return;
  }
  buildResourceRequest(options);
  if (resourceCommand(options)?.image) {
    await prepareImageInput(options, signal);
  }
  if (
    options.command !== "chat" ||
    !["start", "send"].includes(options.argument)
  ) {
    return;
  }
  const data = optionValue(options, "data");
  let id = optionValue(options, "client-message-id");
  if (data !== undefined) {
    // SAFETY: buildResourceRequest has validated every chat body field.
    const body = JSON.parse(data) as ChatBody;
    id = body.clientMessageId;
    if (!id) {
      id = randomUUID();
      options.values = options.values.filter((entry) => entry.name !== "data");
      options.values.push({
        name: "data",
        value: encodeChatBody(
          body.message ?? "",
          id,
          body.inboxItemId,
          body.attachmentIds
        ),
      });
      options.generatedClientMessageId = id;
    }
  } else if (!id) {
    id = randomUUID();
    options.values.push({ name: "client-message-id", value: id });
    options.generatedClientMessageId = id;
  }
};
