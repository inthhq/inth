import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import nodePath from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { run } from "../experiments/node/commands.ts";
import { AgentAuth } from "../src/agent-auth.ts";
import { parseArguments } from "../src/arguments.ts";
import { rawApiRequest } from "../src/resource-commands.ts";

const bytes = new Uint8Array([0, 255, 128, 13, 10, 65]);
const directories: string[] = [];
const outputFile = async (): Promise<string> => {
  const directory = await mkdtemp(
    nodePath.join(tmpdir(), "inth-raw-download-")
  );
  directories.push(directory);
  return nodePath.join(directory, "attachment.bin");
};
const signal = (): AbortSignal => new AbortController().signal;
const unused = (): never => {
  throw new Error("Unexpected authentication operation");
};
const createAgent = (): Promise<AgentAuth> =>
  Promise.resolve(
    new AgentAuth(
      {
        clock: { now: Date.now, sleep: unused },
        error: unused,
        form: unused,
        get: unused,
        post: unused,
        request: unused,
      },
      { clear: unused, exclusive: unused, read: unused, write: unused }
    )
  );

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  );
});

describe("raw API binary downloads", () => {
  it.each([
    ["GET", "/v1/agent-chat-attachments/att_123/content"],
    ["/v1/agent-chat-attachments/att_123/content", "--method", "GET"],
    ["/v1/agent-chat-attachments/att_123/content"],
  ])(
    "saves bytes for %s and returns one versioned metadata result",
    async (...args) => {
      const path = await outputFile();
      vi.stubEnv("INTH_TOKEN", "");
      vi.spyOn(AgentAuth.prototype, "accessToken").mockResolvedValue(
        "person-token"
      );
      const fetcher = vi.fn().mockResolvedValue(
        new Response(bytes, {
          headers: {
            "Content-Type": "image/png",
            "X-Request-Id": "chat-attachment",
          },
        })
      );
      vi.stubGlobal("fetch", fetcher);
      const stdout = vi.spyOn(console, "log").mockImplementation(() => {});
      const stderr = vi.spyOn(console, "error").mockImplementation(() => {});
      await run(
        [
          "api",
          ...args,
          "--organization",
          "org_123",
          "--output",
          path,
          "--auth",
          "agent",
          "--json",
        ],
        signal(),
        createAgent
      );
      expect(new Uint8Array(await readFile(path))).toEqual(bytes);
      expect(stdout).toHaveBeenCalledTimes(1);
      expect(JSON.parse(stdout.mock.lastCall?.[0] ?? "")).toEqual({
        data: {
          bytes: bytes.byteLength,
          contentType: "image/png",
          path,
          requestId: "chat-attachment",
        },
        ok: true,
        schemaVersion: 2,
      });
      expect(stderr).not.toHaveBeenCalled();
      expect(fetcher).toHaveBeenCalledExactlyOnceWith(
        "https://api.inth.com/v1/agent-chat-attachments/att_123/content?organizationId=org_123",
        expect.objectContaining({
          headers: { Accept: "*/*", Authorization: "Bearer person-token" },
          method: "GET",
          redirect: "error",
        })
      );
    }
  );
  it("prints raw JSON metadata without --json", async () => {
    const path = await outputFile();
    vi.stubEnv("INTH_TOKEN", "inth_fixture");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(bytes)));
    const stdout = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(
      [
        "api",
        "GET",
        "/v1/support/attachments/sat_123/content",
        "--organization",
        "org_123",
        "--output",
        path,
      ],
      signal()
    );
    expect(JSON.parse(stdout.mock.lastCall?.[0] ?? "")).toEqual({
      bytes: bytes.byteLength,
      contentType: "application/octet-stream",
      path,
      requestId: null,
    });
    expect(new Uint8Array(await readFile(path))).toEqual(bytes);
  });
  it.each([
    ["GET"],
    ["GET", "/v1/file", "extra"],
    ["GET", "/v1/file", "--method", "GET"],
    ["GET", "/v1/file", "--method", "POST"],
    ["/v1/file", "--method", "POST"],
    ["/v1/file", "--method", "PUT"],
    ["/v1/file", "--method", "PATCH"],
    ["/v1/file", "--method", "DELETE"],
    ["GET", "/v1/file", "--data", "{}"],
    ["GET", "/v1/file", "--data-file", "missing.json"],
  ])(
    "rejects invalid download arguments %j before authentication",
    async (...args) => {
      const path = await outputFile();
      vi.stubEnv("INTH_TOKEN", "");
      const agent = vi.fn(createAgent);
      const fetcher = vi.fn();
      vi.stubGlobal("fetch", fetcher);
      await expect(
        run(
          ["api", ...args, "--output", path, "--auth", "agent", "--json"],
          signal(),
          agent
        )
      ).rejects.toMatchObject({ code: "usage_error" });
      expect(agent).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
      await expect(readFile(path)).rejects.toMatchObject({ code: "ENOENT" });
    }
  );
  it("rejects terminal output, existing paths and missing parent directories before HTTP", async () => {
    const existing = await outputFile();
    await writeFile(existing, "keep this file");
    vi.stubEnv("INTH_TOKEN", "inth_fixture");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    for (const target of [
      "-",
      existing,
      nodePath.join(existing, "missing", "file"),
    ]) {
      // eslint-disable-next-line no-await-in-loop -- Each unsafe file target must fail independently.
      await expect(
        run(["api", "GET", "/v1/file", "--output", target, "--json"], signal())
      ).rejects.toMatchObject({ code: "usage_error" });
    }
    expect(await readFile(existing, "utf-8")).toBe("keep this file");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    "https://storage.example/v1/file",
    "//storage.example/v1/file",
    "/v1/../private",
  ])("refuses bearer destination %s", async (url) => {
    const path = await outputFile();
    vi.stubEnv("INTH_TOKEN", "");
    const agent = vi.fn(createAgent);
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(
      run(
        [
          "api",
          "GET",
          url,
          "--organization",
          "org_123",
          "--output",
          path,
          "--auth",
          "agent",
          "--json",
        ],
        signal(),
        agent
      )
    ).rejects.toMatchObject({ code: "usage_error" });
    expect(agent).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    await expect(readFile(path)).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("preserves API scope errors without creating an output file", async () => {
    const path = await outputFile();
    vi.stubEnv("INTH_TOKEN", "inth_fixture");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: { code: "INSUFFICIENT_SCOPE" } },
            { headers: { "X-Request-Id": "attachment-scope" }, status: 403 }
          )
        )
    );
    await expect(
      run(
        [
          "api",
          "GET",
          "/v1/agent-chat-attachments/att_123/content",
          "--organization",
          "org_123",
          "--output",
          path,
          "--json",
        ],
        signal()
      )
    ).rejects.toMatchObject({
      apiCode: "INSUFFICIENT_SCOPE",
      requestId: "attachment-scope",
    });
    await expect(readFile(path)).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("cancels a blocked raw download without creating a file", async () => {
    const path = await outputFile();
    vi.stubEnv("INTH_TOKEN", "inth_fixture");
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(new ReadableStream<Uint8Array>()));
    vi.stubGlobal("fetch", fetcher);
    const controller = new AbortController();
    const reading = run(
      [
        "api",
        "GET",
        "/v1/agent-chat-attachments/att_123/content",
        "--organization",
        "org_123",
        "--output",
        path,
        "--json",
      ],
      controller.signal
    );
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    controller.abort();
    await expect(reading).rejects.toMatchObject({ name: "AbortError" });
    await expect(readFile(path)).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("builds raw JSON reads and mutations without an implicit organization", () => {
    expect(rawApiRequest(parseArguments(["api", "GET", "/v1/me"]))).toEqual({
      body: undefined,
      method: "GET",
      path: "/v1/me",
      scoped: false,
    });
    expect(
      rawApiRequest(
        parseArguments([
          "api",
          "/v1/projects/prj_123",
          "--method",
          "PATCH",
          "--data",
          '{"description":null}',
        ])
      )
    ).toEqual({
      body: '{"description":null}',
      method: "PATCH",
      path: "/v1/projects/prj_123",
      scoped: false,
    });
  });
});
