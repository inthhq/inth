import { once } from "node:events";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import type { IncomingHttpHeaders, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import nodePath from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { run } from "../experiments/node/commands.ts";
import { OrganizationContext } from "../experiments/node/state.ts";
import { AgentAuth } from "../src/agent-auth.ts";
import { parseArguments } from "../src/arguments.ts";
import { CliError } from "../src/cli-error.ts";
import { COMMAND_METADATA } from "../src/command-metadata.ts";
import { UploadReceipt } from "../src/upload-receipt.ts";
import type { UploadReceiptData } from "../src/upload-receipt.ts";

const realFetch = globalThis.fetch;
const directories: string[] = [];
const closeServers: (() => Promise<void>)[] = [];
const clientAttachmentId = "b8dde372-1324-4d2e-a15a-fd3761964299";
const content = new Uint8Array([0, 128, 255, 13, 10, 65, 0]);
const signedUrl =
  "https://vercel.com/api/blob/?pathname=support%2Fattachments%2Fsat_123.png&vercel-blob-delegation=secret-delegation&vercel-blob-signature=secret-signature";
const signal = (): AbortSignal => new AbortController().signal;
const directory = async (): Promise<string> => {
  const path = await mkdtemp(nodePath.join(tmpdir(), "inth-upload-workflow-"));
  directories.push(path);
  return path;
};
const file = async (name = "image.png", bytes = content): Promise<string> => {
  const path = nodePath.join(await directory(), name);
  await writeFile(path, bytes);
  return path;
};
const person = () => {
  vi.stubEnv("INTH_TOKEN", "");
  const access = vi
    .spyOn(AgentAuth.prototype, "accessToken")
    .mockResolvedValue("person-token");
  const organization = vi
    .spyOn(OrganizationContext.prototype, "resolve")
    .mockResolvedValue("org_123");
  return { access, organization };
};
const capture = () => ({
  stderr: vi.spyOn(console, "error").mockImplementation(() => {}),
  stdout: vi.spyOn(console, "log").mockImplementation(() => {}),
});
const metadata = (group = "support", status = "ready") => ({
  downloadUrl:
    group === "chat"
      ? "/v1/agent-chat-attachments/aga_first/content"
      : "/v1/support/attachments/sat_123/content",
  fileName: "image.png",
  id: group === "chat" ? "aga_first" : "sat_123",
  mediaType: "image/png",
  sizeBytes: content.byteLength,
  status,
});
interface FixturePayload {
  data?: {
    attachment?: ReturnType<typeof metadata>;
    attachments?: ReturnType<typeof metadata>[];
    discarded?: boolean;
    id?: string;
    organizationId?: string;
    upload?: {
      expiresAt: string;
      mediaType: string;
      method: string;
      url: string;
    };
  };
  error?: { code: string };
  success?: boolean;
}
const reply = (
  response: ServerResponse,
  data: FixturePayload,
  status = 200
): void => {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(data));
};
const ready = (group = "support") => ({
  data: { attachment: metadata(group), organizationId: "org_123" },
  success: true,
});
const intent = () => ({
  data: {
    attachment: metadata("support", "uploading"),
    upload: {
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
      mediaType: "image/png",
      method: "PUT",
      url: signedUrl,
    },
  },
  success: true,
});
interface FixtureRequest {
  body: Buffer;
  headers: IncomingHttpHeaders;
  method: string;
  url: URL;
}
const fixture = async (
  handler: (
    request: FixtureRequest,
    response: ServerResponse
  ) => void | Promise<void>
): Promise<FixtureRequest[]> => {
  const requests: FixtureRequest[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.from(chunk));
    }
    const received = {
      body: Buffer.concat(chunks),
      headers: request.headers,
      method: request.method ?? "",
      url: new URL(request.url ?? "/", "http://fixture.test"),
    };
    requests.push(received);
    try {
      await handler(received, response);
    } catch {
      response.destroy();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  // eslint-disable-next-line anti-slop/no-runtime-typeof -- Node exposes TCP or Unix-socket server addresses. This fixture requires TCP.
  if (!address || typeof address === "string") {
    throw new Error("Missing fixture address");
  }
  const base = `http://127.0.0.1:${address.port}`;
  closeServers.push(async () => {
    server.closeAllConnections();
    // eslint-disable-next-line promise/avoid-new -- Node HTTP server shutdown exposes a callback API.
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  });
  vi.stubGlobal("fetch", (input: string | URL | Request, init: RequestInit) => {
    const url = new URL(String(input));
    if (!["https://api.inth.com", "https://vercel.com"].includes(url.origin)) {
      throw new Error("Unexpected fixture destination");
    }
    return realFetch(`${base}${url.pathname}${url.search}`, init);
  });
  return requests;
};
const args = (group: string, path: string, extra: string[] = []): string[] => [
  group,
  "attachment-upload",
  "--file",
  path,
  "--organization",
  "org_123",
  "--auth",
  "agent",
  "--json",
  ...extra,
];
const expectNoSecrets = (value: string): void => {
  for (const secret of [
    signedUrl,
    "secret-delegation",
    "secret-signature",
    "person-token",
    Buffer.from(content).toString("base64"),
  ]) {
    expect(value).not.toContain(secret);
  }
};

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  for (const close of closeServers.splice(0)) {
    // eslint-disable-next-line no-await-in-loop -- Each fixture owns its open connections.
    await close();
  }
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { force: true, recursive: true }))
  );
});

