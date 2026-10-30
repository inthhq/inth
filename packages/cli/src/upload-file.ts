/* eslint-disable no-await-in-loop -- Read bounded chunks in sequence and yield for cancellation. */
import { closeSync, fstatSync, readSync } from "node:fs";
import type { Stats } from "node:fs";
// eslint-disable-next-line unicorn/import-style -- Scriptc requires named path imports.
import { basename, extname } from "node:path";
import { setTimeout } from "node:timers/promises";

import type { CliArguments } from "./arguments.ts";
import { CliError } from "./cli-error.ts";
import { sameFileSnapshot } from "./file-identity.ts";
import { openStableRegularFile } from "./file-input.ts";
import { optionValue as option } from "./option-value.ts";

const imageType = (extension: string): string | undefined => {
  switch (extension) {
    case ".gif": {
      return "image/gif";
    }
    case ".jpeg":
    case ".jpg": {
      return "image/jpeg";
    }
    case ".png": {
      return "image/png";
    }
    case ".webp": {
      return "image/webp";
    }
    default: {
      return undefined;
    }
  }
};

const inferredType = (
  fileName: string,
  support: boolean
): string | undefined => {
  const extension = extname(fileName).toLowerCase();
  const image = imageType(extension);
  if (image) {
    return image;
  }
  if (support) {
    switch (extension) {
      case ".mov": {
        return "video/quicktime";
      }
      case ".mp4": {
        return "video/mp4";
      }
      case ".webm": {
        return "video/webm";
      }
      default: {
        return undefined;
      }
    }
  }
  switch (extension) {
    case ".csv": {
      return "text/csv";
    }
    case ".docx": {
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }
    case ".json": {
      return "application/json";
    }
    case ".markdown":
    case ".md": {
      return "text/markdown";
    }
    case ".pdf": {
      return "application/pdf";
    }
    case ".txt": {
      return "text/plain";
    }
    default: {
      return undefined;
    }
  }
};

const allowedType = (mediaType: string, support: boolean): boolean => {
  if (
    ["image/gif", "image/jpeg", "image/png", "image/webp"].includes(mediaType)
  ) {
    return true;
  }
  return support
    ? ["video/mp4", "video/quicktime", "video/webm"].includes(mediaType)
    : [
        "application/json",
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/csv",
        "text/markdown",
        "text/plain",
      ].includes(mediaType);
};

const fileType = (
  fileName: string,
  hint: string | undefined,
  support: boolean
): string => {
  const inferred =
    inferredType(fileName, support) ?? (support ? undefined : "text/plain");
  const normalized = hint?.trim().toLowerCase();
  const mediaType = normalized ?? inferred ?? (support ? "" : "text/plain");
  if (
    (hint !== undefined && /\p{C}/u.test(hint)) ||
    !allowedType(mediaType, support) ||
    (normalized !== undefined &&
      inferred !== undefined &&
      normalized !== inferred)
  ) {
    throw new CliError(
      "usage_error",
      support
        ? "Support uploads accept GIF, JPEG, PNG, WebP, MP4, MOV, or WebM. Use a matching --media-type for files without a known extension."
        : "Use a supported chat file type and a --media-type that matches its extension."
    );
  }
  return mediaType;
};

const displayName = (options: CliArguments, path: string): string => {
  const name = option(options, "file-name") ?? basename(path);
  if (
    !name ||
    name !== name.trim() ||
    name.length > 255 ||
    name === "." ||
    name === ".." ||
    /[\p{C}/\\]/u.test(name)
  ) {
    throw new CliError(
      "usage_error",
      "Use --file-name with a basename of 1 through 255 characters, without path separators, control characters, or surrounding whitespace."
    );
  }
  return name;
};

const changedFile = (): CliError =>
  new CliError(
    "upload_file_changed",
    "The upload file changed while reading. Use a stable regular file and start again."
  );

export class UploadFile {
  readonly fileName: string;
  readonly mediaType: string;
  readonly sizeBytes: number;
  private readonly descriptor: number;
  private readonly opened: Stats;
  private closed = false;
  private started = false;

  constructor(
    descriptor: number,
    opened: Stats,
    fileName: string,
    mediaType: string
  ) {
    this.descriptor = descriptor;
    this.opened = opened;
    this.fileName = fileName;
    this.mediaType = mediaType;
    this.sizeBytes = opened.size;
  }

