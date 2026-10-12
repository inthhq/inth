import { runFrontendCommand } from "../../vendor/c15t/frontend/index.ts";
import type { FrontendCommandContext } from "../../vendor/c15t/frontend/index.ts";
import {
  parseGenerationWorkflowArguments,
  runGenerationWorkflow as upstreamGenerationWorkflow,
} from "../../vendor/c15t/frontend/runtime/index.ts";
import type {
  GenerationRuntimeOptions,
  GenerationWorkflowResult,
} from "../../vendor/c15t/frontend/runtime/index.ts";
import { mergeFile } from "../../vendor/c15t/generate/merge.ts";

// Upstream 3.0.0 prints every insert when an existing file needs any insert.
// Keep its runtime and sources intact, but show only the snippets still missing.
export const runGenerationWorkflow = async (
  args: string[],
  context: FrontendCommandContext,
  options: GenerationRuntimeOptions
): Promise<GenerationWorkflowResult> => {
  const result = await upstreamGenerationWorkflow(args, context, options);
  const flags = parseGenerationWorkflowArguments(args);
  const generation = runFrontendCommand(flags.forwarded, context);
  if (generation.command !== "setup" && generation.command !== "generate") {
    return result;
  }
  for (const file of result.plan.files) {
    const merge = generation.data.merge?.[file.path];
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
    result.plan.instructions = result.plan.instructions.map((instruction) =>
      instruction.startsWith(prefix)
        ? `${prefix}${snippets.join("\n")}`
        : instruction
    );
  }
  return result;
};