describe("chat upload recovery", () => {
  it("sends canonical base64 containing every original byte and prints one metadata-only JSON envelope", async () => {
    const selected = person();
    const output = capture();
    const requests = await fixture((request, response) => {
      expect(request.method).toBe("POST");
      expect(request.url.pathname).toBe("/v1/agent-chat-attachments");
      const body = JSON.parse(request.body.toString());
      expect(body).toEqual({
        data: Buffer.from(content).toString("base64"),
        fileName: "image.png",
        mediaType: "image/png",
      });
      expect(Buffer.from(body.data, "base64")).toEqual(Buffer.from(content));
      reply(response, ready("chat"), 201);
    });
    await run(args("chat", await file()), signal());
    expect(requests).toHaveLength(1);
    expect(requests[0]?.headers.authorization).toBe("Bearer person-token");
    expect(requests[0]?.headers["content-type"]).toBe("application/json");
    expect(requests[0]?.url.searchParams.get("organizationId")).toBe("org_123");
    expect(output.stdout).toHaveBeenCalledOnce();
    expect(JSON.parse(output.stdout.mock.calls[0]?.[0] ?? "")).toEqual({
      data: ready("chat"),
      ok: true,
      schemaVersion: 2,
    });
    expect(selected.organization).toHaveBeenCalledOnce();
    expectNoSecrets(
      JSON.stringify([output.stdout.mock.calls, output.stderr.mock.calls])
    );
  });

  it.each([429, 503])(
    "does not replay a non-idempotent upload after HTTP %i",
    async (status) => {
      person();
      const output = capture();
      const requests = await fixture((_request, response) => {
        response.setHeader("Retry-After", "0");
        reply(
          response,
          {
            error: {
              code: status === 429 ? "RATE_LIMITED" : "SERVICE_UNAVAILABLE",
            },
          },
          status
        );
      });
      await expect(
        run(args("chat", await file()), signal())
      ).rejects.toMatchObject({
        code: "upload_outcome_unknown",
        httpStatus: status,
      });
      expect(requests).toHaveLength(1);
      expect(output.stdout).not.toHaveBeenCalled();
      expect(output.stderr.mock.calls.flat().join(" ")).toContain(
        "chat attachment-list --organization org_123"
      );
      expectNoSecrets(JSON.stringify(output.stderr.mock.calls));
    }
  );

  it("recovers a draft by listing after the successful POST response is lost", async () => {
    person();
    const output = capture();
    let uploaded = false;
    const requests = await fixture((request, response) => {
      if (request.method === "POST") {
        uploaded = true;
        response.destroy();
        return;
      }
      reply(response, {
        data: {
          attachments: uploaded ? [metadata("chat")] : [],
          organizationId: "org_123",
        },
        success: true,
      });
    });
    await expect(
      run(args("chat", await file()), signal())
    ).rejects.toMatchObject({ code: "upload_outcome_unknown" });
    await run(
      [
        "chat",
        "attachment-list",
        "--organization",
        "org_123",
        "--auth",
        "agent",
        "--json",
      ],
      signal()
    );
    expect(requests.map((request) => request.method)).toEqual(["POST", "GET"]);
    expect(requests[1]?.url.searchParams.get("limit")).toBeNull();
    expect(
      JSON.parse(output.stdout.mock.calls[0]?.[0] ?? "").data.data.attachments
    ).toEqual([metadata("chat")]);
  });

  it("preserves an authentication failure before dispatching a chat upload", async () => {
    person();
    capture();
    vi.spyOn(AgentAuth.prototype, "accessToken").mockRejectedValue(
      new CliError("authentication_required", "Sign in first.")
    );
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(
      run(args("chat", await file()), signal())
    ).rejects.toMatchObject({ code: "authentication_required" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps a rejected upload's scope error and does not create or discard any guessed draft", async () => {
    person();
    capture();
    const requests = await fixture((_request, response) =>
      reply(response, { error: { code: "INSUFFICIENT_SCOPE" } }, 403)
    );
    await expect(
      run(args("chat", await file()), signal())
    ).rejects.toMatchObject({ apiCode: "INSUFFICIENT_SCOPE", status: 403 });
    expect(requests.map((request) => request.method)).toEqual(["POST"]);
  });
});

describe("Support upload workflow", () => {
  it("reserves, streams and finalizes with one organization, a private receipt and no storage credentials", async () => {
    const selected = person();
    const output = capture();
    const path = await file();
    const receiptPath = nodePath.join(await directory(), "receipt.json");
    let stored = Buffer.alloc(0);
    const requests = await fixture(async (request, response) => {
      if (request.url.pathname === "/v1/support/attachments") {
        reply(response, intent(), 201);
        return;
      }
      if (request.url.pathname === "/api/blob/") {
        const receipt = JSON.parse(await readFile(receiptPath, "utf-8"));
        expect(receipt).toMatchObject({
          attachmentId: "sat_123",
          clientAttachmentId,
          stage: "reserved",
        });
        stored = Buffer.from(request.body);
        response.end();
        return;
      }
      expect(stored).toEqual(Buffer.from(content));
      reply(response, ready());
    });
    await run(
      args("support", path, [
        "--client-attachment-id",
        clientAttachmentId,
        "--receipt",
        receiptPath,
      ]),
      signal()
    );
    expect(requests.map((request) => request.method)).toEqual([
      "POST",
      "PUT",
      "POST",
    ]);
    expect(requests[0]?.url.searchParams.get("organizationId")).toBe("org_123");
    expect(requests[2]?.url.searchParams.get("organizationId")).toBe("org_123");
    expect(requests[0]?.headers.authorization).toBe("Bearer person-token");
    expect(requests[2]?.headers.authorization).toBe("Bearer person-token");
    expect(requests[1]?.headers).toMatchObject({
      "content-length": String(content.byteLength),
      "content-type": "image/png",
    });
    for (const header of ["authorization", "cookie", "referer"]) {
      expect(requests[1]?.headers[header]).toBeUndefined();
    }
    expect(JSON.parse(requests[0]?.body.toString() ?? "")).toEqual({
      clientAttachmentId,
      fileName: "image.png",
      mediaType: "image/png",
      sizeBytes: content.byteLength,
    });
    expect(JSON.parse(requests[2]?.body.toString() ?? "")).toEqual({});
    const receipt = await readFile(receiptPath, "utf-8");
    expect(JSON.parse(receipt)).toMatchObject({
      apiOrigin: "https://api.inth.com",
      attachmentId: "sat_123",
      clientAttachmentId,
      organizationId: "org_123",
      schemaVersion: 2,
      stage: "ready",
    });
    const receiptInfo = await stat(receiptPath);
    // eslint-disable-next-line no-bitwise -- Check the actual private file permissions.
    expect(receiptInfo.mode & 0o777).toBe(0o600);
    expect(await readdir(nodePath.dirname(receiptPath))).toEqual([
      "receipt.json",
    ]);
    expect(output.stdout).toHaveBeenCalledOnce();
    expect(JSON.parse(output.stdout.mock.calls[0]?.[0] ?? "")).toEqual({
      data: {
        data: {
          attachment: metadata(),
          clientAttachmentId,
          organizationId: "org_123",
          receiptPath,
        },
        success: true,
      },
      ok: true,
      schemaVersion: 2,
    });
    expect(selected.organization).toHaveBeenCalledOnce();
    expectNoSecrets(
      JSON.stringify([
        output.stdout.mock.calls,
        output.stderr.mock.calls,
        receipt,
      ])
    );
  });

  it("finalizes a stored file after the PUT response is lost, without a second PUT", async () => {
    person();
    const output = capture();
    let stored = false;
    const requests = await fixture((request, response) => {
      if (request.url.pathname === "/v1/support/attachments") {
        reply(response, intent());
        return;
      }
      if (request.method === "PUT") {
        stored = request.body.equals(Buffer.from(content));
        response.destroy();
        return;
      }
      reply(
        response,
        stored ? ready() : { success: false },
        stored ? 200 : 409
      );
    });
    await run(
      args("support", await file(), [
        "--client-attachment-id",
        clientAttachmentId,
      ]),
      signal()
    );
    expect(requests.map((request) => request.method)).toEqual([
      "POST",
      "PUT",
      "POST",
    ]);
    expect(
      JSON.parse(output.stdout.mock.calls[0]?.[0] ?? "").data.data.attachment
        .status
    ).toBe("ready");
    expectNoSecrets(
      JSON.stringify([output.stdout.mock.calls, output.stderr.mock.calls])
    );
  });

  it("keeps the caller UUID and identical pending metadata when retrying a lost intent", async () => {
    person();
    capture();
    let attempts = 0;
    const requests = await fixture((request, response) => {
      if (request.url.pathname === "/v1/support/attachments") {
        attempts += 1;
        if (attempts === 1) {
          response.destroy();
          return;
        }
        reply(response, intent());
        return;
      }
      if (request.method === "PUT") {
        response.end();
        return;
      }
      reply(response, ready());
    });
    const input = args("support", await file(), [
      "--client-attachment-id",
      clientAttachmentId,
    ]);
    await expect(run(input, signal())).rejects.toThrow();
    await run(input, signal());
    const intents = requests.filter(
      (request) => request.url.pathname === "/v1/support/attachments"
    );
    expect(intents).toHaveLength(2);
    expect(intents[0]?.body).toEqual(intents[1]?.body);
    expect(
      JSON.parse(intents[0]?.body.toString() ?? "").clientAttachmentId
    ).toBe(clientAttachmentId);
    expect(requests.filter((request) => request.method === "PUT")).toHaveLength(
      1
    );
  });

  it("keeps one generated intent UUID across a rate-limit retry and records it in the result", async () => {
    person();
    const output = capture();
    let attempts = 0;
    const requests = await fixture((request, response) => {
      if (request.url.pathname === "/v1/support/attachments") {
        attempts += 1;
        if (attempts === 1) {
          response.setHeader("Retry-After", "0");
          reply(response, { error: { code: "RATE_LIMITED" } }, 429);
          return;
        }
        reply(response, intent());
        return;
      }
      if (request.method === "PUT") {
        response.end();
        return;
      }
      reply(response, ready());
    });
    await run(args("support", await file()), signal());
    const intents = requests.filter(
      (request) => request.url.pathname === "/v1/support/attachments"
    );
    expect(intents).toHaveLength(2);
    expect(intents[0]?.body).toEqual(intents[1]?.body);
    const generated = JSON.parse(
      intents[0]?.body.toString() ?? ""
    ).clientAttachmentId;
    expect(generated).toMatch(
      /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/iu
    );
    expect(
      JSON.parse(output.stdout.mock.calls[0]?.[0] ?? "").data.data
        .clientAttachmentId
    ).toBe(generated);
    expect(output.stderr.mock.calls.flat().join(" ")).toContain(generated);
    expect(requests.filter((request) => request.method === "PUT")).toHaveLength(
      1
    );
  });

  it("preserves the caller UUID and stops on a pending-intent metadata conflict", async () => {
    person();
    const output = capture();
    const requests = await fixture((_request, response) =>
      reply(response, { error: { code: "CONFLICT" } }, 409)
    );
    await expect(
      run(
        args("support", await file(), [
          "--client-attachment-id",
          clientAttachmentId,
          "--file-name",
          "changed.png",
        ]),
        signal()
      )
    ).rejects.toMatchObject({ apiCode: "CONFLICT", status: 409 });
    expect(requests).toHaveLength(1);
    expect(JSON.parse(requests[0]?.body.toString() ?? "")).toMatchObject({
      clientAttachmentId,
      fileName: "changed.png",
    });
    expect(output.stdout).not.toHaveBeenCalled();
    expect(output.stderr.mock.calls.flat().join(" ")).toContain(
      clientAttachmentId
    );
  });

  it("reports a known ID after lost finalization and recovers through the named command without another PUT", async () => {
    person();
    const output = capture();
    const receiptPath = nodePath.join(await directory(), "recovery.json");
    let finalizations = 0;
    const requests = await fixture((request, response) => {
      if (request.url.pathname === "/v1/support/attachments") {
        reply(response, intent());
        return;
      }
      if (request.method === "PUT") {
        response.end();
        return;
      }
      finalizations += 1;
      if (finalizations === 1) {
        response.destroy();
        return;
      }
      reply(response, ready());
    });
    await expect(
      run(
        args("support", await file(), [
          "--client-attachment-id",
          clientAttachmentId,
          "--receipt",
          receiptPath,
        ]),
        signal()
      )
    ).rejects.toMatchObject({ code: "upload_outcome_unknown" });
    const receipt = await readFile(receiptPath, "utf-8");
    expect(JSON.parse(receipt)).toMatchObject({
      attachmentId: "sat_123",
      clientAttachmentId,
      stage: "finalize_unknown",
    });
    expect(output.stdout).not.toHaveBeenCalled();
    expect(output.stderr.mock.calls.flat().join(" ")).toContain(
      "support attachment-finalize sat_123"
    );
    await run(
      [
        "support",
        "attachment-finalize",
        "sat_123",
        "--organization",
        "org_123",
        "--auth",
        "agent",
        "--json",
      ],
      signal()
    );
    expect(requests.map((request) => request.method)).toEqual([
      "POST",
      "PUT",
      "POST",
      "POST",
    ]);
    expectNoSecrets(
      JSON.stringify([
        output.stdout.mock.calls,
        output.stderr.mock.calls,
        receipt,
      ])
    );
  });

  it.each([409, 503])(
    "never reports ready or re-uploads when finalize returns HTTP %i",
    async (status) => {
      person();
      const output = capture();
      const requests = await fixture((request, response) => {
        if (request.url.pathname === "/v1/support/attachments") {
          reply(response, intent());
          return;
        }
        if (request.method === "PUT") {
          response.end();
          return;
        }
        reply(
          response,
          {
            error: {
              code: status === 409 ? "CONFLICT" : "SERVICE_UNAVAILABLE",
            },
          },
          status
        );
      });
      await expect(
        run(
          args("support", await file(), [
            "--client-attachment-id",
            clientAttachmentId,
          ]),
          signal()
        )
      ).rejects.toMatchObject({
        code: "upload_outcome_unknown",
        httpStatus: status,
      });
      expect(requests.map((request) => request.method)).toEqual([
        "POST",
        "PUT",
        "POST",
      ]);
      expect(output.stdout).not.toHaveBeenCalled();
      expectNoSecrets(JSON.stringify(output.stderr.mock.calls));
    }
  );

  it("does not transfer a mismatched grant, and keeps safe recovery metadata", async () => {
    person();
    const output = capture();
    const requests = await fixture((_request, response) => {
      const result = intent();
      result.data.upload.url = signedUrl.replace("sat_123.png", "sat_456.png");
      reply(response, result);
    });
    await expect(
      run(args("support", await file()), signal())
    ).rejects.toMatchObject({ code: "invalid_response" });
    expect(requests.map((request) => request.method)).toEqual(["POST"]);
    expect(output.stderr.mock.calls.flat().join(" ")).toContain(
      "Support attachment ID: sat_123"
    );
    expectNoSecrets(JSON.stringify(output.stderr.mock.calls));
  });

  it("stops after cancellation during the PUT and leaves explicit recovery to the caller", async () => {
    person();
    const output = capture();
    const controller = new AbortController();
    const putting = Promise.withResolvers<boolean>();
    const requests = await fixture((request, response) => {
      if (request.method === "PUT") {
        putting.resolve(true);
        return;
      }
      reply(response, intent());
    });
    const pending = run(args("support", await file()), controller.signal);
    await putting.promise;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(requests.map((request) => request.method)).toEqual(["POST", "PUT"]);
    expect(output.stdout).not.toHaveBeenCalled();
    expectNoSecrets(JSON.stringify(output.stderr.mock.calls));
  });
});

const uploadCommands = [
  ["chat", "attachment-upload"],
  ["chat", "attachment-list"],
  ["chat", "attachment-get"],
  ["chat", "attachment-discard"],
  ["support", "attachment-upload"],
  ["support", "attachment-finalize"],
  ["support", "attachment-discard"],
];

describe("upload command validation and discovery", () => {
  it.each(uploadCommands)(
    "shows %s %s help without IDs, files, credentials or HTTP",
    async (group, action) => {
      const selected = person();
      const output = capture();
      const fetcher = vi.fn();
      vi.stubGlobal("fetch", fetcher);
      await run([group, action, "--help", "--json"], signal());
      expect(selected.access).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
      const result = JSON.parse(output.stdout.mock.calls[0]?.[0] ?? "");
      expect(result.schemaVersion).toBe(2);
      expect(JSON.stringify(result)).toContain(`inth ${group} ${action}`);
      const command = COMMAND_METADATA.find(
        (entry) => entry.command === group && entry.action === action
      );
      expect(command?.authentication).toBe("browser-or-agent");
    }
  );

  it.each(["chat", "support"])(
    "rejects %s organization-key uploads before reading or HTTP",
    async (group) => {
      vi.stubEnv("INTH_TOKEN", "inth_fixture");
      const fetcher = vi.fn();
      vi.stubGlobal("fetch", fetcher);
      await expect(
        run(
          [group, "attachment-upload", "--file", "missing.png", "--json"],
          signal()
        )
      ).rejects.toMatchObject({ code: "usage_error" });
      expect(fetcher).not.toHaveBeenCalled();
    }
  );

  it.each(
    [
      ["chat", "attachment-upload", "--file", "-"],
      ["support", "attachment-upload", "--file", "-"],
      ["chat", "attachment-upload", "--file", "image.png", "--data", "{}"],
      [
        "support",
        "attachment-upload",
        "--file",
        "image.png",
        "--data-file",
        "missing.json",
      ],
      [
        "chat",
        "attachment-upload",
        "--file",
        "image.png",
        "--file",
        "second.png",
      ],
      ["chat", "attachment-list", "--limit", "10"],
      ["chat", "attachment-list", "--cursor", "next"],
      ["chat", "attachment-get", "sat_123", "--output", "new.bin"],
      ["support", "attachment-finalize", "aga_first"],
      ["support", "attachment-discard", "spc_123"],
      [
        "support",
        "attachment-upload",
        "--file",
        "image.png",
        "--client-attachment-id",
        "not-a-uuid",
      ],
    ].map((input) => [input])
  )(
    "rejects invalid arguments %j before credentials and HTTP",
    async (input) => {
      const selected = person();
      const fetcher = vi.fn();
      vi.stubGlobal("fetch", fetcher);
      await expect(
        run([...input, "--auth", "agent", "--json"], signal())
      ).rejects.toMatchObject({ code: "usage_error" });
      expect(selected.access).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
    }
  );

  it("checks invalid MIME, empty files and receipt collisions before authentication or network", async () => {
    const selected = person();
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const image = await file();
    const empty = await file("empty.png", new Uint8Array());
    const receiptPath = nodePath.join(await directory(), "keep.json");
    await writeFile(receiptPath, "unrelated data");
    for (const input of [
      args("support", image, ["--media-type", "application/pdf"]),
      args("support", empty),
      args("support", image, ["--receipt", receiptPath]),
    ]) {
      // eslint-disable-next-line no-await-in-loop -- Each invalid operation must fail independently.
      await expect(run(input, signal())).rejects.toThrow();
    }
    expect(await readFile(receiptPath, "utf-8")).toBe("unrelated data");
    expect(selected.access).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects an invalid receipt before default-organization discovery can authenticate", async () => {
    const selected = person();
    selected.organization.mockImplementation(async () => {});
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const path = await file();
    const receiptPath = nodePath.join(await directory(), "keep.json");
    await writeFile(receiptPath, "unrelated data");
    await expect(
      run(
        [
          "support",
          "attachment-upload",
          "--file",
          path,
          "--receipt",
          receiptPath,
          "--auth",
          "agent",
          "--json",
        ],
        signal()
      )
    ).rejects.toMatchObject({ code: "receipt_write_failed" });
    expect(selected.access).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    expect(await readFile(receiptPath, "utf-8")).toBe("unrelated data");
  });

  it("rejects an existing download path without overwriting or making an HTTP request", async () => {
    const selected = person();
    const path = await file("keep.bin");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(
      run(
        [
          "chat",
          "attachment-get",
          "aga_first",
          "--output",
          path,
          "--auth",
          "agent",
          "--json",
        ],
        signal()
      )
    ).rejects.toMatchObject({ code: "usage_error" });
    expect(await readFile(path)).toEqual(Buffer.from(content));
    expect(selected.access).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("downloads chat bytes by attachment ID independently of the saved organization", async () => {
    const selected = person();
    const output = capture();
    const path = nodePath.join(await directory(), "saved.bin");
    const requests = await fixture((_request, response) => {
      response.writeHead(200, {
        "Content-Length": content.byteLength,
        "Content-Type": "image/png",
      });
      response.end(content);
    });
    await run(
      [
        "chat",
        "attachment-get",
        "aga_first",
        "--output",
        path,
        "--auth",
        "agent",
        "--json",
      ],
      signal()
    );
    expect(await readFile(path)).toEqual(Buffer.from(content));
    expect(requests[0]?.url.pathname).toBe(
      "/v1/agent-chat-attachments/aga_first/content"
    );
    expect(requests[0]?.headers.authorization).toBe("Bearer person-token");
    expect(requests[0]?.url.searchParams.has("organizationId")).toBe(false);
    expect(selected.organization).not.toHaveBeenCalled();
    expect(
      JSON.parse(output.stdout.mock.calls[0]?.[0] ?? "").data
    ).toMatchObject({
      bytes: content.byteLength,
      contentType: "image/png",
      path,
    });
  });

  it.each([
    [
      "chat",
      "attachment-discard",
      "aga_first",
      "/v1/agent-chat-attachments/aga_first",
      "DELETE",
    ],
    [
      "support",
      "attachment-finalize",
      "sat_123",
      "/v1/support/attachments/sat_123/finalize",
      "POST",
    ],
    [
      "support",
      "attachment-discard",
      "sat_123",
      "/v1/support/attachments/sat_123",
      "DELETE",
    ],
  ])(
    "uses explicit %s %s recovery without reading or uploading a local file",
    async (group, action, id, path, method) => {
      person();
      const output = capture();
      const requests = await fixture((_request, response) =>
        reply(
          response,
          method === "DELETE"
            ? { data: { discarded: true, id }, success: true }
            : ready()
        )
      );
      await run(
        [
          group,
          action,
          id,
          "--organization",
          "org_123",
          "--auth",
          "agent",
          "--json",
        ],
        signal()
      );
      expect(requests).toHaveLength(1);
      expect(requests[0]?.url.pathname).toBe(path);
      expect(requests[0]?.method).toBe(method);
      expect(requests[0]?.url.searchParams.get("organizationId")).toBe(
        "org_123"
      );
      expect(output.stdout).toHaveBeenCalledOnce();
    }
  );

  it("shows draft ID, filename, MIME, size and readiness in human discovery output", async () => {
    person();
    const output = capture();
    await fixture((_request, response) =>
      reply(response, {
        data: {
          attachments: [
            metadata("chat"),
            { ...metadata("chat", "uploading"), id: "aga_pending" },
          ],
          organizationId: "org_123",
        },
        success: true,
      })
    );
    await run(
      [
        "chat",
        "attachment-list",
        "--organization",
        "org_123",
        "--auth",
        "agent",
        "--non-interactive",
      ],
      signal()
    );
    const text = output.stdout.mock.calls.flat().join(" ");
    for (const value of [
      "aga_first",
      "image.png",
      "image/png",
      String(content.byteLength),
      "ready",
      "aga_pending",
      "uploading",
    ]) {
      expect(text).toContain(value);
    }
  });
});

const receiptData = (): UploadReceiptData => ({
  apiOrigin: "https://api.inth.com",
  clientAttachmentId,
  fileName: "image.png",
  mediaType: "image/png",
  organizationId: "org_123",
  schemaVersion: 2,
  sizeBytes: content.byteLength,
  stage: "prepared",
});

describe("upload receipts", () => {
  it("atomically replaces its own private receipt while preserving unrelated paths", async () => {
    const receiptPath = nodePath.join(await directory(), "receipt.json");
    const receipt = new UploadReceipt(receiptPath, receiptData());
    const first = await stat(receiptPath);
    receipt.update({
      ...receiptData(),
      attachmentId: "sat_123",
      stage: "reserved",
    });
    const updated = await stat(receiptPath);
    expect(updated.ino).not.toBe(first.ino);
    expect(JSON.parse(await readFile(receiptPath, "utf-8"))).toMatchObject({
      attachmentId: "sat_123",
      stage: "reserved",
    });
    // eslint-disable-next-line no-bitwise -- Check the actual private file permissions.
    expect(updated.mode & 0o777).toBe(0o600);
  });

  it("preserves in-place edits to a receipt before its next update", async () => {
    const receiptPath = nodePath.join(await directory(), "receipt.json");
    const receipt = new UploadReceipt(receiptPath, receiptData());
    const original = await stat(receiptPath);
    await writeFile(receiptPath, "caller edited recovery information", {
      mode: 0o600,
    });
    const edited = await stat(receiptPath);
    expect(edited.ino).toBe(original.ino);
    expect(() =>
      receipt.update({ ...receiptData(), stage: "reserved" })
    ).toThrow();
    expect(await readFile(receiptPath, "utf-8")).toBe(
      "caller edited recovery information"
    );
  });

  it("refuses to replace a receipt path that another file has taken over", async () => {
    const receiptPath = nodePath.join(await directory(), "receipt.json");
    const receipt = new UploadReceipt(receiptPath, receiptData());
    await unlink(receiptPath);
    await writeFile(receiptPath, "unrelated replacement", { mode: 0o600 });
    expect(() =>
      receipt.update({ ...receiptData(), stage: "reserved" })
    ).toThrow();
    expect(await readFile(receiptPath, "utf-8")).toBe("unrelated replacement");
  });

  it("does not follow a pre-existing receipt symlink or overwrite its target", async () => {
    const base = await directory();
    const target = nodePath.join(base, "keep.json");
    const receiptPath = nodePath.join(base, "receipt.json");
    await writeFile(target, "keep this file");
    await symlink(target, receiptPath);
    expect(() => new UploadReceipt(receiptPath, receiptData())).toThrow();
    expect(await readFile(target, "utf-8")).toBe("keep this file");
  });

  it("accepts help parsing for all attachment commands without adding a resource ID", () => {
    for (const [group, action] of uploadCommands) {
      expect(parseArguments([group ?? "", action ?? "", "--help"]).help).toBe(
        true
      );
    }
  });
});
