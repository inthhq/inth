/* eslint-disable no-await-in-loop -- Attempt every cleanup in order and preserve the first failure. */
import { rm } from "node:fs/promises";

// Scriptc does not support rm options or Error.code yet. Its filesystem errors
// carry the errno prefix in Error.message. Ignore only a missing file.
export const removeOptionalFile = async (filename: string): Promise<void> => {
  try {
    await rm(filename);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith("ENOENT:")) {
      throw error;
    }
  }
};

export const runWithCleanup = async (
  work: () => Promise<void>,
  cleanups: (() => Promise<void>)[]
): Promise<void> => {
  let failure: unknown;
  let failed = false;
  try {
    await work();
  } catch (error) {
    failed = true;
    failure = error;
  }
  for (const cleanup of cleanups) {
    try {
      await cleanup();
    } catch (error) {
      if (!failed) {
        failed = true;
        failure = error;
      }
    }
  }
  if (failed) {
    throw failure;
  }
};
