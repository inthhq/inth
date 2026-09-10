import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
// eslint-disable-next-line unicorn/import-style -- Scriptc requires named node:path imports.
import { join } from "node:path";

import type { CliArguments } from "./arguments.ts";
import { CliError } from "./cli-error.ts";
import { OPTION_METADATA } from "./command-metadata.ts";
import type { OrganizationUI } from "./organizations.ts";
import { printResult } from "./output.ts";
import {
  INTH_SKILLS,
  selectInthSkill,
  skillsCatalogList,
  skillsCatalogText,
} from "./skills-catalog.ts";

export const DEFAULT_SKILLS_SOURCE = "c15t/skills";

const validateSkillsOptions = (
  options: CliArguments,
  forwarded: string[]
): void => {
  if (
    options.token ||
    options.organization ||
    options.noBrowser ||
    options.values.length ||
    forwarded.some((arg) =>
      OPTION_METADATA.some(
        // --agent is shared with the upstream skills installer.
        (option) =>
          option.name !== "agent" &&
          (arg === `--${option.name}` || arg.startsWith(`--${option.name}=`))
      )
    )
  ) {
    throw new CliError(
      "usage_error",
      "Skills installation does not use Inth authentication or resource options."
    );
  }
  if (
    options.json &&
    !options.help &&
    !options.version &&
    !skillsCatalogList(options)
  ) {
    throw new CliError(
      "usage_error",
      "Skills installation uses the upstream installer's terminal output. Use --list --json to browse the Inth catalog."
    );
  }
  if (
    options.nonInteractive &&
    !options.help &&
    !options.version &&
    !forwarded.some((arg) =>
      ["--yes", "-y", "--all", "--list", "-l"].includes(arg)
    )
  ) {
    throw new CliError(
      "usage_error",
      "Use --yes with --non-interactive to confirm skills installation, or --list to preview skills."
    );
  }
};

export const parseSkillsArguments = (
  options: CliArguments,
  args: string[]
): void => {
  const forwarded: string[] = [];
  let index = args.length > 0 && args[0] === "add" ? 1 : 0;
  options.argument = DEFAULT_SKILLS_SOURCE;
  const source = index < args.length ? args[index] : undefined;
  if (source !== undefined && !source.startsWith("-")) {
    if (
      !/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/u.test(source)
    ) {
      throw new CliError(
        "usage_error",
        "Usage: inth skills [owner/repo] [options]"
      );
    }
    options.argument = source;
    options.skillsSourceExplicit = true;
    index += 1;
  }
  for (; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--version" || arg === "-v") {
      options.version = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--non-interactive") {
      options.nonInteractive = true;
    } else {
      if (arg.includes("\0")) {
        throw new CliError(
          "usage_error",
          "Skills arguments cannot contain null bytes."
        );
      }
      forwarded.push(arg);
    }
  }
  options.skillsArguments = forwarded;
  validateSkillsOptions(options, forwarded);
};

interface SkillsProcess {
  command: string;
  args: string[];
}

export const skillsProcess = (
  source: string,
  forwarded: string[],
  platform: string,
  path: string
): SkillsProcess => {
  const args = ["--yes", "skills", "add", source, ...forwarded];
  if (platform !== "win32") {
    return { args, command: "npx" };
  }
  // Execute npm's JS entry directly. Passing user arguments through cmd.exe
  // would interpret shell metacharacters, even inside some quoted arguments.
  for (const directory of path.split(";")) {
    if (!directory) {
      continue;
    }
    const entry = join(directory, "node_modules", "npm", "bin", "npx-cli.js");
    if (existsSync(entry)) {
      return { args: [entry, ...args], command: "node" };
    }
  }
  throw new CliError(
    "command_failed",
    "Cannot find npx. Install Node.js and npm, then retry inth skills."
  );
};

export const runSkills = async (
  options: CliArguments,
  signal: AbortSignal,
  ui: OrganizationUI
): Promise<number> => {
  signal.throwIfAborted();
  if (skillsCatalogList(options)) {
    printResult(
      options.json,
      skillsCatalogText(),
      JSON.stringify({ skills: INTH_SKILLS })
    );
    return 0;
  }
  await selectInthSkill(options, ui);
  signal.throwIfAborted();
  const command = skillsProcess(
    options.argument,
    options.skillsArguments ?? [],
    process.platform,
    process.env.PATH ?? ""
  );
  // eslint-disable-next-line promise/avoid-new -- Adapt Scriptc child process events to the async command contract.
  return await new Promise<number>((resolve, reject) => {
    const child = spawn(command.command, command.args, { stdio: "inherit" });
    const cancel = (): void => {
      child.kill("SIGTERM");
    };
    signal.addEventListener("abort", cancel);
    child.on("error", () => {
      signal.removeEventListener("abort", cancel);
      reject(
        new CliError(
          "command_failed",
          "Cannot start npx. Install Node.js and npm, then retry inth skills."
        )
      );
    });
    // Inherited streams need no pipe drain. Scriptc supports the exit event.
    child.on("exit", (code: number | null, childSignal: string | null) => {
      signal.removeEventListener("abort", cancel);
      if (
        signal.aborted ||
        childSignal === "SIGINT" ||
        childSignal === "SIGTERM"
      ) {
        reject(new CliError("cancelled", "Skills installation cancelled."));
      } else {
        resolve(code ?? 1);
      }
    });
  });
};
