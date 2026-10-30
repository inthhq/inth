import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiClient } from "../experiments/node/api.ts";
import { HttpClient } from "../experiments/node/http.ts";
import { readDownload } from "../src/download.ts";
import { setup } from "./fixtures.ts";

const signal = (): AbortSignal => new AbortController().signal;
const bytes = new Uint8Array([0, 255, 128, 13, 10, 0, 65]);
const binary = (headers: Record<string, string> = {}): Response =>
  new Response(bytes, {
    headers: { "Content-Type": "image/png", ...headers },
  });
const noAuth = (): never => {
  throw new Error("Unexpected credential access");
};
const person = (accessToken = vi.fn().mockResolvedValue("person-token")) => ({
  accessToken,
  userInfoEndpoint: () => Promise.resolve("https://api.inth.com/userinfo"),
});

afterEach(() => vi.restoreAllMocks());

describe("bounded download reader", () => {
  it("preserves bytes split across chunks and safe response metadata", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.subarray(0, 2));
        controller.enqueue(bytes.subarray(2));
        controller.close();
      },
    });
    const result = await readDownload(
      new Response(body, {
        headers: {
          "Content-Length": String(bytes.byteLength),
          "Content-Type": "image/png",
          "X-Request-Id": "download:req-1\u001B[2J",
        },
      }),
      "image/png,image/jpeg",
      signal()
    );
    expect(result).toEqual({
      bytes,
      contentType: "image/png",
      requestId: "download:req-12J",
    });
  });
  it("rejects an oversized declared body before reading it", async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream<Uint8Array>({ cancel }), {
      headers: {
        "Content-Length": "8",
        "Content-Type": "application/pdf",
        "X-Request-Id": "too-large",
      },
    });
    await expect(
      readDownload(response, "application/pdf", signal(), 7)
    ).rejects.toMatchObject({
      code: "download_too_large",
      httpStatus: 200,
      requestId: "too-large",
    });
    expect(cancel).toHaveBeenCalledOnce();
  });
  it.each([undefined, "1"])(
    "counts actual bytes despite Content-Length %s",
    async (length) => {
      const cancel = vi.fn();
      const headers = new Headers({ "Content-Type": "image/png" });
      if (length !== undefined) {
        headers.set("Content-Length", length);
      }
      const response = new Response(
        new ReadableStream<Uint8Array>({
          cancel,
          start(controller) {
            controller.enqueue(bytes);
          },
        }),
        { headers }
      );
      await expect(
        readDownload(response, "image/*", signal(), 4)
      ).rejects.toMatchObject({ code: "download_too_large" });
      expect(cancel).toHaveBeenCalledOnce();
    }
  );
  it.each(["", "invalid", "-1", "9007199254740992"])(
    "rejects invalid Content-Length %s",
    async (length) => {
      await expect(
        readDownload(
          binary({ "Content-Length": length }),
          "image/png",
          signal()
        )
      ).rejects.toThrow("invalid Content-Length");
    }
  );
  it("rejects truncated successful content", async () => {
    await expect(
      readDownload(
        binary({ "Content-Length": "8", "X-Request-Id": "short-body" }),
        "image/png",
        signal()
      )
    ).rejects.toMatchObject({
      code: "invalid_response",
      requestId: "short-body",
    });
  });
  it("does not compare decompressed bytes with a compressed transfer length", async () => {
    const result = await readDownload(
      binary({ "Content-Encoding": "gzip", "Content-Length": "2" }),
      "image/*",
      signal()
    );
    expect(result.bytes).toEqual(bytes);
  });
  it("rejects the wrong response format before consuming it", async () => {
    await expect(
      readDownload(
        binary({ "Content-Type": "text/html", "X-Request-Id": "wrong-type" }),
        "image/png,image/jpeg",
        signal()
      )
    ).rejects.toMatchObject({
      code: "invalid_response",
      requestId: "wrong-type",
    });
  });
  it("cancels a blocked body read", async () => {
    const controller = new AbortController();
    let closed = false;
    const response = new Response(
      new ReadableStream<Uint8Array>({
        cancel() {
          closed = true;
        },
      })
    );
    const reading = readDownload(response, "*/*", controller.signal);
    controller.abort();
    await expect(reading).rejects.toMatchObject({ name: "AbortError" });
    expect(closed).toBe(true);
    expect(response.body?.locked).toBe(false);
  });
  it("retains the request ID when a transfer fails", async () => {
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(new Error("private upstream details"));
        },
      }),
      { headers: { "X-Request-Id": "disconnected" } }
    );
    await expect(readDownload(response, "*/*", signal())).rejects.toMatchObject(
      {
        code: "invalid_response",
        requestId: "disconnected",
      }
    );
  });
});

