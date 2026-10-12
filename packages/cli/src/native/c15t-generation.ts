import { existsSync } from "node:fs";
// eslint-disable-next-line unicorn/import-style -- Scriptc requires named node:path imports.
import { join } from "node:path";

import { runFrontendCommand } from "../../vendor/c15t/frontend/index.ts";
import type { FrontendCommandContext } from "../../vendor/c15t/frontend/index.ts";
import {
  applyGeneration,
  installGenerationDependencies,
  parseGenerationWorkflowArguments,
  planGeneration,
  recoverGeneration,
} from "../../vendor/c15t/frontend/runtime/index.ts";
import type {
  ApplicationPlan,
  GenerationRuntimeOptions,
  GenerationWorkflowResult,
  PackageManager,
} from "../../vendor/c15t/frontend/runtime/index.ts";
import { requireNativeInstaller } from "../../vendor/c15t/frontend/runtime/install.ts";
import type { GenerationPlan } from "../../vendor/c15t/generate/index.ts";
import { mergeFile } from "../../vendor/c15t/generate/merge.ts";
import { runHtmlGenerationWorkflow } from "./c15t-html.ts";
import { adaptNextGeneration, addNextConfigInstructions } from "./c15t-next.ts";
import { adaptNuxtGeneration } from "./c15t-nuxt.ts";
import { adaptReactGeneration } from "./c15t-react.ts";
import { adaptSvelteKitGeneration } from "./c15t-svelte.ts";

/** Public plans contain file metadata, never application file contents. */
export const publicGenerationPlan = (plan: ApplicationPlan) => ({
  dependencies: plan.dependencies,
  files: plan.files.map((file) => ({ exists: file.exists, path: file.path })),
  instructions: plan.instructions,
  root: plan.root,
});

// Upstream 3.0.0 prints every insert when an existing file needs any insert.
const missingInsertInstructions = (
  plan: ApplicationPlan,
  generation: GenerationPlan
): void => {
  for (const file of plan.files) {
    const merge = generation.merge?.[file.path];
    if (!file.exists || merge?.type !== "insert") {
      continue;
    }
    let current = file.content;
    const snippets: string[] = [];
    for (const insert of merge.inserts) {
      const merged = mergeFile(current, "", {
        inserts: [insert],
        marker: merge.marker,
        type: "insert",
      });
      if (merged !== current) {
        snippets.push(
          insert.before
            ? `${insert.content}\n(before ${insert.before})`
            : insert.content
        );
      }
      current = merged;
    }
    const prefix = `Add to ${file.path}:\n`;
    plan.instructions = plan.instructions.map((instruction) =>
      instruction.startsWith(prefix)
        ? `${prefix}${snippets.join("\n")}`
        : instruction
    );
  }
};

const environmentKey = (line: string): string =>
  line
    .trim()
    .replace(/^export\s+/u, "")
    .split("=")[0]
    ?.trim() ?? "";

// Describe edits to public generated assignments without exposing current values.
const environmentInstructions = (
  plan: ApplicationPlan,
  generation: GenerationPlan
): void => {
  for (const file of plan.files) {
    const merge = generation.merge?.[file.path];
    const generated = generation.files[file.path];
    if (!file.exists || merge?.type !== "env" || !generated) {
      continue;
    }
    const prefix = `Add to ${file.path}:\n`;
    plan.instructions = plan.instructions.filter(
      (instruction) => !instruction.startsWith(prefix)
    );
    for (const line of generated.split("\n").filter(Boolean)) {
      const key = environmentKey(line);
      const count = file.content
        .split("\n")
        .filter((current) => environmentKey(current) === key).length;
      if (
        count <= 1 &&
        mergeFile(file.content, `${line}\n`, merge) === file.content
      ) {
        continue;
      }
      let action = `Add to ${file.path}:`;
      if (count > 1) {
        action = `Replace all ${key} assignments in ${file.path} with this single assignment:`;
      } else if (count === 1) {
        action = `Replace the ${key} assignment in ${file.path} with:`;
      }
      plan.instructions.push(`${action}\n${line}`);
    }
  }
};

const installAppliedPlan = async (
  plan: ApplicationPlan,
  created: string[],
  manager: PackageManager,
  signal?: AbortSignal
): Promise<void> => {
  try {
    await installGenerationDependencies(
      plan.root,
      plan.dependencies,
      manager,
      signal
    );
  } catch (error) {
    if (!created.length || !(error instanceof Error)) {
      throw error;
    }
    throw new Error(`${error.message} Created: ${created.join(", ")}.`, {
      cause: error,
    });
  }
};

/** Adapt upstream plans before using its filesystem and installation runtime. */
export const runGenerationWorkflow = async (
  args: string[],
  context: FrontendCommandContext,
  options: GenerationRuntimeOptions
): Promise<GenerationWorkflowResult> => {
  if (
    !existsSync(join(options.cwd, "package.json")) &&
    (args.includes("html") || context.generation?.framework === "html")
  ) {
    return runHtmlGenerationWorkflow(args, context, options);
  }
  options.signal?.throwIfAborted();
  const flags = parseGenerationWorkflowArguments(args);
  const generation = runFrontendCommand(flags.forwarded, context);
  if (generation.command !== "setup" && generation.command !== "generate") {
    throw new Error("The generation runtime accepts setup and generate only.");
  }
  if (flags.apply && !flags.skipInstall && !options.packageManager) {
    throw new Error(
      "Supply a package manager from the host or use --skip-install."
    );
  }
  if (
    flags.apply &&
    !flags.skipInstall &&
    generation.data.dependencies.length
  ) {
    requireNativeInstaller();
  }
  const recovered = flags.resume ? recoverGeneration(options.cwd) : false;
  adaptNextGeneration(generation.data, options.cwd);
  adaptNuxtGeneration(generation.data, options.cwd);
  adaptReactGeneration(generation.data, options.cwd);
  adaptSvelteKitGeneration(generation.data, options.cwd);
  const plan = planGeneration(options.cwd, generation.data);
  addNextConfigInstructions(plan, generation.data);
  missingInsertInstructions(plan, generation.data);
  environmentInstructions(plan, generation.data);
  options.signal?.throwIfAborted();
  const created = flags.apply ? applyGeneration(plan) : [];
  let installed = false;
  if (flags.apply && !flags.skipInstall && options.packageManager) {
    await installAppliedPlan(
      plan,
      created,
      options.packageManager,
      options.signal
    );
    installed = true;
  }
  return {
    applied: flags.apply,
    command: generation.command,
    created,
    installed,
    plan,
    recovered,
  };
};
