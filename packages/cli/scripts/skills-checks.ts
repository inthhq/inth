import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import {
  chmod,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const verifySkills = async (binary: string): Promise<void> => {
  const directory = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "inth-skills-"))
  );
  try {
    const bin = path.join(directory, "bin with spaces");
    await mkdir(bin);
    const windows = process.platform === "win32";
    const entry = windows
      ? path.join(bin, "node_modules", "npm", "bin", "npx-cli.js")
      : path.join(bin, "npx");
    await mkdir(path.dirname(entry), { recursive: true });
    await writeFile(
      entry,
      `#!/usr/bin/env node
console.log(JSON.stringify({args: process.argv.slice(2), cwd: process.cwd(), doNotTrack: process.env.DO_NOT_TRACK, disabled: process.env.DISABLE_TELEMETRY}));
if (process.env.INTH_TEST_SKILLS_WAIT) { setInterval(() => {}, 1000); }
else { process.exit(Number(process.env.INTH_TEST_SKILLS_EXIT || "0")); }
`
    );
    if (!windows) {
      await chmod(entry, 0o755);
    }
    const env = {
      ...process.env,
      DISABLE_TELEMETRY: "1",
      DO_NOT_TRACK: "1",
      INTH_TELEMETRY_DISABLED: "1",
      PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
    };
    const forwarded = [
      "--skill",
      "c15t",
      "--agent",
      "claude-code",
      "cursor",
      "--yes",
      "--metadata",
      '{"test":"spaces & $() %PATH%"}',
    ];
    for (const flags of [
      ["--token", "private-value"],
      ["--token=private-value"],
      ["--organization", "private-value"],
      ["--organization=private-value"],
      ["--no-browser"],
    ]) {
      const rejected = spawnSync(binary, ["skills", "--yes", ...flags], {
        cwd: directory,
        encoding: "utf-8",
        env,
        timeout: 5000,
      });
      assert.equal(rejected.status, 1);
      // The fake installer writes to stdout as soon as it starts.
      assert.equal(rejected.stdout, "");
      assert.match(rejected.stderr, /does not use Inth authentication/u);
      assert.doesNotMatch(rejected.stderr, /private-value/u);
    }
    for (const code of [0, 42]) {
      const result = spawnSync(binary, ["skills", ...forwarded], {
        cwd: directory,
        encoding: "utf-8",
        env: { ...env, INTH_TEST_SKILLS_EXIT: String(code) },
        timeout: 10_000,
      });
      assert.equal(result.status, code, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), {
        args: ["--yes", "skills@1.5.25", "add", "c15t/skills", ...forwarded],
        cwd: directory,
        disabled: "1",
        doNotTrack: "1",
      });
    }
    const custom = spawnSync(binary, ["skills", "owner/repo", "--list"], {
      cwd: directory,
      encoding: "utf-8",
      env,
      timeout: 10_000,
    });
    assert.equal(custom.status, 0, custom.stderr);
    assert.deepEqual(JSON.parse(custom.stdout).args, [
      "--yes",
      "skills@1.5.25",
      "add",
      "owner/repo",
      "--list",
    ]);
    const leadingAgent = spawnSync(
      binary,
      ["--agent=claude-code", "skills", "--yes"],
      { cwd: directory, encoding: "utf-8", env, timeout: 5000 }
    );
    assert.equal(leadingAgent.status, 0, leadingAgent.stderr);
    assert.deepEqual(JSON.parse(leadingAgent.stdout).args, [
      "--yes",
      "skills@1.5.25",
      "add",
      "c15t/skills",
      "--agent",
      "claude-code",
      "--yes",
    ]);
    const help = spawnSync(binary, ["skills", "--help", "--json"], {
      encoding: "utf-8",
      env: { ...env, PATH: "" },
      timeout: 5000,
    });
    assert.equal(help.status, 0, help.stderr);
    assert.equal(
      JSON.parse(help.stdout).data.commandDefinitions[0].command,
      "skills"
    );
    const missing = spawnSync(binary, ["skills", "c15t/skills"], {
      encoding: "utf-8",
      env: { ...env, PATH: "" },
      timeout: 5000,
    });
    assert.equal(missing.status, 1, missing.stderr);
    assert.match(missing.stderr, /Install Node.js and npm/u);
    const catalog = spawnSync(binary, ["skills", "--list", "--json"], {
      encoding: "utf-8",
      env: { ...env, PATH: "" },
      timeout: 5000,
    });
    assert.equal(catalog.status, 0, catalog.stderr);
    assert.equal(JSON.parse(catalog.stdout).data.skills[0].skill, "c15t");
    const unattended = spawnSync(binary, ["skills"], {
      encoding: "utf-8",
      env: { ...env, PATH: "" },
      timeout: 5000,
    });
    assert.equal(unattended.status, 1, unattended.stderr);
    assert.match(unattended.stderr, /Run inth skills in a terminal/u);
    const json = spawnSync(binary, ["skills", "--json"], {
      encoding: "utf-8",
      env,
      timeout: 5000,
    });
    assert.equal(json.status, 1);
    assert.equal(JSON.parse(json.stdout).error.code, "usage_error");
    if (!windows) {
      const child = spawn(binary, ["skills", "c15t/skills"], {
        cwd: directory,
        env: { ...env, INTH_TEST_SKILLS_WAIT: "1" },
        timeout: 10_000,
      });
      try {
        assert.ok(child.stdout);
        await once(child.stdout, "data", { signal: AbortSignal.timeout(5000) });
        const exited = once(child, "exit");
        child.kill("SIGTERM");
        const [code] = await exited;
        assert.equal(code, 130);
      } finally {
        child.kill("SIGKILL");
      }
    }
    console.log(
      "Skills: source and argument forwarding, exit codes, telemetry opt-outs, help, and missing npx passed."
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
};
