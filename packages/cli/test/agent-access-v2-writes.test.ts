import { once } from "node:events";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { IncomingHttpHeaders, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import nodePath from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiClient } from "../experiments/node/api.ts";
import { Auth } from "../experiments/node/auth.ts";
import { run as runCommand } from "../experiments/node/commands.ts";
import { HttpClient, systemClock } from "../experiments/node/http.ts";
import { OrganizationContext } from "../experiments/node/state.ts";
import { runV2Write } from "../src/agent-access-write-runner.ts";
import { AgentAuth } from "../src/agent-auth.ts";
import { parseArguments } from "../src/arguments.ts";
import { CliError } from "../src/cli-error.ts";
import { HttpError } from "../src/http-error.ts";
import { buildResourceRequest } from "../src/resource-commands.ts";
import { prepareResourceInput } from "../src/resource-input.ts";
import {
  billingQuote,
  v2WriteCases,
  websiteInput,
  writeUuid,
} from "./fixtures/agent-access-v2-writes.ts";

const invoke = (args: string[], abort: AbortSignal): Promise<void> =>
  runCommand([...args, "--auth", "agent"], abort);
const realFetch = globalThis.fetch;
const cleanup: (() => Promise<void>)[] = [];
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 128, 255]);
const signal = (): AbortSignal => new AbortController().signal;
const file = async (
  name: string,
  value: string | Uint8Array
): Promise<string> => {
  const dir = await mkdtemp(nodePath.join(tmpdir(), "inth-actions-"));
  cleanup.push(() => rm(dir, { force: true, recursive: true }));
  const path = nodePath.join(dir, name);
  await writeFile(path, value);
  return path;
};
interface Received {
  body: Buffer;
  headers: IncomingHttpHeaders;
  method: string;
  url: URL;
}
const fixture = async (
  handler: (request: Received, response: ServerResponse, count: number) => void
): Promise<Received[]> => {
  const received: Received[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.from(chunk));
    }
    const item = {
      body: Buffer.concat(chunks),
      headers: request.headers,
      method: request.method ?? "",
      url: new URL(request.url ?? "/", "http://fixture.test"),
    };
    received.push(item);
    handler(item, response, received.length);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  // eslint-disable-next-line anti-slop/no-runtime-typeof -- A local TCP fixture has a numeric port.
  if (!address || typeof address === "string") {
    throw new Error("No fixture address");
  }
  cleanup.push(async () => {
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
    if (url.origin !== "https://api.inth.com") {
      throw new Error("Untrusted destination");
    }
    return realFetch(
      `http://127.0.0.1:${address.port}${url.pathname}${url.search}`,
      init
    );
  });
  return received;
};
const person = () => {
  vi.stubEnv("INTH_TOKEN", "");
  return {
    access: vi
      .spyOn(AgentAuth.prototype, "accessToken")
      .mockResolvedValue("fixture-person-token"),
    organization: vi
      .spyOn(OrganizationContext.prototype, "resolve")
      .mockResolvedValue("org_123"),
    stderr: vi.spyOn(console, "error").mockImplementation(() => {}),
    stdout: vi.spyOn(console, "log").mockImplementation(() => {}),
  };
};
afterEach(async () => {
  await Promise.all(cleanup.map((remove) => remove()));
  cleanup.length = 0;
  process.exitCode = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("named Dashboard writes", () => {
  it.each(
    ["json", "image"].flatMap((kind) =>
      ["initial", "refresh"].flatMap((phase) =>
        [
          new CliError("authentication_required", "Sign in first."),
          new Error("Authorization discovery unavailable."),
          new HttpError(503, "SERVICE_UNAVAILABLE", "auth-unavailable"),
        ].map((error) => ({ error, kind, phase }))
      )
    )
  )(
    "preserves $phase authentication failure for a $kind write: $error.message",
    async ({ error, kind, phase }) => {
      const captured = person();
      captured.access.mockReset();
      if (phase === "refresh") {
        captured.access.mockResolvedValueOnce("old-token");
      }
      captured.access.mockRejectedValue(error);
      const requests = await fixture((_request, response) => {
        response.writeHead(401);
        response.end('{"error":{"code":"UNAUTHORIZED"}}');
      });
      const args =
        kind === "image"
          ? ["account", "avatar-set", "--file", await file("image.png", png)]
          : ["integration", "github-sync"];
      await expect(invoke([...args, "--json"], signal())).rejects.toBe(error);
      expect(requests).toHaveLength(phase === "refresh" ? 1 : 0);
      expect(captured.stdout).not.toHaveBeenCalled();
    }
  );

  it.each(["json", "image"])(
    "reports a lost $kind response after a 401 refresh as unknown",
    async (kind) => {
      const captured = person();
      captured.access
        .mockResolvedValueOnce("old-token")
        .mockResolvedValueOnce("new-token");
      const requests = await fixture((_request, response, count) => {
        if (count === 1) {
          response.writeHead(401);
          response.end('{"error":{"code":"UNAUTHORIZED"}}');
        } else {
          response.destroy();
        }
      });
      const args =
        kind === "image"
          ? ["account", "avatar-set", "--file", await file("image.png", png)]
          : ["integration", "github-sync"];
      await expect(invoke([...args, "--json"], signal())).rejects.toMatchObject(
        {
          code: "mutation_outcome_unknown",
        }
      );
      expect(requests).toHaveLength(2);
      expect(requests[1]?.headers.authorization).toBe("Bearer new-token");
    }
  );

  it.each(
    v2WriteCases
      .filter((example) =>
        ["support start", "billing plan-preview", "account delete"].includes(
          example.args.slice(0, 2).join(" ")
        )
      )
      .flatMap((example) =>
        ["explicit", "saved", "default"].map((selection) => ({
          ...example,
          selection,
        }))
      )
  )(
    "refuses a $selection browser connection for $path before credentials or HTTP",
    async (example) => {
      const captured = person();
      const browser = vi
        .spyOn(Auth.prototype, "accessToken")
        .mockResolvedValue("browser-token");
      vi.spyOn(
        OrganizationContext.prototype,
        "selectedConnection"
      ).mockResolvedValue(
        example.selection === "saved" ? "browser" : undefined
      );
      const fetcher = vi.fn().mockResolvedValue(new Response(example.response));
      vi.stubGlobal("fetch", fetcher);
      await expect(
        runCommand(
          [
            ...example.args,
            ...(example.selection === "explicit" ? ["--auth", "browser"] : []),
            "--json",
          ],
          signal()
        )
      ).rejects.toMatchObject({
        code: "usage_error",
        message: expect.stringContaining("--scopes"),
      });
      expect(browser).not.toHaveBeenCalled();
      expect(captured.access).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
    }
  );

  it("uses the selected approved agent connection for opt-in writes", async () => {
    const captured = person();
    vi.spyOn(
      OrganizationContext.prototype,
      "selectedConnection"
    ).mockResolvedValue("agent");
    const requests = await fixture((_request, response) => {
      response.setHeader("Content-Type", "application/json");
      response.end('{"success":true,"data":{"id":"spc_123"}}');
    });
    await runCommand(
      [
        "support",
        "start",
        "--message",
        "Please help",
        "--client-message-id",
        writeUuid,
        "--json",
      ],
      signal()
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]?.headers.authorization).toBe(
      "Bearer fixture-person-token"
    );
    expect(JSON.parse(captured.stdout.mock.lastCall?.[0] ?? "")).toMatchObject({
      data: { data: { id: "spc_123" } },
      ok: true,
    });
  });

  it.each(v2WriteCases)(
    "executes $method $path through the parser and HTTP transport",
    async (example) => {
      const captured = person();
      const requests = await fixture((_request, response) => {
        response.setHeader("Content-Type", "application/json");
        response.end(example.response);
      });
      const args = [...example.args];
      if (example.image) {
        args[args.indexOf("--file") + 1] = await file("image.png", png);
      }
      await invoke([...args, "--json"], signal());
      expect(requests).toHaveLength(1);
      const [request] = requests;
      expect(request?.method).toBe(example.method);
      expect(request?.url.pathname).toBe(example.path);
      expect(request?.url.searchParams.get("organizationId")).toBe(
        example.scoped ? "org_123" : null
      );
      expect(request?.headers.authorization).toBe(
        "Bearer fixture-person-token"
      );
      if (example.image) {
        expect(request?.body).toEqual(Buffer.from(png));
        expect(request?.headers["content-type"]).toBe("image/png");
      } else {
        expect(
          request?.body.length ? JSON.parse(request.body.toString()) : undefined
        ).toEqual(example.body ? JSON.parse(example.body) : undefined);
      }
      const expectedResolutions =
        example.scoped || ["billing", "code-audit"].includes(args[0] ?? "")
          ? 1
          : 0;
      expect(captured.organization).toHaveBeenCalledTimes(expectedResolutions);
      expect(JSON.parse(captured.stdout.mock.lastCall?.[0] ?? "")).toEqual({
        data: JSON.parse(example.response),
        ok: true,
        schemaVersion: 2,
      });
    }
  );

  it.each(v2WriteCases)(
    "requires person credentials for $method $path before HTTP",
    async (example) => {
      vi.stubEnv("INTH_TOKEN", "inth_fixture");
      const fetcher = vi.fn();
      vi.stubGlobal("fetch", fetcher);
      await expect(
        invoke([...example.args, "--json"], signal())
      ).rejects.toMatchObject({ code: "usage_error" });
      expect(fetcher).not.toHaveBeenCalled();
    }
  );

  it("saves a complete private credit approval and executes its unchanged input and quote", async () => {
    const captured = person();
    const path = nodePath.join(
      nodePath.dirname(await file("placeholder", "")),
      "approval.json"
    );
    const requests = await fixture((_request, response, count) => {
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify({
          data: count === 1 ? billingQuote : { status: "completed" },
          success: true,
        })
      );
    });
    await invoke(
      [
        "billing",
        "credit-preview",
        "--credits",
        "100",
        "--catalog-version",
        "1",
        "--checkout-attempt-id",
        writeUuid,
        "--save-approval",
        path,
        "--json",
      ],
      signal()
    );
    const approved = JSON.parse(await readFile(path, "utf-8"));
    expect(approved).toEqual({
      approvedQuote: billingQuote,
      input: { catalogVersion: 1, checkoutAttemptId: writeUuid, credits: 100 },
      organizationId: "org_123",
    });
    if (process.platform !== "win32") {
      const info = await stat(path);
      // eslint-disable-next-line no-bitwise -- Inspect private POSIX file permission bits.
      expect(info.mode & 0o777).toBe(0o600);
    }
    await invoke(
      ["billing", "credit-purchase", "--data-file", path, "--yes", "--json"],
      signal()
    );
    expect(requests).toHaveLength(2);
    expect(JSON.parse(requests[1]?.body.toString() ?? "")).toEqual(approved);
    expect(requests[1]?.url.pathname).toBe("/v1/billing/credits/purchase");
    expect(captured.stderr.mock.calls.flat().join(" ")).toContain(writeUuid);
  });

  it("preserves an existing reviewed approval file", async () => {
    person();
    const path = await file("approval.json", "previous review\n");
    const requests = await fixture((_request, response) => {
      response.end(JSON.stringify({ data: billingQuote, success: true }));
    });
    await expect(
      invoke(
        [
          "billing",
          "credit-preview",
          "--credits",
          "100",
          "--catalog-version",
          "1",
          "--checkout-attempt-id",
          writeUuid,
          "--save-approval",
          path,
          "--json",
        ],
        signal()
      )
    ).rejects.toMatchObject({ code: "approval_save_failed" });
    expect(await readFile(path, "utf-8")).toBe("previous review\n");
    expect(requests).toHaveLength(1);
  });

  it.each(["cancel", "confirm"])(
    "reviews the exact organization, financial input and full quote before %s",
    async (choice) => {
      const captured = person();
      const requests = await fixture((_request, response) => {
        response.end('{"success":true,"data":{"status":"completed"}}');
      });
      const example = v2WriteCases.find(
        (entry) => entry.args[1] === "plan-change"
      );
      expect(example).toBeDefined();
      const options = parseArguments(
        (example?.args ?? []).filter((arg) => arg !== "--yes")
      );
      const abort = signal();
      const api = new ApiClient(
        new HttpClient(globalThis.fetch, systemClock(abort), abort),
        () =>
          Promise.resolve({
            accessToken: () => Promise.resolve("fixture-person-token"),
            // eslint-disable-next-line unicorn/no-useless-undefined -- The provider contract returns undefined rather than void.
            userInfoEndpoint: () => Promise.resolve(undefined),
          })
      );
      let prompt = "";
      const pending = runV2Write(
        options,
        buildResourceRequest(options),
        api,
        () => Promise.resolve("org_123"),
        (message) => {
          prompt = message;
          return { interactive: true, select: () => Promise.resolve(choice) };
        }
      );
      if (choice === "cancel") {
        await expect(pending).rejects.toMatchObject({ code: "cancelled" });
        expect(requests).toHaveLength(0);
      } else {
        expect(JSON.parse(await pending).data.status).toBe("completed");
        expect(requests).toHaveLength(1);
      }
      expect(prompt).toBe("Confirm reviewed action");
      const review = captured.stderr.mock.calls.flat().join("\n");
      expect(review).toContain("org_123");
      const body = JSON.parse(example?.body ?? "{}");
      expect(review).toContain(JSON.stringify(body.input));
      expect(review).toContain(JSON.stringify(body.approvedQuote));
    }
  );

  it("refreshes an image authorization once with identical raw bytes", async () => {
    const captured = person();
    captured.access
      .mockResolvedValueOnce("old-token")
      .mockResolvedValueOnce("new-token");
    const requests = await fixture((_request, response, count) => {
      response.statusCode = count === 1 ? 401 : 200;
      response.end('{"success":true,"data":{"updated":true}}');
    });
    await invoke(
      [
        "account",
        "avatar-set",
        "--file",
        await file("image.png", png),
        "--json",
      ],
      signal()
    );
    expect(requests).toHaveLength(2);
    expect(requests[0]?.body).toEqual(Buffer.from(png));
    expect(requests[1]?.body).toEqual(Buffer.from(png));
    expect(requests[1]?.headers.authorization).toBe("Bearer new-token");
  });

  it("rejects an image redirect without forwarding its authorization or bytes", async () => {
    person();
    const requests = await fixture((_request, response) => {
      response.writeHead(307, { Location: "https://outside.example/image" });
      response.end();
    });
    await expect(
      invoke(
        [
          "account",
          "avatar-set",
          "--file",
          await file("image.png", png),
          "--json",
        ],
        signal()
      )
    ).rejects.toMatchObject({ code: "mutation_outcome_unknown" });
    expect(requests).toHaveLength(1);
  });

  it.each([
    "pending",
    "expired",
    "requires_dashboard",
    "insufficient_credits",
    "error",
  ])(
    "retains %s approval response and returns a noncompletion exit code",
    async (status) => {
      const captured = person();
      await fixture((_request, response) =>
        response.end(
          JSON.stringify({
            data: { dashboardUrl: "https://inth.com/audit", status },
            success: true,
          })
        )
      );
      await invoke([...(v2WriteCases.at(-1)?.args ?? []), "--json"], signal());
      expect(process.exitCode).toBe(2);
      expect(
        JSON.parse(captured.stdout.mock.lastCall?.[0] ?? "").data.data.status
      ).toBe(status);
    }
  );

  it.each(["requires_action", "processing", "failed"])(
    "keeps billing %s distinct from completion",
    async (status) => {
      person();
      await fixture((_request, response) =>
        response.end(
          JSON.stringify({
            data: { dashboardUrl: "https://inth.com/billing", status },
            success: true,
          })
        )
      );
      const example = v2WriteCases.find(
        (item) => item.args[1] === "credit-purchase"
      );
      await invoke([...(example?.args ?? []), "--json"], signal());
      expect(process.exitCode).toBe(2);
    }
  );

  it.each([
    {},
    { status: null },
    { status: 7 },
    { status: "future_outcome" },
    null,
    [],
  ])(
    "preserves an unrecognized mutation result %j for recovery",
    async (data) => {
      const captured = person();
      const payload = { data, success: true };
      const requests = await fixture((_request, response) =>
        response.end(JSON.stringify(payload))
      );
      const example = v2WriteCases.find(
        (item) => item.args[1] === "credit-purchase"
      );
      await invoke([...(example?.args ?? []), "--json"], signal());
      expect(process.exitCode).toBe(2);
      expect(JSON.parse(captured.stdout.mock.lastCall?.[0] ?? "").data).toEqual(
        payload
      );
      expect(requests).toHaveLength(1);
    }
  );

  it("resends the exact body and ordered attachments once after a 401", async () => {
    const captured = person();
    captured.access
      .mockResolvedValueOnce("old-token")
      .mockResolvedValueOnce("new-token");
    const requests = await fixture((_request, response, count) => {
      response.statusCode = count === 1 ? 401 : 200;
      response.end(JSON.stringify({ data: { id: "spc_123" }, success: true }));
    });
    const example = v2WriteCases.find(
      (item) => item.args[0] === "support" && item.args[1] === "start"
    );
    await invoke([...(example?.args ?? []), "--json"], signal());
    expect(requests).toHaveLength(2);
    expect(requests[1]?.body).toEqual(requests[0]?.body);
    expect(requests[1]?.headers.authorization).toBe("Bearer new-token");
  });

  it.each([429, 500, 503, 408])(
    "sends once after HTTP %i and reports an unknown outcome",
    async (status) => {
      person();
      const requests = await fixture((_request, response) => {
        response.statusCode = status;
        response.setHeader("Retry-After", "0");
        response.end('{"error":{"code":"UNAVAILABLE"}}');
      });
      await expect(
        invoke(["integration", "github-sync", "--json"], signal())
      ).rejects.toMatchObject({ code: "mutation_outcome_unknown" });
      expect(requests).toHaveLength(1);
    }
  );

  it("reports a lost response as unknown without retrying or exposing transport details", async () => {
    person();
    const requests = await fixture((_request, response) => response.destroy());
    await expect(
      invoke(["integration", "github-sync", "--json"], signal())
    ).rejects.toMatchObject({ code: "mutation_outcome_unknown" });
    expect(requests).toHaveLength(1);
  });

  it("does not refresh or approve a changed billing quote after a conflict", async () => {
    person();
    const requests = await fixture((_request, response) => {
      response.statusCode = 409;
      response.end('{"error":{"code":"QUOTE_CHANGED"}}');
    });
    const example = v2WriteCases.find(
      (item) => item.args[1] === "credit-purchase"
    );
    await expect(
      invoke([...(example?.args ?? []), "--json"], signal())
    ).rejects.toMatchObject({ status: 409 });
    expect(requests).toHaveLength(1);
    expect(
      JSON.parse(requests[0]?.body.toString() ?? "").approvedQuote
    ).toEqual(billingQuote);
  });

  it("rejects conflicting organization assertions before authentication", async () => {
    const captured = person();
    await expect(
      invoke(
        [
          "billing",
          "portal",
          "--organization",
          "org_other",
          "--data",
          '{"organizationId":"org_123"}',
          "--json",
        ],
        signal()
      )
    ).rejects.toMatchObject({ code: "usage_error" });
    expect(captured.access).not.toHaveBeenCalled();
  });

  it.each([
    ["consent", "runtime-delete", "--project", "prj_123", "--yes"],
    [
      "consent",
      "runtime-key-rotate",
      "key_123",
      "--project",
      "prj_123",
      "--yes",
    ],
    [
      "consent",
      "runtime-key-rotate",
      "key_123",
      "--project",
      "prj_123",
      "--overlap-seconds",
      "86401",
      "--yes",
    ],
    ["account", "delete", "--yes"],
    ["org", "delete", "org_123", "--yes"],
    ["account", "sessions-revoke", "--mode", "all", "--yes"],
    [
      "account",
      "sessions-revoke",
      "--mode",
      "others",
      "--confirmation",
      "revoke-all-browser-sessions",
      "--yes",
    ],
    ["org", "slug-update", "org_123", "--new-slug", "new-name", "--yes"],
    [
      "org",
      "retention-set",
      "org_123",
      "--provider-retention",
      "strict-zdr",
      "--yes",
    ],
    ["integration", "github-pull-request-scans-set", "repo_123", "--yes"],
    ["support", "start", "--message", " ", "--client-message-id", writeUuid],
    [
      "support",
      "start",
      "--message",
      "Hi",
      "--client-message-id",
      writeUuid,
      "--attachment-ids",
      '["sat_123","sat_123"]',
    ],
    [
      "support",
      "start",
      "--message",
      "Hi",
      "--message-file",
      "-",
      "--client-message-id",
      writeUuid,
    ],
    ["support", "start", "--message", "Hi", "--client-message-id", "invalid"],
    ["support", "share", "spc_123", "--yes"],
    [
      "notification",
      "routing-set",
      "--data",
      '{"role":"legal","configured":false,"userIds":["usr_1"]}',
      "--yes",
    ],
    ["account", "update", "--data", '{"name":null}'],
    ["account", "update", "--data", '{"email":"new@example.com"}'],
    [
      "consent",
      "runtime-key-revoke",
      "bad.key",
      "--project",
      "prj_123",
      "--yes",
    ],
    ["integration", "github-installation-sync", "12345"],
    [
      "integration",
      "github-repository-update",
      "owner/name",
      "--branch-filters",
      "[]",
    ],
    [
      "integration",
      "github-repository-update",
      "repo_123",
      "--data",
      '{"branchFilters":[1]}',
    ],
    [
      "integration",
      "github-repository-update",
      "repo_123",
      "--data",
      '{"branchFilters":[" "]}',
    ],
    [
      "billing",
      "auto-top-up-set",
      "--data",
      `{"input":{"enabled":true,"requestId":"${writeUuid}"}}`,
      "--yes",
    ],
    [
      "billing",
      "payment-remove",
      "--payment-method-id",
      "pm_1",
      "--confirm-payment-method-id",
      "pm_2",
      "--yes",
    ],
    [
      "code-audit",
      "quote-approve",
      "scan_123",
      "--quote-id",
      "q",
      "--candidate-plan-checksum",
      "c",
      "--max-credits",
      "1.5",
      "--request-id",
      writeUuid,
      "--yes",
    ],
  ])(
    "rejects unsafe or incomplete input %j before credentials",
    async (...args) => {
      const captured = person();
      const fetcher = vi.fn();
      vi.stubGlobal("fetch", fetcher);
      await expect(invoke([...args, "--json"], signal())).rejects.toMatchObject(
        { code: "usage_error" }
      );
      expect(captured.access).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
    }
  );

  it.each([
    { i18n: { extra: true } },
    {
      i18n: {
        messages: { web: { translations: { en: { banner: ["bad"] } } } },
      },
    },
    { i18n: { messages: { web: { translations: { en: { banner: 7 } } } } } },
  ])("rejects malformed nested translations %j", (body) => {
    expect(() =>
      parseArguments([
        "consent",
        "translations-set",
        "--project",
        "prj_123",
        "--data",
        JSON.stringify(body),
        "--yes",
      ])
    ).toThrow();
  });
  it.each([
    { policies: [{ id: "a", match: {}, typo: true }] },
    { policies: [{ actions: ["maybe"], id: "a", match: {} }] },
  ])("rejects malformed replacement policies %j", (body) => {
    expect(() =>
      parseArguments([
        "consent",
        "policies-set",
        "--project",
        "prj_123",
        "--data",
        JSON.stringify(body),
        "--yes",
      ])
    ).toThrow();
  });
  it("rejects unknown nested approved audit policy fields", () => {
    expect(() =>
      parseArguments([
        "website",
        "create",
        "--data",
        JSON.stringify({
          ...websiteInput,
          approvedAuditPolicy: {
            approvalReference: "review-1",
            approvedAt: "2026-10-29T00:00:00Z",
            cookies: [
              {
                extra: true,
                name: "a",
                ownerHost: "example.com",
                partitionKey: null,
              },
            ],
            origin: "https://example.com",
            revision: "v1",
            version: 1,
          },
        }),
        "--yes",
      ])
    ).toThrow();
  });
  it("rejects incomplete quote prices and invalid renewal dates", () => {
    for (const quote of [
      { ...billingQuote, total: "1200" },
      { ...billingQuote, subtotal: undefined },
      { ...billingQuote, unexpected: true },
      {
        ...billingQuote,
        nextCycle: { startsAt: "2026-02-30T00:00:00Z", total: 1200 },
      },
    ]) {
      expect(() =>
        parseArguments([
          "billing",
          "credit-purchase",
          "--data",
          JSON.stringify({
            approvedQuote: quote,
            input: {
              catalogVersion: 1,
              checkoutAttemptId: writeUuid,
              credits: 100,
            },
          }),
          "--yes",
        ])
      ).toThrow();
    }
  });
  it("rejects inline JSON above the 1 MiB cap", () => {
    expect(() =>
      parseArguments([
        "account",
        "update",
        "--data",
        JSON.stringify({ name: "a".repeat(1_048_576) }),
      ])
    ).toThrow(/input limit/u);
  });
  it("keeps required path selectors with JSON body input", () => {
    expect(() =>
      parseArguments([
        "consent",
        "policies-set",
        "--data",
        '{"policies":[]}',
        "--yes",
      ])
    ).toThrow();
  });
  it.each(["translations-set", "policies-set"])(
    "accepts explicit clearing for %s",
    (action) => {
      const body =
        action === "translations-set" ? { i18n: null } : { policies: [] };
      const req = buildResourceRequest(
        parseArguments([
          "consent",
          action,
          "--project",
          "prj_123",
          "--data",
          JSON.stringify(body),
          "--yes",
        ])
      );
      expect(JSON.parse(req.body ?? "")).toEqual(body);
    }
  );
  it("reads Support text and nested replacement bodies from bounded UTF-8 files", async () => {
    const options = parseArguments([
      "support",
      "start",
      "--message-file",
      await file("message.txt", "Support detail"),
      "--client-message-id",
      writeUuid,
    ]);
    await prepareResourceInput(options, signal());
    expect(JSON.parse(buildResourceRequest(options).body ?? "").text).toBe(
      "Support detail"
    );
  });
  it.each([new Uint8Array([1, 2, 3]), new Uint8Array(1_048_577)])(
    "rejects invalid image bytes before credentials",
    async (bytes) => {
      const captured = person();
      await expect(
        invoke(
          [
            "account",
            "avatar-set",
            "--file",
            await file("image.png", bytes),
            "--json",
          ],
          signal()
        )
      ).rejects.toMatchObject({ code: "usage_error" });
      expect(captured.access).not.toHaveBeenCalled();
    }
  );
  it("uploads a WebP whose binary RIFF size contains a UTF-8 sequence", async () => {
    person();
    const image = new Uint8Array([
      82, 73, 70, 70, 195, 169, 0, 0, 87, 69, 66, 80,
    ]);
    const requests = await fixture((_request, response) =>
      response.end('{"success":true,"data":{}}')
    );
    await invoke(
      [
        "account",
        "avatar-set",
        "--file",
        await file("image.webp", image),
        "--json",
      ],
      signal()
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]?.headers["content-type"]).toBe("image/webp");
    expect(requests[0]?.body).toEqual(Buffer.from(image));
  });
  it.each(["account", "org"])(
    "requires confirmation for destructive %s JSON writes",
    async (group) => {
      const captured = person();
      const args =
        group === "org"
          ? [
              "org",
              "delete",
              "org_123",
              "--data",
              '{"confirmation":"old-name"}',
            ]
          : [
              "account",
              "delete",
              "--data",
              '{"confirmation":"alex@example.com"}',
            ];
      await expect(invoke([...args, "--json"], signal())).rejects.toMatchObject(
        { code: "interaction_required" }
      );
      expect(captured.access).not.toHaveBeenCalled();
    }
  );
});
