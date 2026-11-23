// Builds every framework scaffold that `inth init` writes against the SDK
// packages in this repository, so a template that drifts from the SDK's API
// fails here. Build the SDK first: `pnpm turbo run build --filter='./packages/sdk/*'`.
//
// Each scaffold is written over the matching app in examples/, which already
// depends on the workspace SDK packages, then built and typechecked. The
// example is restored from git afterwards, so start with a clean examples/.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generate } from "../vendor/inth-setup/generate/index.ts";
import type { BoilerplateFramework } from "../vendor/inth-setup/generate/index.ts";

const repository = fileURLToPath(new URL("../../../", import.meta.url));
const PROJECT_URL = "https://example-inth.inth.app";

// `solid` has no example app or Solid package; its engine module is checked
// inside the plain JavaScript example. `html` has no build step.
const EXAMPLES: [BoilerplateFramework, string][] = [
  ["react", "react"],
  ["next-app", "nextjs"],
  ["next-pages", "nextjs-pages-router"],
  ["tanstack-start", "tanstack-start"],
  ["vue", "vue"],
  ["nuxt", "nuxt"],
  ["svelte", "svelte"],
  ["sveltekit", "sveltekit"],
  ["astro", "astro"],
  ["astro-static", "astro-static"],
  ["javascript", "javascript"],
  ["solid", "javascript"],
];

const run = (command: string, args: string[], cwd: string): boolean => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf-8",
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.error(`${command} ${args.join(" ")} failed in ${cwd}:`);
    console.error(`${result.stdout}\n${result.stderr}`.trim());
  }
  return result.status === 0;
};

const git = (args: string[]): string =>
  spawnSync("git", args, { cwd: repository, encoding: "utf-8" }).stdout;

// List untracked files whatever status.showUntrackedFiles says, because the
// cleanup below deletes untracked files in each example.
if (
  git([
    "status",
    "--porcelain",
    "--untracked-files=all",
    "--",
    "examples",
  ]).trim()
) {
  throw new Error("examples/ has local changes. Commit or remove them first.");
}

const failed: string[] = [];
for (const [framework, example] of EXAMPLES) {
  const directory = path.join(repository, "examples", example);
  const plan = generate({ backendURL: PROJECT_URL, framework, mode: "hosted" });
  const files =
    framework === "solid"
      ? {
          "src/consent-runtime.ts":
            plan.files["src/consent/consent-runtime.ts"] ?? "",
        }
      : plan.files;
  try {
    for (const [name, content] of Object.entries(files)) {
      const file = path.join(directory, name);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, content);
    }
    // Build first: TanStack Start generates its route tree during the build.
    const passed =
      (framework === "solid" || run("pnpm", ["run", "build"], directory)) &&
      run("pnpm", ["run", "check-types"], directory);
    console.log(
      `${passed ? "ok  " : "FAIL"} ${framework} (examples/${example}${framework === "solid" ? ", engine module only" : ""})`
    );
    if (!passed) {
      failed.push(framework);
    }
  } finally {
    git(["checkout", "--", `examples/${example}`]);
    git(["clean", "-fdq", "--", `examples/${example}`]);
  }
}
if (failed.length) {
  console.error(`Scaffolds that do not build: ${failed.join(", ")}`);
  process.exit(1);
}
console.log("Every inth init scaffold typechecks and builds against the SDK.");
