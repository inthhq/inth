import {
  closeSync,
  constants,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  rmdirSync,
  unlinkSync,
  writeSync,
} from "node:fs";
// eslint-disable-next-line unicorn/import-style -- Scriptc requires named node:path imports.
import { join } from "node:path";

import { runFrontendCommand } from "../../vendor/c15t/frontend/index.ts";
import type { FrontendCommandContext } from "../../vendor/c15t/frontend/index.ts";
import {
  parseGenerationWorkflowArguments,
  recoverGeneration,
} from "../../vendor/c15t/frontend/runtime/index.ts";
import type {
  GenerationRuntimeOptions,
  GenerationWorkflowResult,
} from "../../vendor/c15t/frontend/runtime/index.ts";
import type { GenerationPlan } from "../../vendor/c15t/generate/index.ts";
import { mergeFile } from "../../vendor/c15t/generate/merge.ts";

const entryOrNull = (path: string) => {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("ENOENT:")) {
      return null;
    }
    throw error;
  }
};

const writeExclusive = (path: string, content: string, mode: number): void => {
  const descriptor = openSync(
    path,
    // eslint-disable-next-line no-bitwise -- Scriptc requires inline exclusive-open flags.
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
    mode
  );
  try {
    const bytes = new TextEncoder().encode(content);
    let offset = 0;
    while (offset < bytes.length) {
      const written = writeSync(
        descriptor,
        bytes,
        offset,
        bytes.length - offset
      );
      if (written <= 0) {
        throw new Error("Could not finish writing the HTML scaffold.");
      }
      offset += written;
    }
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
};

const htmlInstructions = (
  current: string | null,
  generation: GenerationPlan
): string[] => {
  const instructions = [...generation.instructions];
  const merge = generation.merge?.["index.html"];
  if (merge?.type !== "insert") {
    throw new Error("HTML scaffolding requires insert rules.");
  }
  if (current !== null) {
    let merged = current;
    const snippets: string[] = [];
    for (const insert of merge.inserts) {
      const next = mergeFile(merged, "", {
        inserts: [insert],
        marker: merge.marker,
        type: "insert",
      });
      if (next !== merged) {
        snippets.push(`${insert.content}\n(before ${insert.before})`);
      }
      merged = next;
    }
    if (snippets.length) {
      instructions.push(`Add to index.html:\n${snippets.join("\n")}`);
    }
  }
  return instructions;
};

const htmlContent = (generation: GenerationPlan): string => {
  const names = Object.keys(generation.files);
  const content = generation.files["index.html"];
  const merge = generation.merge?.["index.html"];
  if (
    names.length !== 1 ||
    names[0] !== "index.html" ||
    !content ||
    merge?.type !== "insert" ||
    generation.dependencies.length
  ) {
    throw new Error("Manifest-free scaffolding supports the HTML target only.");
  }
  return content;
};

/** Scaffold the single HTML file without a package manager or manifest. */
export const runHtmlGenerationWorkflow = (
  args: string[],
  context: FrontendCommandContext,
  options: GenerationRuntimeOptions
): GenerationWorkflowResult => {
  options.signal?.throwIfAborted();
  const flags = parseGenerationWorkflowArguments(args);
  const generated = runFrontendCommand(flags.forwarded, context);
  if (generated.command !== "setup" && generated.command !== "generate") {
    throw new Error("HTML scaffolding requires setup or generate.");
  }
  const content = htmlContent(generated.data);
  const root = realpathSync(options.cwd);
  const recovered = flags.resume ? recoverGeneration(root) : false;
  const stage = join(root, ".c15t-native-generation");
  if (entryOrNull(stage) || entryOrNull(join(root, ".c15t-generation.json"))) {
    throw new Error(
      "An interrupted generation needs recovery before continuing."
    );
  }
  const target = join(root, "index.html");
  const entry = entryOrNull(target);
  if (entry && (!entry.isFile() || entry.isSymbolicLink())) {
    throw new Error(
      "HTML scaffolding requires a regular index.html, not a symlink."
    );
  }
  const current = entry ? readFileSync(target, "utf-8") : null;
  const instructions = htmlInstructions(current, generated.data);
  const files = [
    {
      content: current ?? content,
      exists: current !== null,
      path: "index.html",
    },
  ];
  const created: string[] = [];
  if (flags.apply && current === null) {
    options.signal?.throwIfAborted();
    // Use upstream's recovery journal format and exclusive hard-link publication.
    mkdirSync(stage, { mode: 0o700 });
    try {
      writeExclusive(
        join(stage, "journal.json"),
        JSON.stringify({ directories: [], files, root, version: 1 }),
        0o600
      );
      writeExclusive(join(stage, "0.tmp"), content, 0o644);
      linkSync(join(stage, "0.tmp"), target);
      unlinkSync(join(stage, "0.tmp"));
      unlinkSync(join(stage, "journal.json"));
      rmdirSync(stage);
      created.push("index.html");
    } catch (error) {
      recoverGeneration(root);
      throw error;
    }
  }
  return {
    applied: flags.apply,
    command: generated.command,
    created,
    installed: false,
    plan: { dependencies: [], files, instructions, root },
    recovered,
  };
};
