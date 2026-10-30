import { existsSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, readlink, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import nodePath from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { run } from "../experiments/node/commands.ts";
import { OrganizationContext } from "../experiments/node/state.ts";
import { AGENT_ACCESS_COMMANDS } from "../src/agent-access-commands.ts";
import { formatAccessResource } from "../src/agent-access-output.ts";
import { AgentAuth } from "../src/agent-auth.ts";
import { parseArguments } from "../src/arguments.ts";
import { COMMAND_METADATA } from "../src/command-metadata.ts";
import { helpCommands, formatHelp } from "../src/help.ts";
import type { OrganizationUI } from "../src/organizations.ts";
import { approveResource } from "../src/resource-approval.ts";
import { buildResourceRequest } from "../src/resource-commands.ts";
import {
  saveResourceDownload,
  validateDownloadOutput,
} from "../src/resource-download.ts";
import { prepareResourceInput } from "../src/resource-input.ts";
import {
  accessRequestCases,
  invalidAccessRequests,
} from "./fixtures/agent-access-requests.ts";

const directories: string[] = [];
const directory = async (): Promise<string> => {
  const path = await mkdtemp(nodePath.join(tmpdir(), "inth-access-"));
  directories.push(path);
  return path;
};
const signal = (): AbortSignal => new AbortController().signal;
const person = (): void => {
  vi.stubEnv("INTH_TOKEN", "");
  vi.spyOn(AgentAuth.prototype, "accessToken").mockResolvedValue(
    "person-token"
  );
  vi.spyOn(OrganizationContext.prototype, "resolve").mockResolvedValue(
    "org_123"
  );
};
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { force: true, recursive: true }))
  );
});

describe("agent access requests", () => {
  it.each(accessRequestCases)(
    "executes $args and keeps every response field",
    async (example) => {
      person();
      const payload = {
        data: {
          completeEvidence: { nested: ["unprojected"] },
          dataCompleteness: "full",
          id: "result_123",
        },
        pagination: { hasMore: true, nextCursor: "next+/=" },
        success: true,
      };
      const fetcher = vi.fn().mockResolvedValue(Response.json(payload));
      vi.stubGlobal("fetch", fetcher);
      const stdout = vi.spyOn(console, "log").mockImplementation(() => {});
      const request = buildResourceRequest(parseArguments(example.args));
      expect(request).toMatchObject({
        method: example.method,
        path: example.path,
      });
      expect(request.body).toBe(example.body);
      await run([...example.args, "--auth", "agent", "--json"], signal());
      const url = new URL(`https://api.inth.com${example.path}`);
      if (request.scoped) {
        url.searchParams.set("organizationId", "org_123");
      }
      expect(fetcher).toHaveBeenCalledExactlyOnceWith(
        url.href,
        expect.objectContaining({
          body: example.body,
          headers: expect.objectContaining({
            Accept: example.accept ?? "application/json",
            Authorization: "Bearer person-token",
          }),
          method: example.method,
        })
      );
      expect(JSON.parse(stdout.mock.lastCall?.[0] ?? "")).toEqual({
        data: payload,
        ok: true,
        schemaVersion: 2,
      });
    }
  );
  it.each(invalidAccessRequests.map((args) => [args]))(
    "rejects %j before credentials and HTTP",
    async (args) => {
      vi.stubEnv("INTH_TOKEN", "");
      const access = vi.spyOn(AgentAuth.prototype, "accessToken");
      const fetcher = vi.fn();
      vi.stubGlobal("fetch", fetcher);
      await expect(
        run([...args, "--auth", "agent", "--json"], signal())
      ).rejects.toMatchObject({ code: "usage_error" });
      expect(access).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
    }
  );
  it.each(accessRequestCases)(
    "refuses organization keys for $args",
    async (example) => {
      vi.stubEnv("INTH_TOKEN", "inth_fixture");
      const fetcher = vi.fn();
      vi.stubGlobal("fetch", fetcher);
      await expect(
        run([...example.args, "--json"], signal())
      ).rejects.toMatchObject({ code: "usage_error" });
      expect(fetcher).not.toHaveBeenCalled();
    }
  );
  it("trims searches before enforcing the limit, including empty search", () => {
    const args = ["consent", "records", "--project", "prj_123", "--query"];
    expect(
      buildResourceRequest(parseArguments([...args, ` ${"x".repeat(256)} `]))
        .path
    ).toContain(`q=${"x".repeat(256)}`);
    expect(buildResourceRequest(parseArguments([...args, ""])).path).toContain(
      "q="
    );
  });
  it("keeps assignment-only updates and explicit unassignment independent of status", () => {
    const args = [
      "inbox",
      "update",
      "item_123",
      "--item-version",
      "9007199254740991",
    ];
    expect(
      JSON.parse(
        buildResourceRequest(
          parseArguments([...args, "--assignee", "user_123"])
        ).body ?? ""
      )
    ).toEqual({ assignedToUserId: "user_123", version: "9007199254740991" });
    expect(
      JSON.parse(
        buildResourceRequest(parseArguments([...args, "--unassign"])).body ?? ""
      )
    ).toEqual({ assignedToUserId: null, version: "9007199254740991" });
  });
  it("validates file JSON after reading and before accessing credentials", async () => {
    const input = nodePath.join(await directory(), "settings.json");
    await writeFile(input, '{"branding":null}');
    person();
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(
      run(
        [
          "consent",
          "config-update",
          "--project",
          "prj_123",
          "--data-file",
          input,
          "--auth",
          "agent",
          "--json",
        ],
        signal()
      )
    ).rejects.toMatchObject({ code: "usage_error" });
    expect(AgentAuth.prototype.accessToken).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    await writeFile(input, '{"vendorIds":[]}');
    const options = parseArguments([
      "consent",
      "iab-set",
      "--project",
      "prj_123",
      "--data-file",
      input,
    ]);
    await prepareResourceInput(options, signal());
    expect(buildResourceRequest(options).body).toBe('{"vendorIds":[]}');
  });
  it("keeps non-message chat actions free of message retry IDs", async () => {
    const options = parseArguments([
      "chat",
      "share",
      "chat_123",
      "--visibility",
      "organization",
      "--yes",
    ]);
    await prepareResourceInput(options, signal());
    expect(buildResourceRequest(options).body).toBe("{}");
    expect(options.generatedClientMessageId).toBeUndefined();
  });
});

