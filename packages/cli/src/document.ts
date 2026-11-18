import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readSync,
  statSync,
} from "node:fs";
import { setTimeout } from "node:timers/promises";

import type { CliArguments } from "./arguments.ts";
import { CliError } from "./cli-error.ts";
import { terminalText } from "./organizations.ts";

export const DOCUMENT_HASH_USAGE =
  "Usage: inth document hash <path|-> [--json]";

export interface DocumentHashArguments {
  /** A file path, or "-" for stdin. */
  path: string;
}

export interface DocumentHash {
  /** The path given, or null for stdin. */
  path: string | null;
  bytes: number;
  hash: string;
}

type AddBytes = (bytes: Uint8Array) => void;

const unknownOption = (option: string): CliError =>
  new CliError(
    "usage_error",
    `Unknown option "${terminalText(option)}". Run inth document hash --help.`
  );

export const parseDocumentArguments = (
  result: CliArguments,
  args: string[]
): DocumentHashArguments => {
  // The top-level parser stores these outside result.values, so a copy before
  // "document" never reaches the loop below.
  if (result.organization !== undefined) {
    throw unknownOption("--organization");
  }
  if (result.authMode !== undefined) {
    throw unknownOption("--auth");
  }
  if (result.token !== undefined) {
    throw unknownOption("--token");
  }
  if (result.noBrowser) {
    throw unknownOption("--no-browser");
  }
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
      throw unknownOption(equals === -1 ? arg : arg.slice(0, equals));
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

const accessFile = <T>(path: string, access: () => T): T => {
  try {
    return access();
  } catch (error) {
    const name = terminalText(path);
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("ENOENT")) {
      throw new CliError("usage_error", `File not found: ${name}`);
    }
    if (message.startsWith("EACCES") || message.startsWith("EPERM")) {
      throw new CliError("usage_error", `Permission denied: ${name}`);
    }
    throw new CliError("usage_error", `Cannot read ${name}.`);
  }
};

const notRegularFile = (path: string): CliError =>
  new CliError(
    "usage_error",
    `${terminalText(path)} is not a regular file. Name a file, or - for stdin.`
  );

// The same checks as openStableRegularFile in file-input.ts, whose errors name
// a --option instead of the path.
const readFile = async (path: string, add: AddBytes): Promise<void> => {
  // Windows refuses to open a directory, so check the type before opening.
  if (!accessFile(path, () => statSync(path)).isFile()) {
    throw notRegularFile(path);
  }
  const descriptor = accessFile(path, () =>
    // eslint-disable-next-line no-bitwise -- Keep flags inline for Scriptc and refuse a FIFO without blocking.
    openSync(path, constants.O_RDONLY | constants.O_NONBLOCK)
  );
  try {
    // The path can be replaced between the stat and the open.
    if (!fstatSync(descriptor).isFile()) {
      throw notRegularFile(path);
    }
    const buffer = new Uint8Array(65_536);
    for (let reads = 1; ; reads += 1) {
      const count = accessFile(path, () =>
        readSync(descriptor, buffer, 0, buffer.byteLength, null)
      );
      if (!count) {
        return;
      }
      add(buffer.subarray(0, count));
      // Each timer waits about 1 ms, so yield once per 1 MiB, not per read.
      if (reads % 16 === 0) {
        // eslint-disable-next-line no-await-in-loop -- Yield between bounded batches so cancellation can interrupt large files.
        await setTimeout(0);
      }
    }
  } finally {
    closeSync(descriptor);
  }
};

const stopStdin = (): void => {
  process.stdin.destroy();
};

const readStdin = async (add: AddBytes, signal: AbortSignal): Promise<void> => {
  if (process.stdin.isTTY) {
    throw new CliError(
      "usage_error",
      "Pipe the document to stdin when using inth document hash -."
    );
  }
  signal.addEventListener("abort", stopStdin, { once: true });
  try {
    for await (const input of process.stdin) {
      // SAFETY: Node and Scriptc yield byte buffers from stdin without setEncoding.
      add(input as Uint8Array);
    }
  } finally {
    signal.removeEventListener("abort", stopStdin);
  }
};

/**
 * Hash a published legal document the way Inth records its version:
 * `sha256:` and the lowercase hex SHA-256 of the exact bytes, with no
 * line-ending, whitespace or encoding normalization.
 */
export const hashDocument = async (
  path: string,
  signal: AbortSignal
): Promise<DocumentHash> => {
  signal.throwIfAborted();
  const hash = createHash("sha256");
  let bytes = 0;
  const add: AddBytes = (input) => {
    signal.throwIfAborted();
    bytes += input.byteLength;
    hash.update(input);
  };
  const stdin = path === "-";
  await (stdin ? readStdin(add, signal) : readFile(path, add));
  signal.throwIfAborted();
  return {
    bytes,
    hash: `sha256:${hash.digest("hex")}`,
    path: stdin ? null : path,
  };
};
