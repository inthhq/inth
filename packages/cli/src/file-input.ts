import { closeSync, constants, openSync } from "node:fs";

import { CliError } from "./cli-error.ts";
import {
  descriptorFileSnapshot,
  pathFileSnapshot,
  sameFileIdentity,
} from "./file-identity.ts";
import type { FileSnapshot } from "./file-identity.ts";

interface StableFile {
  descriptor: number;
  snapshot: FileSnapshot;
}

export const openStableRegularFile = (
  path: string,
  option: string,
  allowStdin = false
): StableFile => {
  const selected = pathFileSnapshot(path);
  if (!selected.info.isFile()) {
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
    const snapshot = descriptorFileSnapshot(descriptor);
    if (!snapshot.info.isFile() || !sameFileIdentity(snapshot, selected)) {
      throw new CliError(
        "usage_error",
        `--${option} must name a stable regular file.`
      );
    }
    accepted = true;
    return { descriptor, snapshot };
  } finally {
    if (!accepted) {
      closeSync(descriptor);
    }
  }
};
