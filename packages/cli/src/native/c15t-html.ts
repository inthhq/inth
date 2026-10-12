import {
  closeSync,
  constants,
  fstatSync,
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

const filesystemCode = (error: Error): string | undefined => {
  // eslint-disable-next-line anti-slop/no-runtime-typeof -- Decode Node's errno at the filesystem boundary; Scriptc errors use the message prefix.
  if ("code" in error && typeof error.code === "string") {
    return error.code;
  }
  return error.message.split(":")[0];
};

const entryOrNull = (path: string) => {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error instanceof Error && filesystemCode(error) === "ENOENT") {
      return null;
    }
    throw error;
  }
};

const openExclusive = (path: string, mode: number): number =>
  openSync(
    path,
    // eslint-disable-next-line no-bitwise -- Scriptc requires inline exclusive-open flags.
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
    mode
  );

const writeAll = (descriptor: number, content: string): void => {
  const bytes = new TextEncoder().encode(content);
  let offset = 0;
  while (offset < bytes.length) {
    const written = writeSync(descriptor, bytes, offset, bytes.length - offset);
    if (written <= 0) {
      throw new Error("Could not finish writing the HTML scaffold.");
    }
    offset += written;
  }
  fsyncSync(descriptor);
};

const writeExclusive = (path: string, content: string, mode: number): void => {
  const descriptor = openExclusive(path, mode);
  try {
    writeAll(descriptor, content);
  } finally {
    closeSync(descriptor);
  }
};

/** Record an exclusive copy in the format understood by upstream recovery. */
const publishCopy = (target: string, content: string, record: string): void => {
  const descriptor = openExclusive(target, 0o644);
  const opened = fstatSync(descriptor);
  try {
    writeAll(descriptor, content);
    const created = fstatSync(descriptor);
    writeExclusive(
      record,
      JSON.stringify({
        ctimeUs: Math.round(created.ctimeMs * 1000),
        dev: created.dev,
        ino: created.ino,
        mtimeUs: Math.round(created.mtimeMs * 1000),
        size: created.size,
      }),
      0o600
    );
  } catch (error) {
    const current = entryOrNull(target);
    if (current && current.dev === opened.dev && current.ino === opened.ino) {
      unlinkSync(target);
    }
    throw error;
  } finally {
    closeSync(descriptor);
  }
};

const publishHtml = (stage: string, target: string, content: string): void => {
  try {
    linkSync(join(stage, "0.tmp"), target);
  } catch (error) {
    const code = error instanceof Error ? filesystemCode(error) : undefined;
    if (
      !code ||
      !["EXDEV", "EPERM", "ENOTSUP", "EOPNOTSUPP", "ENOSYS"].includes(code)
    ) {
      throw error;
    }
    publishCopy(target, content, join(stage, "0.copy"));
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
    // Use upstream's journal and copy identity formats for exclusive publication.
    mkdirSync(stage, { mode: 0o700 });
    try {
      writeExclusive(
        join(stage, "journal.json"),
        JSON.stringify({ directories: [], files, root, version: 1 }),
        0o600
      );
      writeExclusive(join(stage, "0.tmp"), content, 0o644);
      publishHtml(stage, target, content);
      unlinkSync(join(stage, "0.tmp"));
      if (entryOrNull(join(stage, "0.copy"))) {
        unlinkSync(join(stage, "0.copy"));
      }
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
