import { closeSync, constants, openSync, writeSync } from "node:fs";

import { descriptorFileSnapshot } from "./file-identity.ts";
import type { FileSnapshot } from "./file-identity.ts";
import { removeCreatedFile } from "./file-output-cleanup.ts";

export const writeAllSync = (descriptor: number, bytes: Uint8Array): void => {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const count = writeSync(
      descriptor,
      bytes,
      offset,
      bytes.byteLength - offset,
      offset
    );
    if (!count) {
      throw new Error("File write made no progress.");
    }
    offset += count;
  }
};

export class PrivateOutputFile {
  readonly descriptor: number;
  private readonly created: FileSnapshot;
  private readonly path: string;
  private closed = false;
  private complete = false;

  constructor(path: string) {
    this.path = path;
    this.descriptor = openSync(
      path,
      // eslint-disable-next-line no-bitwise -- Scriptc requires inline exclusive-open flags.
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
      0o600
    );
    try {
      this.created = descriptorFileSnapshot(this.descriptor);
    } catch (error) {
      // Without a descriptor identity, the path cannot be safely removed.
      closeSync(this.descriptor);
      throw error;
    }
  }

  private close(): void {
    if (!this.closed) {
      this.closed = true;
      closeSync(this.descriptor);
    }
  }

  finish(): void {
    this.close();
    this.complete = true;
  }

  dispose(): void {
    try {
      this.close();
    } finally {
      if (!this.complete) {
        removeCreatedFile(this.path, this.created);
      }
    }
  }
}
