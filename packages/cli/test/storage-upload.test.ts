import { once } from "node:events";
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import { setTimeout } from "node:timers/promises";

import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { parseArguments } from "../src/arguments.ts";
import { putSupportFile, validateSupportGrant } from "../src/storage-upload.ts";
import type {
  StorageFetch,
  SupportUploadGrant,
} from "../src/storage-upload.ts";
import { prepareUploadFile } from "../src/upload-file.ts";
import type { UploadFile } from "../src/upload-file.ts";

const directories: string[] = [];
const files: UploadFile[] = [];
const cleanups: (() => Promise<void>)[] = [];
const signal = (): AbortSignal => new AbortController().signal;
const bytes = new Uint8Array([0, 128, 255, 13, 10, 0, 65]);
const signedUrl =
  "https://vercel.com/api/blob/?pathname=support%2Fattachments%2Fsat_123.png&vercel-blob-delegation=private%2Bdelegation%3D&vercel-blob-signature=private%2Fsignature&x-content-type=image%2Fpng";
const grant = (
  overrides: Partial<SupportUploadGrant> = {}
): SupportUploadGrant => ({
  expiresAt: new Date(Date.now() + 900_000).toISOString(),
  mediaType: "image/png",
  method: "PUT",
  url: signedUrl,
  ...overrides,
});

const uploadFile = async (content = bytes): Promise<UploadFile> => {
  const directory = mkdtempSync(
    nodePath.join(tmpdir(), "inth-storage-upload-")
  );
  directories.push(directory);
  const path = nodePath.join(directory, "image.png");
  writeFileSync(path, content);
  const file = await prepareUploadFile(
    {
      ...parseArguments(["chat", "get", "fixture"]),
      argument: "attachment-upload",
      command: "support",
      values: [{ name: "file", value: path }],
    },
    signal()
  );
  files.push(file);
  return file;
};

const localServer = async (
  handler: (request: IncomingMessage, response: ServerResponse) => void
): Promise<string> => {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = z.object({ port: z.number() }).parse(server.address());
  cleanups.push(async () => {
    const closed = once(server, "close");
    server.closeAllConnections();
    server.close();
    await closed;
  });
  return `http://127.0.0.1:${port}`;
};

