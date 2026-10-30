import { unlinkSync } from "node:fs";

import { pathFileIdentity } from "./file-identity.ts";
import type { FileSnapshot } from "./file-identity.ts";

export const removeCreatedFile = (
  path: string,
  created: FileSnapshot
): void => {
  try {
    if (pathFileIdentity(path, false) === created.identity) {
      unlinkSync(path);
    }
  } catch (error) {
    // Scriptc filesystem errors carry errno in the message prefix.
    if (!(error instanceof Error && error.message.startsWith("ENOENT:"))) {
      throw error;
    }
  }
};
