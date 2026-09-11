import { afterEach, describe, expect, it, vi } from "vitest";

import { parseArguments } from "../src/arguments.ts";
import { CliError } from "../src/cli-error.ts";
import { HttpError } from "../src/http-error.ts";
import {
  sendTelemetry,
  formatTelemetryNotice,
  telemetryUserId,
  telemetryCommand,
  telemetryError,
  telemetryPayload,
  TELEMETRY_URL,
} from "../src/telemetry.ts";
import { userIdentity, keyIdentity } from "./fixtures/identity.ts";

afterEach(() => vi.unstubAllGlobals());

describe("telemetry privacy", () => {
  it.each([
    [
      ["api", "/v1/projects/private-id?name=secret", "--token", "secret-token"],
      "api",
    ],
    [["switch", "secret-organization"], "switch"],
    [["link", "secret-organization"], "link"],
    [["project", "get", "secret-id"], "project get"],
    [["mcp"], "mcp setup"],
  ])("records only the command definition for %j", (args, expected) => {
    const options = parseArguments(args);
    const payload = telemetryPayload(options, "installation", 12.4, "", false);
    expect(telemetryCommand(options)).toBe(expected);
    expect(JSON.parse(payload).properties.command).toBe(expected);
    expect(payload).not.toContain("secret");
    expect(payload).not.toContain("private-id");
  });

  it("allowlists the entire payload and MCP client", () => {
    const options = parseArguments([
      "mcp",
      "setup",
      "--agent",
      "cursor",
      "--scope",
      "project",
      "--json",
    ]);
    const event = JSON.parse(
      telemetryPayload(options, "installation", 25, "cancelled", false)
    );
    expect(event).toEqual({
      api_key: expect.any(String),
      distinct_id: "cli:installation",
      event: "cli_command_completed",
      properties: {
        $geoip_disable: true,
        $lib: "inth-cli",
        $lib_version: expect.any(String),
        $process_person_profile: false,
        arch: process.arch,
        cli_version: expect.any(String),
        command: "mcp setup",
        duration_ms: 25,
        environment: "production",
        error_code: "cancelled",
        interactive: false,
        json: true,
        mcp_client: "cursor",
        os: process.platform,
        outcome: "cancelled",
        schema_version: 1,
        skills_operation: null,
        skills_source: null,
        source: "cli",
      },
    });
    options.values = [{ name: "agent", value: "private-client-path" }];
    expect(
      JSON.parse(telemetryPayload(options, "installation", 0, "", false))
        .properties.mcp_client
    ).toBeNull();
  });

  it.each([
    ["--help"],
    ["--version"],
    [],
    ["telemetry", "enable"],
    ["telemetry", "disable"],
    ["telemetry", "status"],
  ])("does not track %j", (...args) => {
    expect(
      telemetryPayload(parseArguments(args), "installation", 0, "", false)
    ).toBe("");
  });

  it("never sends server codes, request IDs, or error messages", () => {
    expect(telemetryError(new Error("secret-token"))).toBe("command_failed");
    expect(telemetryError(new CliError("secret-code", "secret-message"))).toBe(
      "command_failed"
    );
    expect(
      telemetryError(new HttpError(401, "secret-code", "secret-request"))
    ).toBe("authentication_required");
    expect(telemetryError(new CliError("cancelled", "Cancelled."))).toBe(
      "cancelled"
    );
  });
});

describe("telemetry delivery", () => {
  it("uses EU ingestion without authorization headers or redirects", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetcher);
    expect(await sendTelemetry("{}")).toBe(true);
    expect(fetcher).toHaveBeenCalledWith(TELEMETRY_URL, {
      body: "{}",
      headers: { "Content-Type": "application/json" },
      method: "POST",
      redirect: "error",
      signal: expect.any(AbortSignal),
    });
  });
  it("drops empty events and network failures without retries", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetcher);
    expect(await sendTelemetry("")).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
    expect(await sendTelemetry("{}")).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("handles rejected ingestion without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 429 }))
    );
    expect(await sendTelemetry("{}")).toBe(false);
  });
});

it.each([
  ["telemetry"],
  ["telemetry", "invalid"],
  ["telemetry", "enable", "extra"],
  ["telemetry", "enable", "--token", "secret"],
  ["telemetry", "enable", "--name", "secret"],
])("rejects invalid telemetry arguments %j", (...args) => {
  expect(() => parseArguments(args)).toThrow("Usage: inth telemetry");
});

it("identifies browser users with the same ID as the app, without merging installation identities", () => {
  expect(telemetryUserId(userIdentity)).toBe("user-one");
  expect(telemetryUserId(keyIdentity)).toBe("");
  const event = JSON.parse(
    telemetryPayload(
      parseArguments(["project", "list"]),
      "installation",
      1,
      "",
      false,
      telemetryUserId(userIdentity)
    )
  );
  expect(event.distinct_id).toBe("user-one");
  expect(event.properties.$process_person_profile).toBe(true);
  expect(event.properties.$lib).toBe("inth-cli");
  expect(JSON.stringify(event)).not.toContain("installation");
  expect(JSON.stringify(event)).not.toContain("user-creator");
});

it("uses plain product wording and preserves copyable opt-out commands", () => {
  const notice = formatTelemetryNotice();
  expect(notice).toBe(
    "We collect usage telemetry to improve our services.\nTo opt out, run `inth telemetry disable` or set INTH_TELEMETRY_DISABLED=1.\n"
  );
  expect(notice).not.toMatch(/PostHog|anonymous|EU/u);
  const narrow = formatTelemetryNotice(45);
  expect(narrow).toContain(
    "run `inth telemetry disable`\nor set INTH_TELEMETRY_DISABLED=1."
  );
  expect(narrow.split("\n").every((line) => line.length < 45)).toBe(true);
  expect(formatTelemetryNotice(80, true)).toContain(
    "\u001B[1minth telemetry disable\u001B[0m"
  );
});

it.each(["fx", "gemini-cli", "windsurf"])(
  "allows the supported MCP client %s in telemetry",
  (agent) => {
    const options = parseArguments([
      "mcp",
      "setup",
      "--agent",
      agent,
      "--scope",
      "global",
    ]);
    expect(
      JSON.parse(telemetryPayload(options, "installation", 0, "", false))
        .properties.mcp_client
    ).toBe(agent);
  }
);
