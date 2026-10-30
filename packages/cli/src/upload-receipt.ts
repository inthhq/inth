/* eslint-disable no-bitwise -- Filesystem flags and private mode checks use bit masks. */
import { randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  fsyncSync,
  ftruncateSync,
  lstatSync,
  openSync,
  realpathSync,
} from "node:fs";
// eslint-disable-next-line unicorn/import-style -- Scriptc requires named path imports.
import { dirname, join, resolve } from "node:path";

import { CliError } from "./cli-error.ts";
import {
  descriptorFileSnapshot,
  pathFileSnapshot,
  sameFileSnapshot,
} from "./file-identity.ts";
import type { FileSnapshot } from "./file-identity.ts";
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

const receiptError = (recoveryPath = ""): CliError =>
  new CliError(
    "receipt_write_failed",
    `Cannot safely write --receipt. Choose a new file in a private writable directory. Keep the recovery IDs printed to stderr.${recoveryPath ? ` A complete recovery receipt is saved at ${JSON.stringify(recoveryPath)}.` : ""}`
  );

const receiptBytes = (data: UploadReceiptData): Uint8Array =>
  new TextEncoder().encode(`${JSON.stringify(data, null, 2)}\n`);

const writeContents = (descriptor: number, bytes: Uint8Array): void => {
  writeAllSync(descriptor, bytes);
  ftruncateSync(descriptor, bytes.byteLength);
  fsyncSync(descriptor);
};

const writeReceipt = (path: string, bytes: Uint8Array): FileSnapshot => {
  const output = new PrivateOutputFile(path);
  try {
    writeContents(output.descriptor, bytes);
    const written = descriptorFileSnapshot(output.descriptor);
    output.finish();
    return written;
  } finally {
    output.dispose();
  }
};

const restoreReceipt = (
  descriptor: number,
  bytes: Uint8Array
): FileSnapshot | undefined => {
  try {
    writeContents(descriptor, bytes);
    return descriptorFileSnapshot(descriptor);
  } catch {
    // The synced recovery copy remains available if the filesystem refuses rollback.
    return undefined;
  }
};

const closeReceipt = (descriptor: number): boolean => {
  try {
    closeSync(descriptor);
    return true;
  } catch {
    // Deferred close errors require keeping the recovery copy too.
    return false;
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
  private written: FileSnapshot;
  private contents: Uint8Array;
  private recovery: FileSnapshot | undefined;
  private recoveryPath = "";
  private readonly parent: string;
  constructor(path: string, data: UploadReceiptData) {
    this.path = resolve(path);
    this.contents = receiptBytes(data);
    let created: FileSnapshot | undefined;
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
      created = writeReceipt(this.path, this.contents);
      this.written = created;
      syncDirectory(this.parent);
    } catch {
      if (created) {
        removeCreatedFile(this.path, created);
      }
      throw receiptError();
    }
  }
  private openCurrent(): number {
    const current = pathFileSnapshot(this.path, false);
    const directory = lstatSync(dirname(this.path));
    // eslint-disable-next-line no-bitwise -- Only update the private receipt this operation created.
    if (
      !current.info.isFile() ||
      current.info.isSymbolicLink() ||
      !sameFileSnapshot(current, this.written) ||
      (process.platform !== "win32" && (current.info.mode & 0o077) !== 0) ||
      realpathSync(dirname(this.path)) !== this.parent ||
      !directory.isDirectory() ||
      directory.isSymbolicLink() ||
      (process.platform !== "win32" && (directory.mode & 0o022) !== 0)
    ) {
      throw receiptError();
    }
    const descriptor = openSync(
      this.path,
      // eslint-disable-next-line no-bitwise -- Refuse a substituted FIFO without blocking or truncating it.
      constants.O_RDWR | constants.O_NONBLOCK
    );
    try {
      const opened = descriptorFileSnapshot(descriptor);
      if (!opened.info.isFile() || !sameFileSnapshot(opened, current)) {
        throw receiptError();
      }
      return descriptor;
    } catch (error) {
      closeReceipt(descriptor);
      throw error;
    }
  }
  update(data: UploadReceiptData): void {
    if (this.recovery) {
      throw receiptError(this.recoveryPath);
    }
    let descriptor = -1;
    let checkpoint: FileSnapshot | undefined;
    let checkpointPath = "";
    let attempted = false;
    let keepCheckpoint = false;
    let failed = false;
    try {
      descriptor = this.openCurrent();
      const contents = receiptBytes(data);
      checkpointPath = join(
        this.parent,
        `.inth-upload-receipt-${randomUUID()}.json`
      );
      checkpoint = writeReceipt(checkpointPath, contents);
      syncDirectory(this.parent);
      attempted = true;
      writeContents(descriptor, contents);
      const written = descriptorFileSnapshot(descriptor);
      if (!sameFileSnapshot(pathFileSnapshot(this.path, false), written)) {
        throw receiptError();
      }
      const closing = descriptor;
      descriptor = -1;
      closeSync(closing);
      this.written = written;
      this.contents = contents;
    } catch {
      const restored =
        attempted && descriptor !== -1
          ? restoreReceipt(descriptor, this.contents)
          : undefined;
      const closed = descriptor !== -1 && closeReceipt(descriptor);
      descriptor = -1;
      keepCheckpoint = attempted && !(restored && closed);
      if (restored && closed) {
        this.written = restored;
      }
      failed = true;
    }
    if (checkpoint && !keepCheckpoint) {
      try {
        removeCreatedFile(checkpointPath, checkpoint);
      } catch {
        keepCheckpoint = true;
        failed = true;
      }
    }
    if (keepCheckpoint && checkpoint) {
      this.recovery = checkpoint;
      this.recoveryPath = checkpointPath;
    }
    if (failed) {
      throw receiptError(keepCheckpoint ? checkpointPath : "");
    }
  }
  discard(): void {
    removeCreatedFile(this.path, this.written);
    if (this.recovery) {
      removeCreatedFile(this.recoveryPath, this.recovery);
      this.recovery = undefined;
      this.recoveryPath = "";
    }
  }
}
