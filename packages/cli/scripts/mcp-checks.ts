/* eslint-disable no-await-in-loop -- Each setup, read, and removal depends on the preceding step. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const verifyMcp = async (binary: string): Promise<void> => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "inth-mcp-test-"));
  const env = {
    ...process.env,
    APPDATA: path.join(directory, "appdata"),
    CODEX_HOME: path.join(directory, ".codex"),
    HOME: directory,
    USERPROFILE: directory,
    XDG_CONFIG_HOME: path.join(directory, "config"),
    XDG_STATE_HOME: path.join(directory, "state"),
  };
  const invoke = (args: string[], overrides: NodeJS.ProcessEnv = {}) => {
    const result = spawnSync(binary, ["mcp", ...args, "--json"], {
      cwd: directory,
      encoding: "utf-8",
      env: { ...env, ...overrides },
      timeout: 5000,
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null, "MCP process was terminated.");
    assert.notEqual(result.status, null, "MCP process did not exit.");
    assert.equal(result.stderr, "");
    return { ...result, data: JSON.parse(result.stdout) };
  };
  try {
    const missing = invoke([]);
    assert.equal(missing.status, 1);
    assert.equal(missing.data.error.code, "interaction_required");
    const globalPreview = invoke(
      ["setup", "--agent", "opencode", "--scope", "global", "--dry-run"],
      { XDG_CONFIG_HOME: "relative-config" }
    );
    assert.equal(globalPreview.status, 0, globalPreview.stdout);
    assert.equal(
      globalPreview.data.data.results[0].path,
      path.join(directory, ".config", "opencode", "opencode.json")
    );
    for (const [agent, file, source] of [
      [
        "codex",
        ".codex/config.toml",
        '# Preserve this comment\nmodel = "example"\n',
      ],
      [
        "cursor",
        ".cursor/mcp.json",
        '{\n  // Preserve this comment\n  "mcpServers": {"other":{"url":"https://example.com"}}\n}\n',
      ],
      ["claude-code", ".mcp.json", "{}\n"],
      ["vscode", ".vscode/mcp.json", '{"servers":{}}\n'],
      ["opencode", "opencode.jsonc", '{// Preserve this comment\n"mcp":{}}\n'],
    ]) {
      assert.ok(agent && file && source);
      const filename = path.join(directory, file);
      await mkdir(path.dirname(filename), { recursive: true });
      await writeFile(filename, source);
      const flags = ["--agent", agent, "--scope", "project"];
      const preview = invoke(["setup", ...flags, "--dry-run"]);
      assert.equal(preview.status, 0, preview.stdout);
      assert.equal(preview.data.data.results[0].status, "would-add");
      assert.equal(await readFile(filename, "utf-8"), source);
      const setup = invoke(["setup", ...flags]);
      assert.equal(setup.status, 0, setup.stdout);
      assert.equal(setup.data.data.connectionVerified, false);
      if (agent === "codex") {
        assert.equal(
          setup.data.data.results[0].nextStep.command,
          "codex mcp login inth"
        );
        const human = spawnSync(binary, ["mcp", "setup", ...flags], {
          cwd: directory,
          encoding: "utf-8",
          env,
          timeout: 5000,
        });
        assert.equal(human.status, 0, human.stderr);
        assert.match(human.stdout, /Inth is configured in Codex/u);
        assert.ok(
          human.stdout.split("\n").includes("    codex mcp login inth")
        );
        assert.ok(!human.stdout.includes(directory));
      }
      const installed = await readFile(filename, "utf-8");
      assert.match(installed, /https:\/\/api.inth.com\/mcp/u);
      assert.equal(
        invoke(["setup", ...flags]).data.data.results[0].status,
        "unchanged"
      );
      assert.equal(await readFile(filename, "utf-8"), installed);
      assert.equal(
        invoke(["list", ...flags]).data.data.results[0].status,
        "configured"
      );
      assert.equal(invoke(["remove", ...flags]).status, 0);
      assert.equal(
        invoke(["list", ...flags]).data.data.results[0].status,
        "not-configured"
      );
      const removed = await readFile(filename, "utf-8");
      if (source.includes("Preserve this comment")) {
        assert.match(removed, /Preserve this comment/u);
      }
      if (source.includes("https://example.com")) {
        assert.match(removed, /https:\/\/example.com/u);
      }
      if (["claude-code", "vscode", "opencode"].includes(agent)) {
        let key = "mcpServers";
        if (agent === "vscode") {
          key = "servers";
        }
        if (agent === "opencode") {
          key = "mcp";
        }
        const broken = JSON.stringify({
          [key]: {
            inth: {
              enabled: false,
              headers: { custom: "keep" },
              type: "local",
              url: "https://api.inth.com/mcp",
            },
          },
        });
        await writeFile(filename, broken);
        assert.equal(
          invoke(["list", ...flags]).data.data.results[0].status,
          "not-configured"
        );
        assert.equal(
          invoke(["setup", ...flags, "--dry-run"]).data.data.results[0].status,
          "would-add"
        );
        assert.equal(await readFile(filename, "utf-8"), broken);
        assert.equal(invoke(["setup", ...flags]).status, 0);
        const repaired = JSON.parse(await readFile(filename, "utf-8"))[key]
          .inth;
        assert.equal(repaired.type, agent === "opencode" ? "remote" : "http");
        if (agent === "opencode") {
          assert.equal(repaired.enabled, true);
        }
        assert.deepEqual(repaired.headers, { custom: "keep" });
        assert.equal(
          invoke(["setup", ...flags]).data.data.results[0].status,
          "unchanged"
        );
        assert.equal(
          invoke(["list", ...flags]).data.data.results[0].status,
          "configured"
        );
        assert.equal(invoke(["remove", ...flags]).status, 0);
      }
    }
    const filename = path.join(directory, ".cursor/mcp.json");
    for (const source of [
      '{"mcpServers":',
      '{"mcpServers":{"inth":{"url":"https://another.example"}}}',
    ]) {
      await writeFile(filename, source);
      const result = invoke([
        "setup",
        "--agent",
        "cursor",
        "--scope",
        "project",
      ]);
      assert.equal(result.status, 1, result.stdout);
      assert.equal(await readFile(filename, "utf-8"), source);
    }
    console.log(
      "Native MCP: all five clients, dry runs, repeated setup, list, removal, comments, and conflict preservation passed."
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
};