describe("authenticated API downloads", () => {
  it("downloads API-host content without text decoding", async () => {
    const response = binary({ "X-Request-Id": "binary-1" });
    vi.spyOn(response, "text").mockRejectedValue(
      new Error("Text decoding is forbidden")
    );
    const f = setup([response]);
    const result = await new ApiClient(f.http, noAuth, "inth_key").download(
      "/v1/support/attachments/sat_1/content",
      "org_1",
      "image/*"
    );
    expect(result).toEqual({
      bytes,
      contentType: "image/png",
      requestId: "binary-1",
    });
    expect(f.server.calls).toHaveLength(1);
    expect(f.server.calls[0]).toMatchObject({
      init: {
        headers: { Accept: "image/*", Authorization: "Bearer inth_key" },
        method: "GET",
        redirect: "error",
      },
      url: "https://api.inth.com/v1/support/attachments/sat_1/content?organizationId=org_1",
    });
  });
  it("refreshes once, preserves Accept, and returns bytes from the replacement request", async () => {
    const f = setup([new Response(null, { status: 401 }), binary()]);
    const auth = person(
      vi.fn().mockResolvedValueOnce("old").mockResolvedValue("new")
    );
    const result = await new ApiClient(f.http, () =>
      Promise.resolve(auth)
    ).download(
      "/v1/website-audit/scans/scan_1/screenshots/cap_1",
      undefined,
      "image/png,image/jpeg"
    );
    expect(result.bytes).toEqual(bytes);
    expect(auth.accessToken).toHaveBeenNthCalledWith(2, "old");
    expect(f.server.calls.map((entry) => entry.init.headers)).toEqual([
      { Accept: "image/png,image/jpeg", Authorization: "Bearer old" },
      { Accept: "image/png,image/jpeg", Authorization: "Bearer new" },
    ]);
  });
  it("stops after one failed refresh", async () => {
    const f = setup([
      new Response(null, { status: 401 }),
      new Response(null, {
        headers: { "X-Request-Id": "second-401" },
        status: 401,
      }),
    ]);
    const auth = person();
    await expect(
      new ApiClient(f.http, () => Promise.resolve(auth)).download(
        "/v1/billing/invoices/in_1/pdf"
      )
    ).rejects.toMatchObject({ requestId: "second-401", status: 401 });
    expect(auth.accessToken).toHaveBeenCalledTimes(2);
  });
  it("preserves scope errors and sanitized request IDs", async () => {
    const f = setup([
      Response.json(
        { error: { code: "INSUFFICIENT_SCOPE", message: "private message" } },
        { headers: { "X-Request-Id": "scope:req\u001B[2J" }, status: 403 }
      ),
    ]);
    await expect(
      new ApiClient(f.http, noAuth, "inth_key").download(
        "/v1/billing/invoices/in_1/pdf",
        undefined,
        "application/pdf"
      )
    ).rejects.toMatchObject({
      apiCode: "INSUFFICIENT_SCOPE",
      requestId: "scope:req2J",
      status: 403,
    });
  });
  it("retains the retry budget on binary requests", async () => {
    const f = setup([
      new Response(null, { headers: { "Retry-After": "0" }, status: 429 }),
      binary(),
    ]);
    const result = await new ApiClient(f.http, noAuth, "inth_key").download(
      "/v1/support/attachments/sat_1/content"
    );
    expect(result.bytes).toEqual(bytes);
    expect(f.clock.waits).toEqual([0]);
  });
  it("does not follow an API redirect to an attachment storage host", async () => {
    const f = setup([
      new Response(null, {
        headers: { Location: "https://storage.example/private" },
        status: 302,
      }),
    ]);
    await expect(
      new ApiClient(f.http, noAuth, "inth_key").download(
        "/v1/support/attachments/sat_1/content"
      )
    ).rejects.toMatchObject({ status: 302 });
    expect(f.server.calls).toHaveLength(1);
    expect(f.server.calls[0]?.init.redirect).toBe("error");
  });
  it.each([
    "https://storage.example/private",
    "//storage.example/v1/file",
    "/v1/../private",
    "/v1/file#fragment",
  ])("rejects %s before authentication or HTTP", async (path) => {
    const f = setup([]);
    await expect(
      new ApiClient(f.http, noAuth).download(path)
    ).rejects.toMatchObject({ code: "usage_error" });
  });
  it("cancels a pending download with the command signal", async () => {
    const f = setup([new Response(new ReadableStream<Uint8Array>())]);
    const reading = new ApiClient(f.http, noAuth, "inth_key").download(
      "/v1/support/attachments/sat_1/content"
    );
    await Promise.resolve();
    f.controller.abort();
    await expect(reading).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("JSON response negotiation", () => {
  it("selects report version two without changing an existing JSON body", async () => {
    const f = setup([
      Response.json({
        data: { provenance: ["recorded"], version: 2 },
        success: true,
      }),
    ]);
    const body = '{"description":null}';
    const output = await new ApiClient(f.http, noAuth, "inth_key").execute(
      "/v1/website-audit/scans/scan_1/report",
      "GET",
      undefined,
      undefined,
      "application/vnd.inth.web-audit+json;version=2"
    );
    expect(JSON.parse(output)).toEqual({
      data: { provenance: ["recorded"], version: 2 },
      success: true,
    });
    expect(f.server.calls[0]?.init.headers).toMatchObject({
      Accept: "application/vnd.inth.web-audit+json;version=2",
    });
    const mutation = setup([Response.json({ success: true })]);
    await new ApiClient(mutation.http, noAuth, "inth_key").execute(
      "/v1/projects/prj_1",
      "PATCH",
      body
    );
    expect(mutation.server.calls[0]?.init.body).toBe(body);
    expect(mutation.server.calls[0]?.init.headers).toEqual({
      Accept: "application/json",
      Authorization: "Bearer inth_key",
      "Content-Type": "application/json",
    });
  });
  it("rejects a header injection before credential access", async () => {
    const http = new HttpClient(
      noAuth,
      { now: Date.now, sleep: () => Promise.resolve() },
      signal()
    );
    await expect(
      new ApiClient(http, noAuth).execute(
        "/v1/projects",
        "GET",
        undefined,
        undefined,
        "application/json\r\nAuthorization: bad"
      )
    ).rejects.toMatchObject({ code: "usage_error" });
  });
});
