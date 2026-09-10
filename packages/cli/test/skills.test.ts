import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseArguments } from "../src/arguments.ts";
import { formatHelp } from "../src/help.ts";
import { skillsProcess } from "../src/skills.ts";
import { telemetryPayload } from "../src/telemetry.ts";

describe("skills arguments", () => {
  it.each([["skills"], ["skills", "add"], ["skills", "c15t/skills"]])(
    "defaults to the public c15t repository for %j",
    (...args) => {
      expect(parseArguments(args)).toMatchObject({
        argument: "c15t/skills",
        command: "skills",
        skillsArguments: [],
      });
    }
  );
  it("forwards multiple skills, agents, short flags and unknown upstream options verbatim", () => {
    const forwarded = [
      "--skill",
      "one",
      "two",
      "--agent",
      "claude-code",
      "cursor",
      "-g",
      "-y",
      "--metadata",
      '{"via":"inth; $()"}',
      "--future-option=value",
    ];
    expect(
      parseArguments(["skills", "owner/repo", ...forwarded])
    ).toMatchObject({
      argument: "owner/repo",
      skillsArguments: forwarded,
    });
    expect(parseArguments(["skills", "--list"]).argument).toBe("c15t/skills");
  });
  it.each([
    ["skills", "https://github.com/owner/repo"],
    ["skills", "owner/repo;touch"],
    ["skills", "--skill", "bad\0name"],
    ["skills", "--json"],
    ["--json", "skills"],
    ["--token", "secret", "skills"],
    ["skills", "--non-interactive"],
  ])("rejects invalid invocations before running a process: %j", (...args) => {
    expect(() => parseArguments(args)).toThrow();
  });
  it.each([
    ["--token", "private-value"],
    ["--token=private-value"],
    ["--organization", "private-value"],
    ["--organization=private-value"],
    ["--name", "private-value"],
    ["--data=private-value"],
    ["--no-browser"],
    ["--dry-run"],
  ])("rejects Inth-only options on either side of skills: %j", (...flags) => {
    for (const args of [
      [...flags, "skills", "--yes"],
      ["skills", ...flags, "--yes"],
      ["skills", "add", "owner/repo", "--yes", ...flags],
    ]) {
      expect(() => parseArguments(args)).toThrow(
        "Skills installation does not use Inth authentication or resource options."
      );
      expect(() => parseArguments(args)).not.toThrow("private-value");
    }
  });
  it("supports command discovery and explicit unattended confirmation", () => {
    expect(parseArguments(["skills", "--version"])).toMatchObject({
      version: true,
    });
    expect(parseArguments(["skills", "--help", "--json"])).toMatchObject({
      help: true,
      json: true,
    });
    expect(
      parseArguments(["skills", "--non-interactive", "--yes"])
    ).toMatchObject({ nonInteractive: true, skillsArguments: ["--yes"] });
    expect(formatHelp("skills")).toContain("inth skills [owner/repo]");
    expect(formatHelp("skills")).toContain("--skill");
    expect(formatHelp()).toContain("skills");
  });
  it.each([["--agent", "claude-code"], ["--agent=claude-code"]])(
    "forwards the shared leading agent option: %j",
    (...flags) => {
      expect(parseArguments([...flags, "skills", "--yes"])).toMatchObject({
        skillsArguments: ["--agent", "claude-code", "--yes"],
        values: [],
      });
      expect(() =>
        parseArguments([...flags, "--token=private-value", "skills", "--yes"])
      ).toThrow("does not use Inth authentication");
      expect(() =>
        parseArguments([...flags, "--name=private-value", "skills", "--yes"])
      ).toThrow("does not use Inth authentication");
    }
  );
});

describe("skills process", () => {
  it("passes the source to the official CLI without a shell", () => {
    expect(
      skillsProcess("c15t/skills", ["--skill", "c15t"], "linux", "")
    ).toEqual({
      args: ["--yes", "skills@1.5.25", "add", "c15t/skills", "--skill", "c15t"],
      command: "npx",
    });
  });
  it("runs npm's JS entry on Windows without cmd.exe expansion", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "inth-npm space-"));
    try {
      const bin = path.join(directory, "node_modules", "npm", "bin");
      mkdirSync(bin, { recursive: true });
      const entry = path.join(bin, "npx-cli.js");
      writeFileSync(entry, "");
      expect(
        skillsProcess(
          "c15t/skills",
          ["--skill", "%PATH% & echo unsafe"],
          "win32",
          `;${directory}`
        )
      ).toEqual({
        args: [
          entry,
          "--yes",
          "skills@1.5.25",
          "add",
          "c15t/skills",
          "--skill",
          "%PATH% & echo unsafe",
        ],
        command: "node",
      });
      expect(() => skillsProcess("c15t/skills", [], "win32", "")).toThrow(
        "Install Node.js and npm"
      );
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });
});

describe("skills analytics", () => {
  it("identifies c15t install commands and separates listing", () => {
    const install = JSON.parse(
      telemetryPayload(
        parseArguments(["skills", "--skill", "c15t"]),
        "installation",
        10,
        "",
        true
      )
    );
    expect(install.properties).toMatchObject({
      command: "skills",
      outcome: "success",
      skills_operation: "add",
      skills_source: "c15t/skills",
    });
    const list = JSON.parse(
      telemetryPayload(
        parseArguments(["skills", "--list"]),
        "installation",
        10,
        "",
        false
      )
    );
    expect(list.properties.skills_operation).toBe("list");
    expect(list.properties.skills_source).toBe("catalog");
    const cancelled = JSON.parse(
      telemetryPayload(
        parseArguments(["skills"]),
        "installation",
        10,
        "cancelled",
        true
      )
    );
    expect(cancelled.properties).toMatchObject({
      outcome: "cancelled",
      skills_operation: "browse",
      skills_source: "catalog",
    });
  });
  it("does not collect private repositories, skill names or metadata", () => {
    const options = parseArguments([
      "skills",
      "private-owner/secret-repo",
      "--skill",
      "secret-skill",
      "--metadata",
      '{"secret":"value"}',
    ]);
    const payload = telemetryPayload(
      options,
      "installation",
      10,
      "command_failed",
      false
    );
    expect(payload).not.toContain("secret");
    expect(payload).not.toContain("private-owner");
    expect(JSON.parse(payload).properties).toMatchObject({
      outcome: "error",
      skills_source: "other",
    });
    expect(
      telemetryPayload(
        parseArguments(["skills", "--help"]),
        "installation",
        0,
        "",
        false
      )
    ).toBe("");
  });
});
