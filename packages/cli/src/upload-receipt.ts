/* eslint-disable no-bitwise -- Filesystem flags and private mode checks use bit masks. */
import {
  closeSync,
  constants,
  fsyncSync,
  fstatSync,
  ftruncateSync,
  lstatSync,
  openSync,
  realpathSync,
} from "node:fs";
import type { Stats } from "node:fs";
// eslint-disable-next-line unicorn/import-style -- Scriptc requires named path imports.
import { dirname, resolve } from "node:path";

import { CliError } from "./cli-error.ts";
import { sameFileSnapshot } from "./file-identity.ts";
import { removeCreatedFile } from "./file-output-cleanup.ts";
import { PrivateOutputFile, writeAllSync } from "./private-output-file.ts";

export interface UploadReceiptData {
  schemaVersion: number;
  stage: string;
  apiOrigin: string;
  organizationId: string;
  clientAttachmentId: string;
  attachmentId?: string;
  fileName: string;
  mediaType: string;
  sizeBytes: number;
}

const receiptError = (): CliError =>
  new CliError(
    "receipt_write_failed",
    "Cannot safely write --receipt. Choose a new file in a private writable directory. Keep the recovery IDs printed to stderr."
  );

const writeContents = (descriptor: number, data: UploadReceiptData): void => {
  const bytes = new TextEncoder().encode(`${JSON.stringify(data, null, 2)}\n`);
  writeAllSync(descriptor, bytes);
  ftruncateSync(descriptor, bytes.byteLength);
  fsyncSync(descriptor);
};

const writeReceipt = (path: string, data: UploadReceiptData): Stats => {
  const output = new PrivateOutputFile(path);
  try {
    writeContents(output.descriptor, data);
    const written = fstatSync(output.descriptor);
    output.finish();
    return written;
  } finally {
    output.dispose();
  }
};

const syncDirectory = (path: string): void => {
  if (process.platform === "win32") {
    return;
  }
  const descriptor = openSync(path, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
};
export class UploadReceipt {
  readonly path: string;
  private written: Stats;
  private readonly parent: string;
  constructor(path: string, data: UploadReceiptData) {
    this.path = resolve(path);
    let created: Stats | undefined;
    try {
      this.parent = realpathSync(dirname(this.path));
      const directory = lstatSync(dirname(this.path));
      // eslint-disable-next-line no-bitwise -- Reject directories writable by another user.
      if (
        path === "-" ||
        !directory.isDirectory() ||
        directory.isSymbolicLink() ||
        (process.platform !== "win32" && (directory.mode & 0o022) !== 0)
      ) {
        throw receiptError();
      }
      created = writeReceipt(this.path, data);
      this.written = created;
      syncDirectory(this.parent);
    } catch {
      if (created) {
        removeCreatedFile(this.path, created);
      }
      throw receiptError();
    }
  }
  update(data: UploadReceiptData): void {
    let descriptor = -1;
    try {
      const current = lstatSync(this.path);
      const directory = lstatSync(dirname(this.path));
      // eslint-disable-next-line no-bitwise -- Only update the private receipt this operation created.
      if (
        !current.isFile() ||
        current.isSymbolicLink() ||
        !sameFileSnapshot(current, this.written) ||
        (process.platform !== "win32" && (current.mode & 0o077) !== 0) ||
        realpathSync(dirname(this.path)) !== this.parent ||
        !directory.isDirectory() ||
        directory.isSymbolicLink() ||
        (process.platform !== "win32" && (directory.mode & 0o022) !== 0)
      ) {
        throw receiptError();
      }
      descriptor = openSync(
        this.path,
        // eslint-disable-next-line no-bitwise -- Refuse a substituted FIFO without blocking or truncating it.
        constants.O_RDWR | constants.O_NONBLOCK
      );
      const opened = fstatSync(descriptor);
      if (!opened.isFile() || !sameFileSnapshot(opened, current)) {
        throw receiptError();
      }
      writeContents(descriptor, data);
      this.written = fstatSync(descriptor);
      if (!sameFileSnapshot(lstatSync(this.path), this.written)) {
        throw receiptError();
      }
    } catch {
      throw receiptError();
    } finally {
      if (descriptor !== -1) {
        closeSync(descriptor);
      }
    }
  }
}
