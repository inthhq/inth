/* eslint-disable no-await-in-loop -- Read and count one response chunk at a time. */
/* eslint-disable no-control-regex -- Reject terminal and HTTP controls in request and response headers. */
import { CliError } from "./cli-error.ts";
import { safeRequestId } from "./http-error.ts";

export interface DownloadResult {
  bytes: Uint8Array;
  contentType: string;
  requestId: string | null;
}
interface DownloadMetadata {
  contentType: string;
  expectedLength: number | undefined;
}

const downloadError = (
  response: Response,
  message: string,
  code = "invalid_response"
): CliError => {
  const requestId = safeRequestId(response.headers.get("X-Request-Id"));
  return new CliError(
    code,
    `${message}${requestId ? ` Request ID: ${requestId}` : ""}`,
    response.status,
    requestId
  );
};

const mediaType = (value: string): string =>
  (value.split(";")[0] ?? "").trim().toLowerCase();

const acceptsType = (accept: string, contentType: string): boolean =>
  accept.split(",").some((entry) => {
    const expected = mediaType(entry);
    return (
      expected === "*/*" ||
      expected === contentType ||
      (expected.endsWith("/*") && contentType.startsWith(expected.slice(0, -1)))
    );
  });

export const downloadAccept = (accept: string): string => {
  if (
    !accept.trim() ||
    accept.length > 1024 ||
    /[\u0000-\u001F\u007F]/u.test(accept)
  ) {
    throw new CliError("usage_error", "Use a non-empty media type for Accept.");
  }
  return accept;
};

const downloadMetadata = (
  response: Response,
  accept: string,
  limit: number
): DownloadMetadata => {
  let expectedLength: number | undefined;
  const length = response.headers.get("Content-Length");
  if (length !== null) {
    if (!/^\d+$/u.test(length) || !Number.isSafeInteger(Number(length))) {
      throw downloadError(response, "Download has an invalid Content-Length.");
    }
    expectedLength = Number(length);
    if (expectedLength > limit) {
      throw downloadError(
        response,
        `Download exceeds the ${limit} byte limit.`,
        "download_too_large"
      );
    }
  }
  const contentType =
    response.headers.get("Content-Type") ?? "application/octet-stream";
  const type = mediaType(contentType);
  if (
    !type ||
    contentType.length > 1024 ||
    /[\u0000-\u001F\u007F-\u009F]/u.test(contentType) ||
    !acceptsType(accept, type)
  ) {
    throw downloadError(
      response,
      "Download content type does not match the requested format."
    );
  }
  return { contentType, expectedLength };
};

const cancelReader = async (
  reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<void> => {
  try {
    await reader.cancel();
  } catch {
    // Preserve the original transfer failure or cancellation.
  }
};

export const readDownload = async (
  response: Response,
  accept: string,
  signal: AbortSignal,
  limit = 134_217_728
): Promise<DownloadResult> => {
  const reader = response.body?.getReader();
  let size = 0;
  let finished = false;
  const stop = (): void => {
    if (reader) {
      void cancelReader(reader);
    }
  };
  signal.addEventListener("abort", stop, { once: true });
  try {
    signal.throwIfAborted();
    const { contentType, expectedLength } = downloadMetadata(
      response,
      accept,
      limit
    );
    let bytes = new Uint8Array(Math.min(limit, expectedLength ?? 16_384));
    if (reader) {
      for (;;) {
        const next = await reader.read();
        signal.throwIfAborted();
        if (next.done) {
          finished = true;
          break;
        }
        const nextSize = size + next.value.byteLength;
        if (nextSize > limit) {
          throw downloadError(
            response,
            `Download exceeds the ${limit} byte limit.`,
            "download_too_large"
          );
        }
        if (nextSize > bytes.byteLength) {
          const expanded = new Uint8Array(
            Math.min(limit, Math.max(nextSize, bytes.byteLength * 2))
          );
          expanded.set(bytes);
          bytes = expanded;
        }
        bytes.set(next.value, size);
        size = nextSize;
      }
    }
    // Fetch decodes compressed bodies, while Content-Length describes transfer bytes.
    const encoding = response.headers.get("Content-Encoding");
    if (
      (encoding === null || encoding.toLowerCase() === "identity") &&
      expectedLength !== undefined &&
      size !== expectedLength
    ) {
      throw downloadError(
        response,
        "Download size does not match Content-Length."
      );
    }
    return {
      bytes: bytes.subarray(0, size),
      contentType,
      requestId: safeRequestId(response.headers.get("X-Request-Id")),
    };
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof CliError) {
      throw error;
    }
    throw downloadError(
      response,
      "Could not read the download. Check your connection and try again."
    );
  } finally {
    signal.removeEventListener("abort", stop);
    if (reader) {
      if (!finished) {
        await cancelReader(reader);
      }
      reader.releaseLock();
    }
  }
};
