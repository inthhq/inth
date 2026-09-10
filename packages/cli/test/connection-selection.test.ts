/* eslint-disable unicorn/no-useless-undefined -- Typed async mocks require an explicit undefined argument. */
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { OrganizationContext } from "../experiments/node/state.ts";
import { productionAgentEnvironment } from "../src/agent-environment.ts";
import { parseArguments } from "../src/arguments.ts";
import {
  parseConnection,
  resolveConnection,
  selectCommandConnection,
} from "../src/connection-selection.ts";

describe("selected connection", () => {
  it.each(["whoami", "org list", "project list", "auth status", "logout"])(
    "uses the saved agent connection for %s",
    async (command) => {
      expect(
        await resolveConnection(
          parseArguments(command.split(" ")),
          undefined,
          () => Promise.resolve("agent")
        )
      ).toBe("agent");
    }
  );

  it.each([
    ["whoami --auth browser", undefined, "browser"],
    ["whoami --auth agent", undefined, "agent"],
    ["whoami", "inth_key", "browser"],
    ["login", undefined, "browser"],
    ["login --email person@example.com --json", undefined, "agent"],
    ["login --complete --wait --json", undefined, "agent"],
  ])(
    "respects explicit selection and login for %s",
    async (command, key, expected) => {
      const read = vi.fn(() => Promise.reject(new Error("corrupt selection")));
      expect(
        await resolveConnection(parseArguments(command.split(" ")), key, read)
      ).toBe(expected);
      expect(read).not.toHaveBeenCalled();
    }
  );

  it("defaults to browser only when no selection exists", async () => {
    expect(
      await resolveConnection(
        parseArguments(["whoami"]),
        undefined,
        vi.fn<() => Promise<string | undefined>>().mockResolvedValue(undefined)
      )
    ).toBe("browser");
    await expect(
      resolveConnection(parseArguments(["whoami"]), undefined, () =>
        Promise.reject(new Error("unreadable"))
      )
    ).rejects.toThrow("unreadable");
  });

  it("rejects an explicit agent connection combined with an API key", async () => {
    await expect(
      selectCommandConnection(
        parseArguments(["whoami", "--auth", "agent"]),
        "inth_key",
        () => Promise.resolve("browser"),
        productionAgentEnvironment
      )
    ).rejects.toMatchObject({ code: "usage_error" });
  });

  it.each([
    "null",
    "[]",
    "{}",
    '{"auth":false}',
    '{"auth":"unknown"}',
    "broken",
  ])("fails closed for %s", (source) => {
    expect(() => parseConnection(source)).toThrow("Invalid saved connection");
  });

  it("persists changes across instances without altering organization selection", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "inth-connection-"));
    try {
      const first = new OrganizationContext(directory, directory);
      expect(await first.selectedConnection()).toBeUndefined();
      await first.select("org-one");
      await first.selectConnection("agent");
      const second = new OrganizationContext(directory, directory);
      expect(await second.selectedConnection()).toBe("agent");
      expect(await second.defaultOrganization()).toBe("org-one");
      if (process.platform !== "win32") {
        const file = await stat(path.join(directory, "connection.json"));
        expect(file.mode % 512).toBe(0o600);
      }
      await second.selectConnection("browser");
      expect(await first.selectedConnection()).toBe("browser");
      await expect(first.selectConnection("unknown")).rejects.toThrow();
      expect(
        JSON.parse(
          await readFile(path.join(directory, "connection.json"), "utf-8")
        )
      ).toEqual({ auth: "browser" });
      await writeFile(path.join(directory, "connection.json"), "broken");
      await expect(first.selectedConnection()).rejects.toMatchObject({
        code: "invalid_config",
      });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
