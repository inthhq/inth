import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";
import { setTimeout } from "node:timers/promises";

import type { CliArguments } from "./arguments.ts";
import { CliError } from "./cli-error.ts";
import { terminalText } from "./organizations.ts";

export const DOCUMENT_HASH_USAGE =
  "Usage: inth document hash <path|-> [--json]";

/** Arguments for `inth document hash`, which runs without sign-in. */
export interface DocumentHashArguments {
  /** A file path, or "-" for stdin. */
  path: string;
}

export interface DocumentHash {
  /** The path given, or null for stdin. */
  path: string | null;
  bytes: number;
  /** `sha256:` and the lowercase hex SHA-256 of the exact bytes. */
  hash: string;
}

/**
 * Parse the arguments after `inth document`, including the shared flags the
 * main parser would otherwise consume.
 * @param result The arguments parsed so far; receives the action, --help,
 * --json and --non-interactive.
 * @param args The arguments after `document`.
 * @returns The hash arguments.
 * @throws {CliError} usage_error for an unknown action or option.
 */
export const parseDocumentArguments = (
  result: CliArguments,
  args: string[]
): DocumentHashArguments => {
  const positional: string[] = [];
  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if (arg === "--json") {
      result.json = true;
    } else if (arg === "--non-interactive") {
      result.nonInteractive = true;
    } else if (arg.startsWith("-") && arg !== "-") {
      const equals = arg.indexOf("=");
      throw new CliError(
        "usage_error",
        `Unknown option "${terminalText(equals === -1 ? arg : arg.slice(0, equals))}". Run inth document hash --help.`
      );
    } else {
      positional.push(arg);
    }
  }
  const [action, path, ...extra] = positional;
  if (action !== undefined && action !== "hash") {
    throw new CliError("usage_error", DOCUMENT_HASH_USAGE);
  }
  result.argument = action ?? "";
  if (result.help) {
    return { path: path ?? "" };
  }
  if (!path || extra.length) {
    throw new CliError("usage_error", DOCUMENT_HASH_USAGE);
  }
  return { path };
};

const errorMessage = (error: Error | null): string => error?.message ?? "";

const readFailure = (path: string, message: string): CliError => {
  const name = terminalText(path);
  if (message.startsWith("ENOENT")) {
    return new CliError("usage_error", `File not found: ${name}`);
  }
  if (message.startsWith("EACCES") || message.startsWith("EPERM")) {
    return new CliError("usage_error", `Permission denied: ${name}`);
  }
  return new CliError("usage_error", `Cannot read ${name}.`);
};

const hashFile = async (
  path: string,
  signal: AbortSignal
): Promise<DocumentHash> => {
  let descriptor: number;
  try {
    // Nonblocking, so a FIFO named as the document cannot hang the open.
    // eslint-disable-next-line no-bitwise -- Keep flags inline for Scriptc.
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
  } catch (error) {
    throw readFailure(
      path,
      errorMessage(error instanceof Error ? error : null)
    );
  }
  try {
    if (!fstatSync(descriptor).isFile()) {
      throw new CliError(
        "usage_error",
        `${terminalText(path)} is not a regular file. Name a file, or - for stdin.`
      );
    }
    const hash = createHash("sha256");
    const buffer = new Uint8Array(65_536);
    let bytes = 0;
    for (;;) {
      signal.throwIfAborted();
      let count: number;
      try {
        count = readSync(descriptor, buffer, 0, buffer.byteLength, null);
      } catch (error) {
        throw readFailure(
          path,
          errorMessage(error instanceof Error ? error : null)
        );
      }
      if (!count) {
        break;
      }
      bytes += count;
      hash.update(buffer.subarray(0, count));
      // Let signals interrupt a long read in both runtime adapters.
      // eslint-disable-next-line no-await-in-loop -- Yield between bounded reads so cancellation can interrupt large files.
      await setTimeout(0);
    }
    return { bytes, hash: `sha256:${hash.digest("hex")}`, path };
  } finally {
    closeSync(descriptor);
  }
};

const stopStdin = (): void => {
  process.stdin.destroy();
};

const hashStdin = async (signal: AbortSignal): Promise<DocumentHash> => {
  if (process.stdin.isTTY) {
    throw new CliError(
      "usage_error",
      "Pipe the document to stdin when using inth document hash -."
    );
  }
  signal.addEventListener("abort", stopStdin, { once: true });
  const hash = createHash("sha256");
  let bytes = 0;
  try {
    for await (const chunk of process.stdin) {
      signal.throwIfAborted();
      // SAFETY: Node and Scriptc yield byte buffers from stdin without setEncoding.
      const input = chunk as Uint8Array;
      bytes += input.byteLength;
      hash.update(input);
    }
    signal.throwIfAborted();
  } finally {
    signal.removeEventListener("abort", stopStdin);
  }
  return { bytes, hash: `sha256:${hash.digest("hex")}`, path: null };
};

/**
 * Hash a published legal document the way Inth records its version: the
 * SHA-256 of the file's exact bytes, with no line-ending, whitespace or
 * encoding normalization.
 * @param path A file path, or "-" for stdin.
 * @param signal Cancels a long read.
 * @returns The path, byte count and `sha256:`-prefixed lowercase hex hash.
 * @throws {CliError} usage_error when the file is missing or unreadable.
 */
export const hashDocument = (
  path: string,
  signal: AbortSignal
): Promise<DocumentHash> =>
  path === "-" ? hashStdin(signal) : hashFile(path, signal);