  close(): void {
    if (!this.closed) {
      this.closed = true;
      closeSync(this.descriptor);
    }
  }

  verifyUnchanged(): void {
    if (this.closed) {
      throw new CliError("upload_file_closed", "The upload file is closed.");
    }
    const current = fstatSync(this.descriptor);
    if (!current.isFile() || !sameFileSnapshot(current, this.opened)) {
      throw changedFile();
    }
  }

  private begin(signal: AbortSignal): void {
    signal.throwIfAborted();
    this.verifyUnchanged();
    if (this.started) {
      throw new CliError(
        "upload_file_consumed",
        "The prepared upload file has already been read."
      );
    }
    this.started = true;
  }

  private finish(signal: AbortSignal): void {
    signal.throwIfAborted();
    this.verifyUnchanged();
    const extra = new Uint8Array(1);
    if (readSync(this.descriptor, extra, 0, 1, this.sizeBytes) !== 0) {
      throw changedFile();
    }
  }

  async readBytes(signal: AbortSignal): Promise<Uint8Array> {
    this.begin(signal);
    const bytes = new Uint8Array(this.sizeBytes);
    let offset = 0;
    while (offset < bytes.byteLength) {
      signal.throwIfAborted();
      this.verifyUnchanged();
      const count = readSync(
        this.descriptor,
        bytes,
        offset,
        Math.min(65_536, bytes.byteLength - offset),
        offset
      );
      if (count <= 0) {
        throw changedFile();
      }
      offset += count;
      await setTimeout(0);
    }
    this.finish(signal);
    return bytes;
  }

  stream(signal: AbortSignal): ReadableStream<Uint8Array> {
    this.begin(signal);
    let offset = 0;
    let stopped = false;
    return new ReadableStream<Uint8Array>({
      cancel: () => {
        stopped = true;
      },
      pull: async (controller) => {
        signal.throwIfAborted();
        this.verifyUnchanged();
        if (offset === this.sizeBytes) {
          this.finish(signal);
          controller.close();
          return;
        }
        const bytes = new Uint8Array(Math.min(65_536, this.sizeBytes - offset));
        const count = readSync(
          this.descriptor,
          bytes,
          0,
          bytes.byteLength,
          offset
        );
        if (count <= 0) {
          throw changedFile();
        }
        offset += count;
        await setTimeout(0);
        signal.throwIfAborted();
        if (stopped) {
          return;
        }
        if (offset === this.sizeBytes) {
          this.finish(signal);
        }
        controller.enqueue(
          count === bytes.byteLength ? bytes : bytes.subarray(0, count)
        );
      },
    });
  }
}

export const prepareUploadFile = async (
  options: CliArguments,
  signal: AbortSignal,
  imageOnly = false
): Promise<UploadFile> => {
  await setTimeout(0);
  signal.throwIfAborted();
  const path = option(options, "file");
  if (!path || path === "-" || /^[a-z][a-z\d+.-]*:\/\//iu.test(path)) {
    throw new CliError(
      "usage_error",
      "--file must name one local regular file. Binary uploads do not accept stdin or URLs."
    );
  }
  const fileName = displayName(options, path);
  const support = options.command === "support";
  const mediaType = fileType(fileName, option(options, "media-type"), support);
  if (
    imageOnly &&
    !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mediaType)
  ) {
    throw new CliError(
      "usage_error",
      "Use a PNG, JPEG, WebP or GIF image file."
    );
  }
  let limit = imageOnly ? 1_048_576 : 20_971_520;
  if (support) {
    limit = mediaType.startsWith("image/") ? 10_485_760 : 104_857_600;
  }
  try {
    const { descriptor, info: opened } = openStableRegularFile(path, "file");
    let prepared = false;
    try {
      if (
        !Number.isSafeInteger(opened.size) ||
        opened.size < 1 ||
        opened.size > limit
      ) {
        throw new CliError(
          "usage_error",
          `--file must contain 1 through ${limit} bytes for ${mediaType}.`
        );
      }
      signal.throwIfAborted();
      const file = new UploadFile(descriptor, opened, fileName, mediaType);
      prepared = true;
      return file;
    } finally {
      if (!prepared) {
        closeSync(descriptor);
      }
    }
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof CliError) {
      throw error;
    }
    throw new CliError(
      "usage_error",
      "Cannot read --file. Use a readable local regular file."
    );
  }
};
