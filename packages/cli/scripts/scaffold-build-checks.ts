// Builds every framework scaffold that `inth init` writes against the SDK
// packages in this repository, so a template that drifts from the SDK's API
// fails here. Build the SDK first: `pnpm turbo run build --filter='./packages/sdk/*'`.
//
// Each scaffold is written into a scratch copy of the matching app in
// examples/, which links the example's node_modules and so builds against the
// workspace SDK packages. The scratch copy is deleted afterwards; the example
// itself is only read.
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

// Build output and installed packages stay out of the scratch copy.
const SKIPPED = new Set([
  ".astro",
  ".next",
  ".nuxt",
  ".output",
  ".svelte-kit",
  ".tanstack",
  ".turbo",
  "dist",
  "node_modules",
]);

/**
 * Copy an example beside it, at the same depth so relative paths still
 * resolve, and link its installed packages.
 */
const scratchCopy = (example: string): string => {
  const source = path.join(repository, "examples", example);
  const scratch = path.join(
    repository,
    "examples",
    `.scaffold-check-${example}`
  );
  rmSync(scratch, { force: true, recursive: true });
  cpSync(source, scratch, {
    filter: (file) =>
      path.dirname(file) !== source || !SKIPPED.has(path.basename(file)),
    recursive: true,
  });
  symlinkSync(
    path.join(source, "node_modules"),
    path.join(scratch, "node_modules"),
    "junction"
  );
  return scratch;
};

const failed: string[] = [];
for (const [framework, example] of EXAMPLES) {
  const directory = scratchCopy(example);
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
    rmSync(directory, { force: true, recursive: true });
  }
}
if (failed.length) {
  console.error(`Scaffolds that do not build: ${failed.join(", ")}`);
  process.exit(1);
}
console.log("Every inth init scaffold typechecks and builds against the SDK.");
