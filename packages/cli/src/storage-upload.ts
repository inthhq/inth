import { CliError } from "./cli-error.ts";
import type { UploadFile } from "./upload-file.ts";

export interface SupportUploadGrant {
  method: string;
  url: string;
  mediaType: string;
  expiresAt: string;
}

interface StorageRequest {
  body: ReadableStream<Uint8Array>;
  duplex: "half";
  headers: { "Content-Length": string; "Content-Type": string };
  method: "PUT";
  redirect: "error";
  signal: AbortSignal;
}

export type StorageFetch = (
  url: string,
  init: StorageRequest
) => Promise<Response>;

const supportExtension = (mediaType: string): string => {
  switch (mediaType) {
    case "image/gif": {
      return "gif";
    }
    case "image/jpeg": {
      return "jpg";
    }
    case "image/png": {
      return "png";
    }
    case "image/webp": {
      return "webp";
    }
    case "video/mp4": {
      return "mp4";
    }
    case "video/quicktime": {
      return "mov";
    }
    case "video/webm": {
      return "webm";
    }
    default: {
      return "";
    }
  }
};

const invalidGrant = (): CliError =>
  new CliError(
    "invalid_response",
    "The API returned an invalid or expired upload grant."
  );

const validGrantUrl = (
  url: URL,
  attachmentId: string,
  extension: string
): boolean =>
  url.protocol === "https:" &&
  url.origin === "https://vercel.com" &&
  url.pathname === "/api/blob/" &&
  url.username === "" &&
  url.password === "" &&
  url.hash === "" &&
  url.searchParams.getAll("pathname").length === 1 &&
  url.searchParams.get("pathname") ===
    `support/attachments/${attachmentId}.${extension}` &&
  url.searchParams.getAll("vercel-blob-delegation").length === 1 &&
  !!url.searchParams.get("vercel-blob-delegation") &&
  url.searchParams.getAll("vercel-blob-signature").length === 1 &&
  !!url.searchParams.get("vercel-blob-signature");

export const validateSupportGrant = (
  grant: SupportUploadGrant,
  attachmentId: string,
  mediaType: string
): void => {
  try {
    const url = new URL(grant.url);
    const extension = supportExtension(mediaType);
    const expiresAt = Date.parse(grant.expiresAt);
    if (
      grant.method !== "PUT" ||
      grant.mediaType !== mediaType ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= Date.now() ||
      !/^sat_[1-9a-km-z]+$/u.test(attachmentId) ||
      !extension ||
      grant.url !== grant.url.trim() ||
      /\p{C}/u.test(grant.url) ||
      !validGrantUrl(url, attachmentId, extension)
    ) {
      throw invalidGrant();
    }
  } catch {
    throw invalidGrant();
  }
};

export const putSupportFile = async (
  file: UploadFile,
  grant: SupportUploadGrant,
  attachmentId: string,
  signal: AbortSignal,
  fetcher: StorageFetch = (url, init) => fetch(url, init)
): Promise<void> => {
  signal.throwIfAborted();
  validateSupportGrant(grant, attachmentId, file.mediaType);
  const stopped = new AbortController();
  // Keep a bounded budget for recordings on a 128 KiB/s upstream connection.
  const deadline = Math.max(
    300_000,
    Math.ceil(file.sizeBytes / 131_072) * 1000 + 60_000
  );
  const transfer = AbortSignal.any([
    signal,
    stopped.signal,
    AbortSignal.timeout(deadline),
  ]);
  try {
    const response = await fetcher(grant.url, {
      body: file.stream(transfer),
      duplex: "half",
      headers: {
        "Content-Length": String(file.sizeBytes),
        "Content-Type": grant.mediaType,
      },
      method: "PUT",
      redirect: "error",
      signal: transfer,
    });
    file.verifyUnchanged();
    const { body } = response;
    if (body) {
      await body.cancel();
    }
    if (!response.ok) {
      throw new CliError(
        "upload_transfer_failed",
        "The storage transfer did not finish."
      );
    }
  } catch {
    signal.throwIfAborted();
    file.verifyUnchanged();
    throw new CliError(
      "upload_transfer_failed",
      "The storage transfer outcome is unknown. Finalize the known attachment before uploading again."
    );
  } finally {
    stopped.abort();
  }
};
