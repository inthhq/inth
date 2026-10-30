import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import { PassThrough, Readable } from "node:stream";

import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiClient } from "../experiments/node/api.ts";
import { run } from "../experiments/node/commands.ts";
import { HttpClient, systemClock } from "../experiments/node/http.ts";
import { AgentAuth } from "../src/agent-auth.ts";
import { parseArguments } from "../src/arguments.ts";
import { chatRetryDiagnostic } from "../src/chat.ts";
import { COMMAND_METADATA } from "../src/command-metadata.ts";
import { buildResourceRequest } from "../src/resource-commands.ts";
import {
  prepareResourceInput,
  readResourceInput,
} from "../src/resource-input.ts";

const clientMessageId = "b8dde372-1324-4d2e-a15a-fd3761964299";
const signal = (): AbortSignal => new AbortController().signal;
const directories: string[] = [];
const file = async (contents: string | Uint8Array): Promise<string> => {
  const directory = await mkdtemp(nodePath.join(tmpdir(), "inth-chat-"));
  directories.push(directory);
  const inputPath = nodePath.join(directory, "input.txt");
  await writeFile(inputPath, contents);
  return inputPath;
};
const unused = (): never => {
  throw new Error("Unexpected auth operation");
};
const agent = (): Promise<AgentAuth> =>
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

