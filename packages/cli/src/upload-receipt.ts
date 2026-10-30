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
  unlinkSync,
  writeSync,
} from "node:fs";
import type { Stats } from "node:fs";
// eslint-disable-next-line unicorn/import-style -- Scriptc requires named path imports.
import { dirname, resolve } from "node:path";

import { CliError } from "./cli-error.ts";

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
      throw receiptError();
    }
    offset += count;
  }
  ftruncateSync(descriptor, bytes.byteLength);
  fsyncSync(descriptor);
};

const writeReceipt = (path: string, data: UploadReceiptData): Stats => {
  const descriptor = openSync(
    path,
    // eslint-disable-next-line no-bitwise -- Scriptc requires inline exclusive-open flags.
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
    0o600
  );
  const owned = fstatSync(descriptor);
  let complete = false;
  try {
    writeContents(descriptor, data);
    const written = fstatSync(descriptor);
    complete = true;
    return written;
  } finally {
    closeSync(descriptor);
    if (!complete) {
      const current = lstatSync(path);
      if (current.ino === owned.ino && current.dev === owned.dev) {
        unlinkSync(path);
      }
    }
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
const sameReceipt = (current: Stats, expected: Stats): boolean =>
  current.ino === expected.ino &&
  current.dev === expected.dev &&
  current.size === expected.size &&
  current.mtimeMs === expected.mtimeMs &&
  current.ctimeMs === expected.ctimeMs;

export class UploadReceipt {
  readonly path: string;
  private written: Stats;
  private readonly parent: string;
  constructor(path: string, data: UploadReceiptData) {
    this.path = resolve(path);
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
      this.written = writeReceipt(this.path, data);
      syncDirectory(this.parent);
    } catch {
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
        !sameReceipt(current, this.written) ||
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
      if (!opened.isFile() || !sameReceipt(opened, current)) {
        throw receiptError();
      }
      writeContents(descriptor, data);
      this.written = fstatSync(descriptor);
      if (!sameReceipt(lstatSync(this.path), this.written)) {
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
