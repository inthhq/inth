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
  const plan = planGeneration(options.cwd, generation.data);
  addNextConfigInstructions(plan, generation.data);
  missingInsertInstructions(plan, generation.data);
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