describe("chat command inputs", () => {
  it("publishes chat help examples that parse as valid requests", () => {
    const commands = COMMAND_METADATA.filter(
      (entry) => entry.command === "chat"
    );
    expect(commands.length).toBeGreaterThanOrEqual(3);
    for (const command of commands) {
      for (const example of command.examples) {
        const words = example.match(/'[^']*'|"[^"]*"|\S+/gu) ?? [];
        const args = words
          .slice(1)
          .map((word) => (/^["']/u.test(word) ? word.slice(1, -1) : word));
        expect(() => parseArguments(args), example).not.toThrow();
      }
    }
  });
  it.each([
    ["start", [], "/v1/agent-chats", true],
    [
      "send",
      ["chat/a?b#c"],
      "/v1/agent-chats/chat%2Fa%3Fb%23c/messages",
      false,
    ],
  ] as const)(
    "builds %s without generating a retry ID",
    (action, ids, path, scoped) => {
      const options = parseArguments([
        "chat",
        action,
        ...ids,
        "--message",
        "  Question\nabout cookies  ",
      ]);
      const request = buildResourceRequest(options);
      expect(request).toEqual({
        body: '{"message":"Question\\nabout cookies"}',
        method: "POST",
        path,
        scoped,
      });
      expect(buildResourceRequest(options)).toEqual(request);
      expect(chatRetryDiagnostic(options)).toBeUndefined();
    }
  );
  it("supports Inbox context and explicit stable message IDs", () => {
    const request = buildResourceRequest(
      parseArguments([
        "chat",
        "start",
        "--message",
        "-",
        "--inbox-item",
        "inbox_123",
        "--client-message-id",
        clientMessageId,
        "--organization",
        "org_123",
      ])
    );
    expect(JSON.parse(request.body ?? "")).toEqual({
      clientMessageId,
      inboxItemId: "inbox_123",
      message: "-",
    });
    expect(request.scoped).toBe(true);
  });
  it("accepts literal message text starting with -- through equals syntax", () => {
    const options = parseArguments([
      "chat",
      "start",
      "--message=--important cookie question",
    ]);
    expect(JSON.parse(buildResourceRequest(options).body ?? "").message).toBe(
      "--important cookie question"
    );
  });
  it("reads chats by ID without a body or organization override", () => {
    expect(
      buildResourceRequest(parseArguments(["chat", "get", "chat_123"]))
    ).toEqual({
      body: undefined,
      method: "GET",
      path: "/v1/agent-chats/chat_123",
      scoped: false,
    });
  });
  it.each([
    ["start"],
    ["send", "chat_123"],
    ["get"],
    ["get", "chat_123", "extra"],
    ["start", "extra", "--message", "hello"],
    ["start", "--message", " "],
    ["start", "--message", "a".repeat(50_001)],
    ["start", "--message", "hello", "--message-file", "input.txt"],
    ["start", "--message", "hello", "--data", '{"message":"hello"}'],
    ["start", "--data", '{"message":"hello"}', "--data-file", "input.json"],
    [
      "start",
      "--data-file",
      "input.json",
      "--client-message-id",
      clientMessageId,
    ],
    ["start", "--message", "hello", "--client-message-id", "idempotency-key"],
    [
      "start",
      "--message",
      "hello",
      "--client-message-id",
      "b8dde372-1324-1d2e-a15a-fd3761964299",
    ],
    ["start", "--message", "hello", "--inbox-item", "bad\nID"],
    ["start", "--message", "hello", "--organization", "bad ID"],
    ["send", "chat_123", "--message", "hello", "--inbox-item", "inbox_123"],
    ["send", "chat_123", "--message", "hello", "--organization", "org_123"],
    ["get", "chat_123", "--organization", "org_123"],
    ["get", "chat_123", "--project", "prj_123"],
    ["get", "chat\u001B_123"],
    ["get", ".."],
    ["get", "a".repeat(256)],
    ["start", "--data", "null"],
    ["start", "--data", "[]"],
    ["start", "--data", '{"message":7}'],
    ["start", "--data", '{"message":null}'],
    ["start", "--data", '{"message":"hello","organizationId":"org_123"}'],
    [
      "send",
      "chat_123",
      "--data",
      '{"message":"hello","inboxItemId":"inbox_123"}',
    ],
    ["start", "--data", '{"clientMessageId":"missing-message"}'],
  ])(
    "rejects invalid chat input %j before credentials or HTTP",
    async (...args) => {
      const createAgent = vi.fn(agent);
      const fetcher = vi.fn();
      vi.stubEnv("INTH_TOKEN", "");
      vi.stubGlobal("fetch", fetcher);
      await expect(
        run(
          ["chat", ...args, "--auth", "agent", "--json"],
          signal(),
          createAgent
        )
      ).rejects.toMatchObject({ code: "usage_error" });
      expect(createAgent).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
    }
  );
  it("accepts the server message length boundary", () => {
    expect(
      JSON.parse(
        buildResourceRequest(
          parseArguments(["chat", "start", "--message", "a".repeat(50_000)])
        ).body ?? ""
      ).message
    ).toHaveLength(50_000);
  });
  it.each(["start", "send"])(
    "allows attachment-only %s requests with ordered IDs",
    (action) => {
      const options = parseArguments([
        "chat",
        action,
        ...(action === "send" ? ["chat_123"] : []),
        "--attachment-ids",
        '["aga_second","aga_first"]',
      ]);
      expect(JSON.parse(buildResourceRequest(options).body ?? "")).toEqual({
        attachmentIds: ["aga_second", "aga_first"],
        message: "",
      });
    }
  );
  it.each(["", "  \n  "])(
    "accepts empty message %j only when attachments are present",
    (message) => {
      expect(
        JSON.parse(
          buildResourceRequest(
            parseArguments([
              "chat",
              "start",
              "--message",
              message,
              "--attachment-ids",
              '["aga_first"]',
            ])
          ).body ?? ""
        )
      ).toEqual({ attachmentIds: ["aga_first"], message: "" });
      expect(() =>
        parseArguments(["chat", "start", "--message", message])
      ).toThrow();
    }
  );
  it("accepts ten distinct attachment IDs without reordering them", () => {
    const attachmentIds = Array.from(
      { length: 10 },
      (_, index) => `aga_${index}`
    );
    const options = parseArguments([
      "chat",
      "start",
      "--data",
      JSON.stringify({ attachmentIds }),
    ]);
    expect(JSON.parse(buildResourceRequest(options).body ?? "")).toEqual({
      attachmentIds,
      message: "",
    });
  });
  it.each([
    "null",
    "{}",
    '"aga_first"',
    '["aga_first",7]',
    '["aga_first",null]',
    '["aga_first","aga_first"]',
    '["sat_first"]',
    '["aga_"]',
    '["aga_bad/id"]',
    JSON.stringify([`aga_${"a".repeat(61)}`]),
    JSON.stringify(Array.from({ length: 11 }, (_, index) => `aga_${index}`)),
  ])("rejects invalid attachment arrays %s before login", async (ids) => {
    vi.stubEnv("INTH_TOKEN", "");
    const createAgent = vi.fn(agent);
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(
      run(
        ["chat", "start", "--attachment-ids", ids, "--auth", "agent"],
        signal(),
        createAgent
      )
    ).rejects.toMatchObject({ code: "usage_error" });
    expect(createAgent).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    ["--attachment-ids", "[]"],
    ["--attachment-ids", '["aga_first"]', "--attachment-ids", '["aga_second"]'],
    ["--attachment-ids", '["aga_first"]', "--data", '{"message":"hello"}'],
    ["--attachment-ids", '["aga_first"]', "--data-file", "input.json"],
    ["--data", '{"message":"hello","attachmentIds":"aga_first"}'],
    ["--data", '{"attachmentIds":["aga_first"],"message":null}'],
    ["--data", '{"attachmentIds":["aga_first"],"unknown":"value"}'],
  ])("rejects incompatible attachment input %j", (...args) => {
    expect(() => parseArguments(["chat", "start", ...args])).toThrow();
  });
});

describe("file and stdin input", () => {
  it.each(["data", "data-file", "message-file", "stdin"])(
    "retains attachment IDs and one generated UUID through %s preparation",
    async (source) => {
      const attachmentIds = ["aga_second", "aga_first"];
      const json = JSON.stringify({
        attachmentIds,
        message: "  東京\nquestion  ",
      });
      let args: string[];
      if (source === "data") {
        args = ["--data", json];
      } else if (source === "data-file") {
        args = ["--data-file", await file(json)];
      } else {
        const input = "  東京\nquestion  ";
        if (source === "stdin") {
          vi.stubGlobal("process", {
            ...process,
            stdin: Readable.from([Buffer.from(input)]),
          });
        }
        args = [
          "--message-file",
          source === "stdin" ? "-" : await file(input),
          "--attachment-ids",
          JSON.stringify(attachmentIds),
        ];
      }
      const options = parseArguments(["chat", "start", ...args]);
      await prepareResourceInput(options, signal());
      const first = buildResourceRequest(options);
      const body = JSON.parse(first.body ?? "");
      expect(body).toEqual({
        attachmentIds,
        clientMessageId: expect.stringMatching(/^[\da-f-]{36}$/u),
        message: "東京\nquestion",
      });
      await prepareResourceInput(options, signal());
      expect(buildResourceRequest(options)).toEqual(first);
    }
  );
  it("preserves an explicit UUID in attachment-only JSON", async () => {
    const options = parseArguments([
      "chat",
      "start",
      "--data",
      JSON.stringify({ attachmentIds: ["aga_first"], clientMessageId }),
    ]);
    await prepareResourceInput(options, signal());
    expect(JSON.parse(buildResourceRequest(options).body ?? "")).toEqual({
      attachmentIds: ["aga_first"],
      clientMessageId,
      message: "",
    });
    expect(chatRetryDiagnostic(options)).toBeUndefined();
  });
  it.each(["message-file", "data-file"])(
    "reads --%s once and keeps the generated retry ID stable",
    async (option) => {
      const path = await file(
        option === "message-file"
          ? "  東京\nquestion  "
          : '{"message":"  東京\\nquestion  ","inboxItemId":"inbox_123"}'
      );
      const options = parseArguments(["chat", "start", `--${option}`, path]);
      await prepareResourceInput(options, signal());
      const first = buildResourceRequest(options);
      const body = JSON.parse(first.body ?? "");
      expect(body.message).toBe("東京\nquestion");
      expect(body.clientMessageId).toMatch(/^[\da-f-]{36}$/u);
      await writeFile(path, "Changed after reading");
      await prepareResourceInput(options, signal());
      expect(buildResourceRequest(options)).toEqual(first);
      expect(chatRetryDiagnostic(options)).toContain(body.clientMessageId);
    }
  );
  it("preserves an explicit retry ID in JSON without a diagnostic", async () => {
    const options = parseArguments([
      "chat",
      "send",
      "chat_123",
      "--data",
      JSON.stringify({ clientMessageId, message: "hello" }),
    ]);
    await prepareResourceInput(options, signal());
    expect(
      JSON.parse(buildResourceRequest(options).body ?? "").clientMessageId
    ).toBe(clientMessageId);
    expect(chatRetryDiagnostic(options)).toBeUndefined();
  });
  it.each(["data", "data-file"])(
    "gives usable JSON retry guidance for --%s",
    async (option) => {
      const json = '{"message":"hello"}';
      const options = parseArguments([
        "chat",
        "start",
        `--${option}`,
        option === "data" ? json : await file(json),
      ]);
      await prepareResourceInput(options, signal());
      const id = options.generatedClientMessageId;
      expect(id).toBeTruthy();
      const diagnostic = chatRetryDiagnostic(options);
      expect(diagnostic).toContain(`"clientMessageId":"${id}"`);
      const body = JSON.parse(buildResourceRequest(options).body ?? "");
      const retry = parseArguments([
        "chat",
        "start",
        "--data",
        JSON.stringify({ ...body, clientMessageId: id }),
      ]);
      await prepareResourceInput(retry, signal());
      expect(buildResourceRequest(retry)).toEqual(
        buildResourceRequest(options)
      );
    }
  );
  it("supports JSON files for existing body commands", async () => {
    const path = await file('{"description":null}');
    const options = parseArguments([
      "project",
      "update",
      "prj_123",
      "--data-file",
      path,
    ]);
    await prepareResourceInput(options, signal());
    expect(buildResourceRequest(options)).toMatchObject({
      body: '{"description":null}',
      method: "PATCH",
    });
  });
  it("decodes piped UTF-8 split between chunks", async () => {
    const bytes = Buffer.from("東京\nquestion");
    vi.stubGlobal("process", {
      ...process,
      stdin: Readable.from([bytes.subarray(0, 2), bytes.subarray(2)]),
    });
    expect(await readResourceInput("-", "message-file", signal())).toBe(
      "東京\nquestion"
    );
  });
  it("refuses a TTY instead of waiting for input", async () => {
    vi.stubGlobal("process", {
      ...process,
      stdin: Object.assign(new PassThrough(), { isTTY: true }),
    });
    await expect(
      readResourceInput("-", "message-file", signal())
    ).rejects.toThrow("Pipe UTF-8 input");
  });
  it("cancels a pending stdin read", async () => {
    const stream = new PassThrough();
    vi.stubGlobal("process", { ...process, stdin: stream });
    const controller = new AbortController();
    const reading = readResourceInput("-", "message-file", controller.signal);
    controller.abort();
    await expect(reading).rejects.toMatchObject({ name: "AbortError" });
    expect(stream.destroyed).toBe(true);
  });
  it("rejects malformed UTF-8 from files and stdin", async () => {
    const bytes = new Uint8Array([0xc3, 0x28]);
    await expect(
      readResourceInput(await file(bytes), "message-file", signal())
    ).rejects.toThrow(/utf-8/iu);
    vi.stubGlobal("process", { ...process, stdin: Readable.from([bytes]) });
    await expect(
      readResourceInput("-", "message-file", signal())
    ).rejects.toThrow(/utf-8/iu);
  });
  it("rejects oversized files and stdin before parsing", async () => {
    await expect(
      readResourceInput(await file("12345"), "data-file", signal(), 4)
    ).rejects.toThrow("4 byte input limit");
    vi.stubGlobal("process", {
      ...process,
      stdin: Readable.from([Buffer.from("123"), Buffer.from("45")]),
    });
    await expect(
      readResourceInput("-", "data-file", signal(), 4)
    ).rejects.toThrow("4 byte input limit");
  });
  it("rejects directories, devices and missing paths", async () => {
    const path = await file("hello");
    for (const input of [
      `${path}/..`,
      `${path}.missing`,
      ...(process.platform === "win32" ? [] : ["/dev/null"]),
    ]) {
      // eslint-disable-next-line no-await-in-loop -- Check each real filesystem input independently.
      await expect(
        readResourceInput(input, "message-file", signal())
      ).rejects.toMatchObject({ code: "usage_error" });
    }
  });
  it("rejects invalid file contents before credentials and HTTP", async () => {
    const path = await file('{"message":"hello","unexpected":true}');
    vi.stubEnv("INTH_TOKEN", "");
    const createAgent = vi.fn(agent);
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(
      run(
        ["chat", "start", "--data-file", path, "--auth", "agent"],
        signal(),
        createAgent
      )
    ).rejects.toMatchObject({ code: "usage_error" });
    expect(createAgent).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("person-authorized chat requests", () => {
  it("replays attachment-only JSON unchanged across a real HTTP auth refresh and 429", async () => {
    const bodies: string[] = [];
    const headers: (string | undefined)[] = [];
    const server = createServer(async (request, response) => {
      const chunks: Uint8Array[] = [];
      for await (const chunk of request) {
        chunks.push(chunk);
      }
      bodies.push(Buffer.concat(chunks).toString("utf-8"));
      headers.push(request.headers.authorization);
      response.setHeader("Content-Type", "application/json");
      if (bodies.length === 1) {
        response.writeHead(401).end('{"error":"unauthorized"}');
      } else if (bodies.length === 2) {
        response.setHeader("Retry-After", "0");
        response.writeHead(429).end('{"error":"rate_limited"}');
      } else {
        response
          .writeHead(202)
          .end('{"success":true,"data":{"id":"chat_123"}}');
      }
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    // eslint-disable-next-line anti-slop/no-runtime-typeof -- Node returns a record for TCP listeners and a string for pipes.
    if (!address || typeof address === "string") {
      throw new Error("Missing fixture address");
    }
    try {
      const abort = signal();
      const http = new HttpClient(
        (url, init) =>
          fetch(
            `http://127.0.0.1:${address.port}${new URL(url).pathname}`,
            init
          ),
        systemClock(abort),
        abort
      );
      const accessToken = vi.fn((rejected?: string) =>
        Promise.resolve(rejected ? "new-token" : "old-token")
      );
      const api = new ApiClient(http, () =>
        Promise.resolve({
          accessToken,
          userInfoEndpoint: () =>
            Promise.resolve("https://api.inth.com/userinfo"),
        })
      );
      const options = parseArguments([
        "chat",
        "start",
        "--data",
        '{"attachmentIds":["aga_second","aga_first"]}',
      ]);
      await prepareResourceInput(options, abort);
      const request = buildResourceRequest(options);
      const result = await api.execute(
        request.path,
        request.method,
        request.body
      );
      expect(JSON.parse(result)).toEqual({
        data: { id: "chat_123" },
        success: true,
      });
      expect(bodies).toHaveLength(3);
      expect(new Set(bodies).size).toBe(1);
      expect(JSON.parse(bodies[0] ?? "")).toEqual({
        attachmentIds: ["aga_second", "aga_first"],
        clientMessageId: expect.stringMatching(/^[\da-f-]{36}$/u),
        message: "",
      });
      expect(headers).toEqual([
        "Bearer old-token",
        "Bearer new-token",
        "Bearer new-token",
      ]);
      expect(accessToken).toHaveBeenLastCalledWith("old-token");
    } finally {
      server.closeAllConnections();
      server.close();
      await once(server, "close");
    }
  });
  it.each(["environment", "option"])(
    "rejects an API key from %s before HTTP",
    async (source) => {
      vi.stubEnv("INTH_TOKEN", source === "environment" ? "inth_fixture" : "");
      const fetcher = vi.fn();
      vi.stubGlobal("fetch", fetcher);
      const createAgent = vi.fn(agent);
      await expect(
        run(
          [
            "chat",
            "get",
            "chat_123",
            ...(source === "option" ? ["--token", "inth_fixture"] : []),
            "--json",
          ],
          signal(),
          createAgent
        )
      ).rejects.toThrow("person's approved sign-in");
      expect(createAgent).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
    }
  );
  it("posts directly with write-only credentials and preserves the complete JSON response", async () => {
    vi.stubEnv("INTH_TOKEN", "");
    vi.spyOn(AgentAuth.prototype, "accessToken").mockResolvedValue(
      "write-only-token"
    );
    const payload = {
      data: {
        extra: { pendingTool: "scan" },
        id: "chat_123",
        status: "running",
      },
      pagination: { hasMore: false, nextCursor: null },
      success: true,
    };
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json(payload, { status: 202 }));
    vi.stubGlobal("fetch", fetcher);
    const stdout = vi.spyOn(console, "log").mockImplementation(() => {});
    const stderr = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(
      [
        "chat",
        "start",
        "--message",
        "private question",
        "--organization",
        "org_123",
        "--auth",
        "agent",
        "--json",
      ],
      signal(),
      agent
    );
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      "https://api.inth.com/v1/agent-chats?organizationId=org_123",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer write-only-token",
        }),
        method: "POST",
        redirect: "error",
      })
    );
    const body = JSON.parse(fetcher.mock.calls[0]?.[1].body ?? "");
    expect(body.message).toBe("private question");
    expect(stderr.mock.lastCall?.[0]).toContain(body.clientMessageId);
    expect(stderr.mock.lastCall?.[0]).not.toContain("private question");
    expect(JSON.parse(stdout.mock.lastCall?.[0] ?? "")).toEqual({
      data: payload,
      ok: true,
      schemaVersion: 2,
    });
  });
  it("reuses the generated message ID through one 401 refresh and a rate-limit retry", async () => {
    vi.stubEnv("INTH_TOKEN", "");
    const access = vi
      .spyOn(AgentAuth.prototype, "accessToken")
      .mockResolvedValueOnce("old-token")
      .mockResolvedValue("new-token");
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(null, { headers: { "Retry-After": "0" }, status: 429 })
      )
      .mockResolvedValue(
        Response.json(
          { data: { id: "chat_123", status: "running" }, success: true },
          { status: 202 }
        )
      );
    vi.stubGlobal("fetch", fetcher);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const stderr = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(
      [
        "chat",
        "send",
        "chat_123",
        "--message",
        "hello",
        "--auth",
        "agent",
        "--json",
      ],
      signal(),
      agent
    );
    expect(fetcher).toHaveBeenCalledTimes(3);
    const bodies = fetcher.mock.calls.map((call) => call[1].body);
    expect(new Set(bodies).size).toBe(1);
    expect(JSON.parse(bodies[0]).clientMessageId).toMatch(/^[\da-f-]{36}$/u);
    expect(access).toHaveBeenNthCalledWith(2, "old-token");
    expect(stderr).toHaveBeenCalledTimes(1);
  });
  it("keeps explicit message IDs silent", async () => {
    vi.stubEnv("INTH_TOKEN", "");
    vi.spyOn(AgentAuth.prototype, "accessToken").mockResolvedValue(
      "write-only-token"
    );
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { data: { id: "chat_123" }, success: true },
            { status: 202 }
          )
        )
    );
    vi.spyOn(console, "log").mockImplementation(() => {});
    const stderr = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(
      [
        "chat",
        "send",
        "chat_123",
        "--message",
        "hello",
        "--client-message-id",
        clientMessageId,
        "--auth",
        "agent",
        "--json",
      ],
      signal(),
      agent
    );
    expect(stderr).not.toHaveBeenCalled();
  });
});