describe("approvals, downloads, and readable help", () => {
  it.each([
    ["chat", "delete", "chat_123"],
    ["chat", "share", "chat_123", "--visibility", "organization"],
    ["website", "remove", "target_123"],
  ])("asks once for %j and defaults to cancellation", async (...args) => {
    const select = vi
      .fn<OrganizationUI["select"]>()
      .mockResolvedValue("confirm");
    const ui = { interactive: true, select };
    const options = parseArguments(args);
    await approveResource(options, ui);
    expect(select).toHaveBeenCalledTimes(1);
    expect(select.mock.calls[0]?.[0][0]?.id).toBe("cancel");
    expect(select.mock.calls[0]?.[0][1]?.slug).toContain(options.id);
    await approveResource(parseArguments([...args, "--yes"]), ui);
    expect(select).toHaveBeenCalledTimes(1);
    await expect(
      approveResource(options, { interactive: false, select })
    ).rejects.toMatchObject({ code: "interaction_required" });
    select.mockResolvedValue("cancel");
    await expect(approveResource(options, ui)).rejects.toMatchObject({
      code: "cancelled",
    });
  });
  it("saves binary bytes exclusively and refuses existing paths before HTTP", async () => {
    const output = nodePath.join(await directory(), "invoice.pdf");
    person();
    const bytes = new Uint8Array([37, 80, 68, 70, 0, 255]);
    const fetcher = vi.fn().mockResolvedValue(
      new Response(bytes, {
        headers: {
          "Content-Type": "application/pdf",
          "X-Request-Id": "pdf-123",
        },
      })
    );
    vi.stubGlobal("fetch", fetcher);
    const stdout = vi.spyOn(console, "log").mockImplementation(() => {});
    const args = [
      "billing",
      "invoice-pdf",
      "inv_123",
      "--output",
      output,
      "--auth",
      "agent",
      "--json",
    ];
    await run(args, signal());
    expect(new Uint8Array(await readFile(output))).toEqual(bytes);
    expect(JSON.parse(stdout.mock.lastCall?.[0] ?? "").data).toMatchObject({
      bytes: 6,
      contentType: "application/pdf",
      path: output,
      requestId: "pdf-123",
    });
    await expect(run(args, signal())).rejects.toMatchObject({
      code: "usage_error",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("cleans interrupted binary writes and preserves a raced existing file", async () => {
    const output = nodePath.join(await directory(), "download.bin");
    const options = parseArguments([
      "support",
      "attachment-get",
      "sat_1",
      "--output",
      output,
    ]);
    validateDownloadOutput(options);
    const controller = new AbortController();
    const saving = saveResourceDownload(
      options,
      {
        bytes: new Uint8Array(1_048_576),
        contentType: "video/webm",
        requestId: null,
      },
      controller.signal
    );
    controller.abort();
    await expect(saving).rejects.toThrow();
    expect(existsSync(output)).toBe(false);
    await writeFile(output, "keep me");
    await expect(
      saveResourceDownload(
        options,
        {
          bytes: new Uint8Array([1]),
          contentType: "video/webm",
          requestId: null,
        },
        signal()
      )
    ).rejects.toMatchObject({ code: "file_write_failed" });
    expect(await readFile(output, "utf-8")).toBe("keep me");
  });
  it.each(
    process.platform === "win32"
      ? ["file", "missing"]
      : ["file", "missing", "symlink"]
  )(
    "preserves a %s path after an interrupted download is moved",
    async (replacement) => {
      const output = nodePath.join(await directory(), "download.bin");
      const moved = `${output}.partial`;
      const options = parseArguments([
        "support",
        "attachment-get",
        "sat_1",
        "--output",
        output,
      ]);
      const controller = new AbortController();
      const reason = new Error("Download stopped");
      const saving = saveResourceDownload(
        options,
        {
          bytes: new Uint8Array(1_048_576),
          contentType: "video/webm",
          requestId: null,
        },
        controller.signal
      );
      renameSync(output, moved);
      if (replacement === "file") {
        writeFileSync(output, "keep me");
      } else if (replacement === "symlink") {
        symlinkSync(moved, output);
      }
      controller.abort(reason);
      await expect(saving).rejects.toBe(reason);
      const movedBytes = await readFile(moved);
      expect(movedBytes.byteLength).toBe(65_536);
      if (replacement === "file") {
        expect(await readFile(output, "utf-8")).toBe("keep me");
      } else if (replacement === "symlink") {
        expect(await readlink(output)).toBe(moved);
      } else {
        expect(existsSync(output)).toBe(false);
      }
    }
  );
  it.each(["-", "bad\nfile"])("rejects unsafe binary output %j", (output) => {
    expect(() =>
      validateDownloadOutput(
        parseArguments([
          "billing",
          "invoice-pdf",
          "inv_123",
          "--output",
          output,
        ])
      )
    ).toThrow();
  });
  it.each([
    ["billing", "invoice-pdf", "--output"],
    ["support", "get", "--cursor"],
    ["website-audit", "screenshot-get", "--audit"],
  ])(
    "shows detailed %s %s help without a resource ID",
    (command, action, flag) => {
      expect(parseArguments([command, action, "--help"]).help).toBe(true);
      expect(helpCommands(command, action)).toHaveLength(1);
      expect(formatHelp(command, action)).toContain(flag);
    }
  );
  it("publishes examples that parse with the declared inputs", () => {
    for (const spec of AGENT_ACCESS_COMMANDS) {
      const metadata = COMMAND_METADATA.find(
        (entry) =>
          entry.command === spec.command && entry.action === spec.action
      );
      for (const example of metadata?.examples ?? []) {
        const words = example.match(/'[^']*'|"[^"]*"|\S+/gu) ?? [];
        const args = words
          .slice(1)
          .map((word) => (/^["']/u.test(word) ? word.slice(1, -1) : word));
        expect(() => parseArguments(args), example).not.toThrow();
      }
    }
  });
  it("requires explicit audit scope and describes verification methods", () => {
    const start = COMMAND_METADATA.find(
      (entry) => entry.command === "website-audit" && entry.action === "start"
    );
    expect(
      start?.options.find((entry) => entry.name === "scope")
    ).toMatchObject({
      defaultValue: null,
      required: true,
      values: ["free_preview", "full_audit"],
    });
    const verify = COMMAND_METADATA.find(
      (entry) =>
        entry.command === "website" && entry.action === "verification-check"
    );
    expect(
      verify?.options.find((entry) => entry.name === "method")
    ).toMatchObject({
      defaultValue: null,
      values: ["dns", "http", "email", "search_console"],
    });
  });
  it("shows the next usage page and quotes query text in detail hints", () => {
    const usage = formatAccessResource(
      parseArguments(["billing", "usage"]),
      JSON.stringify({
        data: {
          creditUsage: { items: [], page: 1, periodDays: 30, totalPages: 2 },
        },
        success: true,
      })
    );
    expect(usage).toContain("--page 2");
    const summary = formatAccessResource(
      parseArguments([
        "consent",
        "records",
        "--project",
        "prj_123",
        "--query",
        "$(touch /tmp/example)'quoted",
      ]),
      JSON.stringify({
        data: { items: [], nextPage: 2, page: 1 },
        success: true,
      })
    );
    expect(summary).toContain("--query '$(touch /tmp/example)'\\''quoted'");
    expect(summary).toContain("--page 2");
  });
});