afterEach(async () => {
  for (const file of files.splice(0)) {
    file.close();
  }
  for (const cleanup of cleanups.splice(0)) {
    // eslint-disable-next-line no-await-in-loop -- Each fixture owns its server and open connections.
    await cleanup();
  }
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("signed Support upload grants", () => {
  it("accepts the pinned Vercel Blob PUT origin without rewriting signed parameters", () => {
    const upload = grant();
    expect(() =>
      validateSupportGrant(upload, "sat_123", "image/png")
    ).not.toThrow();
    expect(upload.url).toBe(signedUrl);
  });

  it.each([
    "https://private.blob.vercel-storage.com/image.png",
    signedUrl.replace("https://", "http://"),
    signedUrl.replace("vercel.com", "vercel.com.example.org"),
    signedUrl.replace("vercel.com", "vercel.com:444"),
    signedUrl.replace("vercel.com", "user:password@vercel.com"),
    signedUrl.replace("/api/blob/", "/other/"),
    signedUrl.replace("sat_123.png", "sat_456.png"),
    signedUrl.replace("sat_123.png", "sat_123.jpg"),
    signedUrl.replace("vercel-blob-signature", "other-signature"),
    signedUrl.replace("vercel-blob-delegation", "other-delegation"),
    `${signedUrl}#fragment`,
    `${signedUrl}&pathname=support%2Fattachments%2Fsat_123.png`,
    `${signedUrl}&vercel-blob-signature=second`,
    ` ${signedUrl}`,
    signedUrl.replace("https://", "https:\n//"),
  ])(
    "rejects untrusted or mismatched grants without transferring bytes",
    async (url) => {
      const fetcher = vi.fn<StorageFetch>();
      await expect(
        putSupportFile(
          await uploadFile(),
          grant({ url }),
          "sat_123",
          signal(),
          fetcher
        )
      ).rejects.toMatchObject({ code: "invalid_response" });
      expect(fetcher).not.toHaveBeenCalled();
    }
  );

  it.each([
    { expiresAt: "invalid" },
    { expiresAt: new Date(0).toISOString() },
    { mediaType: "image/jpeg" },
    { method: "POST" },
  ])("rejects expired or mismatched metadata %j", async (override) => {
    const fetcher = vi.fn<StorageFetch>();
    await expect(
      putSupportFile(
        await uploadFile(),
        grant(override),
        "sat_123",
        signal(),
        fetcher
      )
    ).rejects.toMatchObject({ code: "invalid_response" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("isolated signed storage PUT", () => {
  it("transfers every byte with exact media and length headers, without API credentials", async () => {
    const content = new Uint8Array(131_079);
    content.set(bytes, 65_534);
    content.set(bytes, 131_072);
    let received = new Uint8Array();
    let headers: IncomingMessage["headers"] = {};
    let method: string | undefined;
    const endpoint = await localServer((request, response) => {
      ({ headers, method } = request);
      const chunks: Uint8Array[] = [];
      request.on("data", (chunk: Uint8Array) => chunks.push(chunk));
      request.on("end", () => {
        received = new Uint8Array(Buffer.concat(chunks));
        response.writeHead(204);
        response.end();
      });
    });
    const fetcher = vi.fn<StorageFetch>((_url, init) => fetch(endpoint, init));
    await putSupportFile(
      await uploadFile(content),
      grant(),
      "sat_123",
      signal(),
      fetcher
    );
    expect(received).toEqual(content);
    expect(method).toBe("PUT");
    expect(headers["content-type"]).toBe("image/png");
    expect(headers["content-length"]).toBe(String(content.byteLength));
    expect(headers.authorization).toBeUndefined();
    expect(headers.cookie).toBeUndefined();
    expect(headers.referer).toBeUndefined();
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      signedUrl,
      expect.objectContaining({
        duplex: "half",
        redirect: "error",
      })
    );
  });

  it.each([429, 500])(
    "does not replay a storage PUT after HTTP %d or expose its response",
    async (status) => {
      let attempts = 0;
      const endpoint = await localServer((request, response) => {
        attempts += 1;
        request.resume();
        request.on("end", () => {
          response.writeHead(status, { "Retry-After": "0" });
          response.end(`secret provider response ${signedUrl}`);
        });
      });
      const fetcher: StorageFetch = (_url, init) => fetch(endpoint, init);
      const result = putSupportFile(
        await uploadFile(),
        grant(),
        "sat_123",
        signal(),
        fetcher
      );
      await expect(result).rejects.toMatchObject({
        code: "upload_transfer_failed",
      });
      await expect(result).rejects.not.toThrow("private");
      expect(attempts).toBe(1);
    }
  );

  it("refuses provider redirects without contacting the redirected destination", async () => {
    let redirected = 0;
    const destination = await localServer((request, response) => {
      redirected += 1;
      request.resume();
      response.end();
    });
    const endpoint = await localServer((request, response) => {
      request.resume();
      request.on("end", () => {
        response.writeHead(307, { Location: destination });
        response.end();
      });
    });
    await expect(
      putSupportFile(
        await uploadFile(),
        grant(),
        "sat_123",
        signal(),
        (_url, init) => fetch(endpoint, init)
      )
    ).rejects.toMatchObject({ code: "upload_transfer_failed" });
    expect(redirected).toBe(0);
  });

  it("does not re-PUT after the provider receives bytes but loses its response", async () => {
    let attempts = 0;
    let received = 0;
    const endpoint = await localServer((request) => {
      attempts += 1;
      request.on("data", (chunk: Uint8Array) => {
        received += chunk.byteLength;
      });
      request.on("end", () => request.socket.destroy());
    });
    await expect(
      putSupportFile(
        await uploadFile(),
        grant(),
        "sat_123",
        signal(),
        (_url, init) => fetch(endpoint, init)
      )
    ).rejects.toMatchObject({ code: "upload_transfer_failed" });
    expect(received).toBe(bytes.byteLength);
    expect(attempts).toBe(1);
  });

  it("preserves a known local file mutation instead of treating it as an uncertain provider result", async () => {
    const file = await uploadFile(new Uint8Array(1_048_576));
    const directory = directories.at(-1);
    if (!directory) {
      throw new Error("Missing prepared file directory");
    }
    const path = nodePath.join(directory, "image.png");
    let changed = false;
    const endpoint = await localServer((request, response) => {
      request.on("data", () => {
        if (!changed) {
          changed = true;
          appendFileSync(path, bytes);
        }
      });
      request.on("end", () => response.end());
    });
    await expect(
      putSupportFile(file, grant(), "sat_123", signal(), (_url, init) =>
        fetch(endpoint, init)
      )
    ).rejects.toMatchObject({ code: "upload_file_changed" });
    expect(changed).toBe(true);
  });

  it("stops pending file pulls when a provider returns before reading the file", async () => {
    const file = await uploadFile(new Uint8Array(1_048_576));
    const endpoint = await localServer((_request, response) => {
      response.writeHead(204);
      response.end();
    });
    await putSupportFile(file, grant(), "sat_123", signal(), (_url, init) =>
      fetch(endpoint, init)
    );
    file.close();
    await setTimeout(10);
  });

  it("cancels an active transfer waiting for the provider response", async () => {
    const started = Promise.withResolvers<boolean>();
    const endpoint = await localServer((request) => {
      request.resume();
      request.on("end", () => {
        started.resolve(true);
      });
    });
    const controller = new AbortController();
    const uploading = putSupportFile(
      await uploadFile(),
      grant(),
      "sat_123",
      controller.signal,
      (_url, init) => fetch(endpoint, init)
    );
    const failed = expect(uploading).rejects.toMatchObject({
      name: "AbortError",
    });
    await started.promise;
    controller.abort();
    await failed;
  });

  it("discards a provider response body without reading or printing it", async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream<Uint8Array>({ cancel }), {
      status: 200,
    });
    const fetcher: StorageFetch = async (_url, init) => {
      // Consume the real prepared file stream before simulating the provider response.
      await new Response(init.body).arrayBuffer();
      return response;
    };
    await putSupportFile(
      await uploadFile(),
      grant(),
      "sat_123",
      signal(),
      fetcher
    );
    expect(cancel).toHaveBeenCalledOnce();
  });
});
