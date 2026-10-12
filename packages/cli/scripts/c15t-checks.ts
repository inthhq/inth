/* eslint-disable no-await-in-loop -- Scenarios share an app directory and run in order. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmod,
  link as hardLink,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { z } from "zod";

import { boilerplateFrameworks } from "../vendor/c15t/generate/index.ts";
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
        files: z.array(
          z.object({ exists: z.boolean(), path: z.string() }).strict()
        ),
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

const verifyPublicCommand = (binary: string, cwd: string): void => {
  const env = { ...process.env };
  delete env.INTH_EXPERIMENTAL_C15T;
  for (const args of [["c15t", "--help"], ["--help"]]) {
    const help = run(binary, args, cwd, env);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /c15t/u);
    assert.doesNotMatch(help.stdout, /experimental/u);
  }
  const help = run(binary, ["c15t", "--help", "--json"], cwd, env);
  assert.equal(help.status, 0, help.stderr);
  const [definition] = JSON.parse(help.stdout).data.commandDefinitions;
  assert.equal(definition.command, "c15t");
  assert.ok(
    definition.options.some(
      (entry: { name: string }) => entry.name === "framework"
    )
  );
  const usage = run(binary, ["c15t", "--region", "eu"], cwd, env);
  assert.equal(usage.status, 1);
  assert.match(usage.stderr, /Use --region with --name/u);
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
  assert.match(promptData.prompt ?? "", /<package>@latest/u);
  assert.match(promptData.prompt ?? "", /https:\/\/c15t\.com\/docs/u);
  assert.doesNotMatch(promptData.prompt ?? "", /@alpha|v3\.c15t\.com/u);
  assert.match(
    promptData.prompt ?? "",
    /Running inth c15t alone does not request an upgrade/u
  );
  assert.match(
    promptData.prompt ?? "",
    /follow its installed package's bundled docs, skip the v3 installation and migration steps/u
  );
  assert.doesNotMatch(promptData.prompt ?? "", /below 3\.0 → Upgrade path/u);

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
  assert.deepEqual(previewData.plan?.dependencies, ["c15t@3"]);
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
    ".env",
    "c15t.config.ts",
    "next.config.ts",
    "app/layout.tsx",
  ]);
  assert.equal(data.installed, !windows);
  const manager = await readFile(
    path.join(directory, "app/layout.tsx"),
    "utf-8"
  );
  assert.match(manager, /from 'c15t\/next'/u);
  assert.equal(
    await readFile(path.join(directory, ".env"), "utf-8"),
    `NEXT_PUBLIC_C15T_BACKEND_URL=${BACKEND}\n`
  );
  if (!windows) {
    const installer = await readFile(log, "utf-8");
    assert.deepEqual(installer.trim().split("\n"), [
      directory,
      "add",
      "c15t@3",
    ]);
  }
  // An interrupted apply leaves c15t's journal directory behind.
  await rm(path.join(directory, "app/layout.tsx"));
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
    ".env",
    "app",
    "c15t.config.ts",
    "next.config.ts",
    "package.json",
    "pnpm-lock.yaml",
  ]);
  await writeFile(
    path.join(directory, "app/layout.tsx"),
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
  assert.match(prompt ?? "", /^Set up c15t v3/u);
  assert.match(launch, /Running inth c15t alone does not request an upgrade/u);
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
  assert.match(fxPrompt ?? "", /^Set up c15t v3/u);
  assert.match(
    fxLaunch,
    /Running inth c15t alone does not request an upgrade/u
  );
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

const verifyFrameworks = async (
  test: string,
  parent: string
): Promise<void> => {
  for (const framework of boilerplateFrameworks) {
    const directory = await app(parent, framework, {});
    const env = "EXISTING=value\n";
    await writeFile(path.join(directory, ".env"), env);
    const args = [
      "c15t",
      "scaffold",
      "--framework",
      framework,
      "--project",
      "Website",
      "--organization",
      "org_acme",
      "--yes",
      "--skip-install",
      "--json",
    ];
    const result = run(test, args, directory);
    assert.equal(result.status, 0, `${framework}: ${result.stderr}`);
    const { data } = envelope.parse(JSON.parse(result.stdout));
    assert.equal(data.framework, framework);
    const dependencies = {
      astro: ["c15t@3", "@astrojs/node", "@astrojs/svelte", "svelte"],
      "astro-static": ["c15t@3", "@astrojs/svelte", "svelte"],
      html: [],
      javascript: ["@c15t/browser@latest", "c15t@3"],
      "next-app": ["c15t@3"],
      "next-pages": ["c15t@3"],
      nuxt: ["c15t@3"],
      react: ["c15t@3"],
      solid: ["@c15t/core@3"],
      svelte: ["@c15t/svelte@latest"],
      sveltekit: ["@c15t/svelte@latest"],
      "tanstack-start": ["c15t@3"],
      vue: ["c15t@3"],
    }[framework];
    assert.deepEqual(data.plan?.dependencies, dependencies, framework);
    assert.ok(data.created?.length);
    assert.equal(await readFile(path.join(directory, ".env"), "utf-8"), env);
    for (const file of data.created ?? []) {
      const contents = await readFile(path.join(directory, file), "utf-8");
      assert.ok(contents.length);
    }
    if (!["html", "solid"].includes(framework)) {
      assert.match(result.stdout, /Add to \.env/u);
    }
    assert.match(result.stdout, /acme-website\.c15t\.dev/u);
    assert.ok(calls(result.stderr).every((call) => call.startsWith("GET")));
    const repeated = run(test, args, directory);
    assert.equal(repeated.status, 0, `${framework}: ${repeated.stderr}`);
    assert.deepEqual(
      envelope.parse(JSON.parse(repeated.stdout)).data.created,
      []
    );
  }
};

const verifyPartialHtml = async (
  test: string,
  parent: string
): Promise<void> => {
  const script = `<script src="${BACKEND}/c15t.js" defer></script>`;
  const link = '<a href="#c15t-preferences">Privacy settings</a>';
  for (const [name, head, body, missing, present] of [
    ["html-script", script, "", "#c15t-preferences", "/c15t.js"],
    ["html-link", "", link, "/c15t.js", "#c15t-preferences"],
    ["html-complete", script, link, "", ""],
  ]) {
    const directory = await app(parent, name ?? "", {});
    const html = `<html><head>${head}</head><body>${body}</body></html>`;
    await writeFile(path.join(directory, "index.html"), html);
    const args = [
      "c15t",
      "scaffold",
      "--framework",
      "html",
      "--project",
      "Website",
      "--organization",
      "org_acme",
      "--json",
    ];
    for (const flags of [["--dry-run"], ["--yes", "--skip-install"]]) {
      const result = run(test, [...args, ...flags], directory);
      assert.equal(result.status, 0, result.stderr);
      const { data } = JSON.parse(result.stdout);
      const guidance = data.plan.instructions.filter((instruction: string) =>
        instruction.startsWith("Add to index.html:")
      );
      if (missing) {
        assert.equal(guidance.length, 1);
        assert.ok(guidance[0].includes(missing), guidance[0]);
        assert.ok(!guidance[0].includes(present), guidance[0]);
      } else {
        assert.deepEqual(guidance, []);
      }
      assert.equal(
        await readFile(path.join(directory, "index.html"), "utf-8"),
        html
      );
      assert.deepEqual(await readdir(directory), [
        "app",
        "index.html",
        "package.json",
        "pnpm-lock.yaml",
      ]);
    }
    await rm(path.join(directory, "package.json"));
    await rm(path.join(directory, "pnpm-lock.yaml"));
    for (const flags of [["--dry-run"], ["--yes"]]) {
      const result = run(test, [...args, ...flags], directory);
      assert.equal(result.status, 0, result.stderr);
      const { data } = JSON.parse(result.stdout);
      const guidance = data.plan.instructions.join("\n");
      if (missing) {
        assert.ok(guidance.includes(missing), guidance);
        assert.ok(!guidance.includes(present), guidance);
      } else {
        assert.doesNotMatch(guidance, /Add to index.html/u);
      }
      assert.equal(
        await readFile(path.join(directory, "index.html"), "utf-8"),
        html
      );
      assert.deepEqual(await readdir(directory), ["app", "index.html"]);
      assert.deepEqual(data.plan.dependencies, []);
    }
  }
};

const verifyRedactedPlans = async (
  test: string,
  parent: string
): Promise<void> => {
  const directory = await app(parent, "secret-env", { react: "19.0.0" });
  const secret = "PRIVATE_KEY=fixture-secret-never-log\n";
  await writeFile(path.join(directory, ".env"), secret);
  const args = [
    "c15t",
    "scaffold",
    "--project",
    "Website",
    "--organization",
    "org_acme",
    "--json",
  ];
  for (const flags of [["--dry-run"], ["--yes", "--skip-install"]]) {
    const result = run(test, [...args, ...flags], directory);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!`${result.stdout}${result.stderr}`.includes(secret.trim()));
    const { data } = envelope.parse(JSON.parse(result.stdout));
    assert.ok(
      data.plan?.files.some((file) => file.path === ".env" && file.exists)
    );
    assert.match(result.stdout, /Add to \.env/u);
    assert.equal(await readFile(path.join(directory, ".env"), "utf-8"), secret);
  }
};

const verifyHtmlSite = async (test: string, parent: string): Promise<void> => {
  const directory = path.join(parent, "html-site");
  await mkdir(directory);
  const args = [
    "c15t",
    "scaffold",
    "--framework",
    "html",
    "--project",
    "Website",
    "--organization",
    "org_acme",
    "--json",
  ];
  const dry = run(test, [...args, "--dry-run"], directory);
  assert.equal(dry.status, 0, dry.stderr);
  assert.deepEqual(await readdir(directory), []);
  const previewNew = run(
    test,
    [
      "c15t",
      "scaffold",
      "--framework",
      "html",
      "--name",
      "Site",
      "--region",
      "eu",
      "--organization",
      "org_acme",
      "--dry-run",
      "--json",
    ],
    directory
  );
  assert.equal(previewNew.status, 0, previewNew.stderr);
  assert.deepEqual(calls(previewNew.stderr), []);
  assert.deepEqual(await readdir(directory), []);
  const created = run(test, [...args, "--yes"], directory);
  assert.equal(created.status, 0, created.stderr);
  assert.deepEqual(envelope.parse(JSON.parse(created.stdout)).data.created, [
    "index.html",
  ]);
  assert.deepEqual(await readdir(directory), ["index.html"]);
  const html = await readFile(path.join(directory, "index.html"), "utf-8");
  assert.match(html, /\/c15t\.js/u);
  assert.match(html, /#c15t-preferences/u);
  const repeated = run(test, [...args, "--yes"], directory);
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.deepEqual(
    envelope.parse(JSON.parse(repeated.stdout)).data.created,
    []
  );
  assert.equal(
    await readFile(path.join(directory, "index.html"), "utf-8"),
    html
  );
  await rm(path.join(directory, "index.html"));
  await mkdir(path.join(directory, ".c15t-native-generation"));
  const interrupted = run(test, [...args, "--yes"], directory);
  assert.equal(interrupted.status, 1);
  const resumed = run(test, [...args, "--yes", "--resume"], directory);
  assert.equal(resumed.status, 0, resumed.stderr);
  assert.deepEqual(await readdir(directory), ["index.html"]);
  await rm(path.join(directory, "index.html"));
  const stage = path.join(directory, ".c15t-native-generation");
  await mkdir(stage);
  await writeFile(
    path.join(stage, "journal.json"),
    JSON.stringify({
      directories: [],
      files: [{ content: html, exists: false, path: "index.html" }],
      root: directory,
      version: 1,
    })
  );
  await writeFile(path.join(stage, "0.tmp"), html);
  await hardLink(path.join(stage, "0.tmp"), path.join(directory, "index.html"));
  const published = run(test, [...args, "--yes", "--resume"], directory);
  assert.equal(published.status, 0, published.stderr);
  assert.deepEqual(envelope.parse(JSON.parse(published.stdout)).data.created, [
    "index.html",
  ]);
  assert.deepEqual(await readdir(directory), ["index.html"]);
  if (!windows) {
    await rm(path.join(directory, "index.html"));
    await symlink(
      path.join(parent, "missing-index.html"),
      path.join(directory, "index.html")
    );
    const linked = run(test, [...args, "--yes"], directory);
    assert.equal(linked.status, 1);
    assert.match(linked.stderr, /not a symlink/u);
  }
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
    verifyPublicCommand(binary, next);
    const test = fixture("c15t-test");
    await verifyExistingProject(test, next);
    const bin = path.join(parent, "bin");
    await mkdir(bin);
    await verifyScaffold(test, next, bin);
    await verifyFrameworks(test, parent);
    await verifyPartialHtml(test, parent);
    await verifyRedactedPlans(test, parent);
    await verifyHtmlSite(test, parent);
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
      [".env", "src/consent.tsx", "src/main.tsx", "vite.config.ts"]
    );
    const freshEntries = await readdir(fresh);
    assert.deepEqual(freshEntries.toSorted(), [
      "app",
      "package.json",
      "pnpm-lock.yaml",
    ]);
    console.log(
      "Native c15t: public help, prompts, agent launches, dry runs, scaffolding, installation, conflicts, all frameworks, and project creation passed."
    );
  } finally {
    await rm(parent, { force: true, recursive: true });
  }
};
