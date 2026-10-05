/* eslint-disable no-await-in-loop -- Scenarios share an app directory and run in order. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { z } from "zod";

import { fixture } from "./native-test-support.ts";

const BACKEND = "https://acme-website.c15t.dev";
const windows = process.platform === "win32";

const envelope = z.object({
  data: z.object({
    action: z.string(),
    created: z.array(z.string()).optional(),
    framework: z.string().optional(),
    installed: z.boolean().optional(),
    plan: z
      .object({
        dependencies: z.array(z.string()),
        files: z.array(z.object({ exists: z.boolean(), path: z.string() })),
      })
      .optional(),
    project: z.object({ backendUrl: z.string(), id: z.string() }),
    prompt: z.string().optional(),
  }),
  ok: z.literal(true),
});

const run = (
  binary: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env
) =>
  spawnSync(binary, args, {
    cwd,
    encoding: "utf-8",
    env: { ...env, INTH_TELEMETRY_DISABLED: "1" },
    timeout: 30_000,
  });

const calls = (stderr: string): string[] =>
  z
    .array(z.string())
    .parse(
      JSON.parse(/^CALLS (?<calls>.*)$/mu.exec(stderr)?.groups?.calls ?? "[]")
    );

const app = async (
  parent: string,
  name: string,
  dependencies: Record<string, string>
): Promise<string> => {
  const directory = path.join(parent, name);
  await mkdir(path.join(directory, "app"), { recursive: true });
  await writeFile(
    path.join(directory, "package.json"),
    JSON.stringify({ dependencies, name: `@acme/${name}`, private: true })
  );
  await writeFile(path.join(directory, "pnpm-lock.yaml"), "");
  return directory;
};

const verifyCommandGate = (binary: string, cwd: string): void => {
  const hidden = run(binary, ["c15t"], cwd, {
    ...process.env,
    INTH_EXPERIMENTAL_C15T: "",
  });
  assert.equal(hidden.status, 1);
  assert.match(hidden.stderr, /Unknown command/u);
  const enabled = { ...process.env, INTH_EXPERIMENTAL_C15T: "1" };
  const help = run(binary, ["c15t", "--help"], cwd, enabled);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--codex, --claude, --cursor, --grok/u);
  const usage = run(binary, ["c15t", "--region", "eu"], cwd, enabled);
  assert.equal(usage.status, 1);
  assert.match(usage.stderr, /Use --region with --name/u);
  const main = run(binary, ["--help"], cwd, enabled);
  assert.doesNotMatch(main.stdout, /c15t/u);
};

const verifyExistingProject = async (
  test: string,
  directory: string
): Promise<void> => {
  const prompt = run(
    test,
    [
      "c15t",
      "prompt",
      "--project",
      "Website",
      "--organization",
      "org_acme",
      "--json",
    ],
    directory
  );
  assert.equal(prompt.status, 0, prompt.stderr);
  const promptData = envelope.parse(JSON.parse(prompt.stdout)).data;
  assert.equal(promptData.project.backendUrl, BACKEND);
  assert.match(promptData.prompt ?? "", /"framework": "next-app"/u);
  assert.match(promptData.prompt ?? "", new RegExp(BACKEND, "u"));

  const preview = run(
    test,
    [
      "c15t",
      "scaffold",
      "--project",
      "acme/Website",
      "--organization",
      "org_acme",
      "--dry-run",
      "--json",
    ],
    directory
  );
  assert.equal(preview.status, 0, preview.stderr);
  const previewData = envelope.parse(JSON.parse(preview.stdout)).data;
  assert.deepEqual(previewData.plan?.dependencies, ["@c15t/nextjs@alpha"]);
  assert.deepEqual(await readdir(directory), [
    "app",
    "package.json",
    "pnpm-lock.yaml",
  ]);
  // Options before `c15t` still apply, so --dry-run outranks --yes.
  const leading = run(
    test,
    [
      "--dry-run",
      "c15t",
      "scaffold",
      "--project",
      "Website",
      "--organization",
      "org_acme",
      "--yes",
    ],
    directory
  );
  assert.equal(leading.status, 0, leading.stderr);
  assert.deepEqual(await readdir(directory), [
    "app",
    "package.json",
    "pnpm-lock.yaml",
  ]);

  const unconfirmed = run(
    test,
    ["c15t", "scaffold", "--project", "Website", "--organization", "org_acme"],
    directory
  );
  assert.equal(unconfirmed.status, 1);
  assert.match(unconfirmed.stderr, /Use --yes to write files/u);

  const missing = run(
    test,
    ["c15t", "prompt", "--project", "Other", "--organization", "org_acme"],
    directory
  );
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Project not found: Other/u);
};

const verifyScaffold = async (
  test: string,
  directory: string,
  bin: string
): Promise<void> => {
  const log = path.join(bin, "pnpm.log");
  await writeFile(
    path.join(bin, "pnpm"),
    `#!/bin/sh\nprintf '%s\\n' "$PWD" "$@" > "${log}"\n`
  );
  await chmod(path.join(bin, "pnpm"), 0o755);
  // Windows skips installation because c15t's installer refuses it there.
  const args = [
    "c15t",
    "scaffold",
    "--project",
    "prj_website",
    "--organization",
    "org_acme",
    "--yes",
    "--json",
  ];

  const scaffold = run(test, args, directory, {
    ...process.env,
    PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
  });
  assert.equal(scaffold.status, 0, scaffold.stderr);
  const { data } = envelope.parse(JSON.parse(scaffold.stdout));
  assert.deepEqual(data.created, [
    "src/consent/consent-manager.tsx",
    "src/consent/README.md",
  ]);
  assert.equal(data.installed, !windows);
  const manager = await readFile(
    path.join(directory, "src/consent/consent-manager.tsx"),
    "utf-8"
  );
  assert.match(manager, new RegExp(BACKEND, "u"));
  if (!windows) {
    const installer = await readFile(log, "utf-8");
    assert.deepEqual(installer.trim().split("\n"), [
      directory,
      "add",
      "@c15t/nextjs@alpha",
    ]);
  }
  // An interrupted apply leaves c15t's journal directory behind.
  await rm(path.join(directory, "src"), { force: true, recursive: true });
  await mkdir(path.join(directory, ".c15t-native-generation"));
  const blocked = run(
    test,
    [
      "c15t",
      "scaffold",
      "--name",
      "Created",
      "--region",
      "eu",
      "--organization",
      "org_acme",
      "--yes",
      "--skip-install",
    ],
    directory
  );
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /Run inth c15t scaffold --resume/u);
  assert.deepEqual(calls(blocked.stderr), []);
  const resumed = run(
    test,
    [
      "c15t",
      "scaffold",
      "--project",
      "Website",
      "--organization",
      "org_acme",
      "--yes",
      "--skip-install",
      "--resume",
    ],
    directory
  );
  assert.equal(resumed.status, 0, resumed.stderr);
  assert.match(resumed.stderr, /Undid the interrupted c15t setup/u);
  const entries = await readdir(directory);
  assert.deepEqual(entries.toSorted(), [
    "app",
    "package.json",
    "pnpm-lock.yaml",
    "src",
  ]);
  await writeFile(
    path.join(directory, "src/consent/consent-manager.tsx"),
    `${manager}// edited\n`
  );
  const conflict = run(
    test,
    [
      "c15t",
      "scaffold",
      "--project",
      "Website",
      "--organization",
      "org_acme",
      "--yes",
      "--skip-install",
    ],
    directory
  );
  assert.equal(conflict.status, 1);
  assert.match(conflict.stderr, /Refusing to overwrite existing file/u);
  const conflictNew = run(
    test,
    [
      "c15t",
      "scaffold",
      "--name",
      "Created",
      "--region",
      "eu",
      "--organization",
      "org_acme",
      "--yes",
      "--skip-install",
    ],
    directory
  );
  assert.equal(conflictNew.status, 1, conflictNew.stderr);
  assert.match(conflictNew.stderr, /Refusing to overwrite existing file/u);
  assert.deepEqual(calls(conflictNew.stderr), []);
};

const verifyAgents = async (
  test: string,
  directory: string,
  bin: string
): Promise<void> => {
  const log = path.join(bin, "codex.log");
  await writeFile(
    path.join(bin, "codex"),
    `#!/bin/sh\nprintf '%s\\n' "$PWD" "$#" "$1" > "${log}"\nexit "\${INTH_TEST_AGENT_EXIT:-0}"\n`
  );
  await chmod(path.join(bin, "codex"), 0o755);
  // Only the fake agents, so an installed grok cannot satisfy the lookup.
  const env = {
    ...process.env,
    PATH: `${bin}${path.delimiter}/usr/bin${path.delimiter}/bin`,
  };
  const args = [
    "c15t",
    "--codex",
    "--project",
    "Website",
    "--organization",
    "org_acme",
  ];
  const started = run(test, args, directory, env);
  assert.equal(started.status, 0, started.stderr);
  assert.match(
    started.stderr,
    /Starting Codex in .* to set up c15t for Website\./u
  );
  assert.match(started.stdout, /Codex finished/u);
  const launch = await readFile(log, "utf-8");
  const [cwd, count, prompt] = launch.split("\n");
  assert.equal(cwd, directory);
  assert.equal(count, "1");
  assert.match(prompt ?? "", /^Integrate or migrate this application/u);
  const failed = run(test, args, directory, {
    ...env,
    INTH_TEST_AGENT_EXIT: "3",
  });
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /Codex exited with status 3/u);
  const fxLog = path.join(bin, "fx.log");
  await writeFile(
    path.join(bin, "fx"),
    `#!/bin/sh\nprintf '%s\\n' "$#" "$1" "$2" > "${fxLog}"\n`
  );
  await chmod(path.join(bin, "fx"), 0o755);
  const fx = run(
    test,
    ["c15t", "--fx", "--project", "Website", "--organization", "org_acme"],
    directory,
    env
  );
  assert.equal(fx.status, 0, fx.stderr);
  assert.match(
    fx.stdout,
    /fx finished\. .* Continue the conversation with fx -c\./u
  );
  const fxLaunch = await readFile(fxLog, "utf-8");
  const [fxCount, fxCommand, fxPrompt] = fxLaunch.split("\n");
  assert.equal(fxCount, "2");
  assert.equal(fxCommand, "ask");
  assert.match(fxPrompt ?? "", /^Integrate or migrate this application/u);
  const missing = run(
    test,
    [
      "c15t",
      "--grok",
      "--name",
      "Site",
      "--region",
      "eu",
      "--organization",
      "org_acme",
    ],
    directory,
    env
  );
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Grok is not installed: grok is not on PATH/u);
  // Local checks run before any request that could create a project.
  assert.deepEqual(calls(missing.stderr), []);
};

const verifyNewProject = (test: string, directory: string): void => {
  const created = run(
    test,
    [
      "c15t",
      "scaffold",
      "--name",
      "Created",
      "--region",
      "eu",
      "--organization",
      "org_acme",
      "--yes",
      "--skip-install",
      "--json",
    ],
    directory
  );
  assert.equal(created.status, 0, created.stderr);
  const { data } = envelope.parse(JSON.parse(created.stdout));
  assert.equal(data.framework, "react");
  assert.equal(data.project.backendUrl, BACKEND);
  assert.deepEqual(calls(created.stderr), [
    'POST /v1/projects?organizationId=org_acme {"consent":{"branding":"c15t"},"name":"Created","region":"eu"}',
    "GET /v1/projects/prj_created",
    "GET /v1/projects/prj_created",
  ]);
};

export const verifyC15t = async (binary: string): Promise<void> => {
  const parent = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "inth-c15t-"))
  );
  try {
    const next = await app(parent, "website", {
      next: "16.0.0",
      react: "19.0.0",
    });
    verifyCommandGate(binary, next);
    const test = fixture("c15t-test");
    await verifyExistingProject(test, next);
    const bin = path.join(parent, "bin");
    await mkdir(bin);
    await verifyScaffold(test, next, bin);
    verifyNewProject(test, await app(parent, "dashboard", { react: "19.0.0" }));
    if (!windows) {
      await verifyAgents(test, next, bin);
    }
    const plain = await app(parent, "plain", {});
    const unknown = run(
      test,
      [
        "c15t",
        "scaffold",
        "--name",
        "Created",
        "--region",
        "eu",
        "--organization",
        "org_acme",
        "--yes",
      ],
      plain
    );
    assert.equal(unknown.status, 1, unknown.stderr);
    assert.match(unknown.stderr, /No supported framework found/u);
    assert.deepEqual(calls(unknown.stderr), []);
    const empty = path.join(parent, "empty");
    await mkdir(empty);
    const noApp = run(
      test,
      [
        "c15t",
        "scaffold",
        "--name",
        "Created",
        "--region",
        "eu",
        "--organization",
        "org_acme",
        "--yes",
      ],
      empty
    );
    assert.equal(noApp.status, 1);
    assert.match(noApp.stderr, /directory that contains package.json/u);
    assert.deepEqual(calls(noApp.stderr), []);
    // A new project is created only after the files are confirmed.
    const fresh = await app(parent, "fresh", { react: "19.0.0" });
    const newProject = [
      "c15t",
      "scaffold",
      "--name",
      "Created",
      "--region",
      "eu",
      "--organization",
      "org_acme",
    ];
    const unconfirmedNew = run(test, newProject, fresh);
    assert.equal(unconfirmedNew.status, 1, unconfirmedNew.stderr);
    assert.match(unconfirmedNew.stderr, /Use --yes to write files/u);
    assert.deepEqual(calls(unconfirmedNew.stderr), []);
    const previewNew = run(test, [...newProject, "--dry-run", "--json"], fresh);
    assert.equal(previewNew.status, 0, previewNew.stderr);
    assert.deepEqual(calls(previewNew.stderr), []);
    assert.doesNotMatch(previewNew.stdout, /new-project\.invalid/u);
    const previewData = JSON.parse(previewNew.stdout).data;
    assert.equal(previewData.project.id, null);
    assert.deepEqual(
      previewData.plan.files.map((file: { path: string }) => file.path),
      ["src/consent/consent-manager.tsx", "src/consent/README.md"]
    );
    const freshEntries = await readdir(fresh);
    assert.deepEqual(freshEntries.toSorted(), [
      "app",
      "package.json",
      "pnpm-lock.yaml",
    ]);
    console.log(
      "Native c15t: command gate, prompts, agent launches, dry runs, scaffolding, installation, conflicts, and project creation passed."
    );
  } finally {
    await rm(parent, { force: true, recursive: true });
  }
};
