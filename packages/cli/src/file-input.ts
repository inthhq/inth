import { closeSync, constants, fstatSync, openSync, statSync } from "node:fs";
import type { Stats } from "node:fs";

import { CliError } from "./cli-error.ts";
import { sameFileIdentity } from "./file-identity.ts";

interface StableFile {
  descriptor: number;
  info: Stats;
}

export const openStableRegularFile = (
  path: string,
  option: string,
  allowStdin = false
): StableFile => {
  const selected = statSync(path);
  if (!selected.isFile()) {
    throw new CliError(
      "usage_error",
      `--${option} must name a regular file${allowStdin ? ", or - for stdin." : "."}`
    );
  }
  const descriptor = openSync(
    path,
    // eslint-disable-next-line no-bitwise -- Keep flags inline for Scriptc and refuse a substituted FIFO without blocking.
    constants.O_RDONLY | constants.O_NONBLOCK
  );
  let accepted = false;
  try {
    const info = fstatSync(descriptor);
    if (!info.isFile() || !sameFileIdentity(info, selected)) {
      throw new CliError(
        "usage_error",
        `--${option} must name a stable regular file.`
      );
    }
    accepted = true;
    return { descriptor, info };
  } finally {
    if (!accepted) {
      closeSync(descriptor);
    }
  }
};
