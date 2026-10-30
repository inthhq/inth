import { existsSync, statSync, writeSync } from "node:fs";
// eslint-disable-next-line unicorn/import-style -- Scriptc requires named path imports.
import { dirname, resolve } from "node:path";
import { setTimeout } from "node:timers/promises";

import type { CliArguments } from "./arguments.ts";
import { CliError } from "./cli-error.ts";
import type { DownloadResult } from "./download.ts";
import { terminalText } from "./organizations.ts";
import { PrivateOutputFile } from "./private-output-file.ts";
import { optionValue, resourceCommand } from "./resource-commands.ts";

export const validateDownloadOutput = (options: CliArguments): void => {
  if (
    !resourceCommand(options)?.download &&
    !(options.command === "api" && optionValue(options, "output") !== undefined)
  ) {
    return;
  }
  const output = optionValue(options, "output") ?? "";
  if (!output || output === "-" || output !== terminalText(output)) {
    throw new CliError(
      "usage_error",
      "Use --output <new-file> to save binary data. Binary output cannot be written to the terminal."
    );
  }
  try {
    if (existsSync(output)) {
      throw new CliError(
        "usage_error",
        "The output path already exists. Choose a new file; downloads never overwrite files."
      );
    }
    if (!statSync(dirname(resolve(output))).isDirectory()) {
      throw new Error("Missing directory");
    }
  } catch (error) {
    if (error instanceof CliError) {
      throw error;
    }
    throw new CliError(
      "usage_error",
      "The --output parent must be an existing directory."
    );
  }
};

export const saveResourceDownload = async (
  options: CliArguments,
  download: DownloadResult,
  signal: AbortSignal
): Promise<string> => {
  signal.throwIfAborted();
  const path = resolve(optionValue(options, "output") ?? "");
  try {
    const output = new PrivateOutputFile(path);
    try {
      let offset = 0;
      while (offset < download.bytes.byteLength) {
        signal.throwIfAborted();
        const count = writeSync(
          output.descriptor,
          download.bytes,
          offset,
          Math.min(65_536, download.bytes.byteLength - offset)
        );
        if (!count) {
          throw new Error("File write made no progress");
        }
        offset += count;
        // eslint-disable-next-line no-await-in-loop -- Yield between bounded writes so Ctrl+C can cancel local file output.
        await setTimeout(0);
      }
      signal.throwIfAborted();
      output.finish();
    } finally {
      output.dispose();
    }
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof CliError) {
      throw error;
    }
    throw new CliError(
      "file_write_failed",
      "Cannot save the download to --output. Choose a writable new file."
    );
  }
  return JSON.stringify({
    bytes: download.bytes.byteLength,
    contentType: download.contentType,
    path,
    requestId: download.requestId,
  });
};
