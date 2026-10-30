import { lstatSync, unlinkSync } from "node:fs";
import type { Stats } from "node:fs";

import { sameFileIdentity } from "./file-identity.ts";

export const removeCreatedFile = (path: string, created: Stats): void => {
  try {
    const current = lstatSync(path);
    if (sameFileIdentity(current, created)) {
      unlinkSync(path);
    }
  } catch (error) {
    // Scriptc filesystem errors carry errno in the message prefix.
    if (!(error instanceof Error && error.message.startsWith("ENOENT:"))) {
      throw error;
    }
  }
};
