// `inth c15t`: set up c15t v3 in the current application. Experimental and
// hidden until v3 is released; INTH_EXPERIMENTAL_C15T=1 enables it.
import type { HostedProject } from "../vendor/c15t/frontend/projects.ts";
import type { PackageManager } from "../vendor/c15t/frontend/runtime/install.ts";
import { boilerplateFrameworks } from "../vendor/c15t/generate/index.ts";
import type { BoilerplateFramework } from "../vendor/c15t/generate/index.ts";
import type { CliArguments } from "./arguments.ts";
import { CliError } from "./cli-error.ts";

export const c15tEnabled = (value: string | undefined): boolean =>
  value === "1" || value === "true";

// Coding agents inth can start with the setup prompt as their last argument.
export interface CodingAgent {
  // Also the flag that selects it, such as --codex.
  id: string;
  name: string;
  command: string;
  // Arguments before the prompt.
  args: string[];
  // How to keep talking to the agent after a one-shot run.
  resume?: string;
}
export const CODING_AGENTS: CodingAgent[] = [
  { args: [], command: "codex", id: "codex", name: "Codex" },
  { args: [], command: "claude", id: "claude", name: "Claude Code" },
  { args: [], command: "cursor-agent", id: "cursor", name: "Cursor" },
  { args: [], command: "grok", id: "grok", name: "Grok" },
  // fx sessions take no initial prompt, so run one request and resume it.
  { args: ["ask"], command: "fx", id: "fx", name: "fx", resume: "fx -c" },
];

export interface C15tOptions {
  // "agent", "scaffold", "prompt", or "" to choose interactively.
  action: string;
  // A CODING_AGENTS id when an agent flag was given.
  agent?: string;
  project?: string;
  name?: string;
  region?: string;
  framework?: BoilerplateFramework;
  skipInstall: boolean;
  dryRun: boolean;
  // Undo an interrupted scaffold before writing again.
  resume: boolean;
  yes: boolean;
}

export const C15T_USAGE =
  "Usage: inth c15t [scaffold|prompt|--codex|--claude|--cursor|--grok|--fx] [--project <id|name>] [--name <name> --region <id>] [--framework <name>] [--organization <id>] [--yes] [--dry-run] [--skip-install] [--resume] [--json]";

export const c15tHelp = (): string =>
  [
    "Set up c15t v3 consent management in the current application (experimental).",
    "",
    C15T_USAGE,
    "",
    "Actions:",
    "  --codex, --claude, --cursor, --grok, --fx",
    "            Start that coding agent here with the c15t setup prompt",
    "  scaffold  Write c15t files into this app and install its packages",
    "  prompt    Print the setup prompt for any other agent",
    "",
    "Options:",
    "  --project <id|name>    Use an existing project (ID, name, or organization/name)",
    "  --name <name>          Create a project with this name",
    "  --region <id>          Region for a new project (see inth region list)",
    `  --framework <name>     ${boilerplateFrameworks.join(", ")}`,
    "  --organization <id>    Organization to list or create projects in",
    "  --yes                  Write files without confirming",
    "  --dry-run              Show the files scaffold would write",
    "  --skip-install         Write files without installing packages",
    "  --resume               Undo an interrupted scaffold, then write again",
    "  --json                 Print the result as JSON",
    "",
    "Without an action or project, inth asks in the terminal.",
  ].join("\n");

const VALUE_OPTIONS = new Set([
  "project",
  "name",
  "region",
  "framework",
  "organization",
  "token",
]);

const readFramework = (value: string): BoilerplateFramework => {
  const framework = boilerplateFrameworks.find((entry) => entry === value);
  if (!framework) {
    throw new CliError(
      "usage_error",
      `--framework must be one of: ${boilerplateFrameworks.join(", ")}.`
    );
  }
  return framework;
};

const setValue = (
  result: CliArguments,
  c15t: C15tOptions,
  option: string,
  value: string
): void => {
  if (!value || value.startsWith("--")) {
    throw new CliError("usage_error", `Provide a value for --${option}.`);
  }
  const seen =
    (option === "project" && c15t.project !== undefined) ||
    (option === "name" && c15t.name !== undefined) ||
    (option === "region" && c15t.region !== undefined) ||
    (option === "framework" && c15t.framework !== undefined) ||
    (option === "organization" && result.organization !== undefined) ||
    (option === "token" && result.token !== undefined);
  if (seen) {
    throw new CliError("usage_error", `Use --${option} only once.`);
  }
  if (option === "project") {
    c15t.project = value;
  } else if (option === "name") {
    c15t.name = value;
  } else if (option === "region") {
    c15t.region = value;
  } else if (option === "framework") {
    c15t.framework = readFramework(value);
  } else if (option === "organization") {
    result.organization = value;
  } else {
    result.token = value;
  }
};

const validate = (c15t: C15tOptions): void => {
  if (c15t.project !== undefined && (c15t.name || c15t.region)) {
    throw new CliError(
      "usage_error",
      "Use --project for an existing project, or --name and --region to create one."
    );
  }
  if (c15t.region !== undefined && c15t.name === undefined) {
    throw new CliError("usage_error", "Use --region with --name.");
  }
  if (
    (c15t.action === "prompt" || c15t.action === "agent") &&
    (c15t.dryRun || c15t.skipInstall || c15t.yes || c15t.resume)
  ) {
    throw new CliError(
      "usage_error",
      "--yes, --dry-run, --skip-install, and --resume apply to scaffold."
    );
  }
  if (c15t.resume && c15t.dryRun) {
    throw new CliError(
      "usage_error",
      "--resume removes files, so it cannot be combined with --dry-run."
    );
  }
};

const setAction = (c15t: C15tOptions, action: string, agent = ""): void => {
  if (c15t.action) {
    throw new CliError(
      "usage_error",
      "Choose one of scaffold, prompt, --codex, --claude, --cursor, --grok, or --fx."
    );
  }
  c15t.action = action;
  if (agent) {
    c15t.agent = agent;
  }
};

// Scaffold switches. Returns whether `arg` was one.
const setScaffoldFlag = (c15t: C15tOptions, arg: string): boolean => {
  if (arg === "--yes" || arg === "-y") {
    c15t.yes = true;
  } else if (arg === "--dry-run") {
    c15t.dryRun = true;
  } else if (arg === "--skip-install") {
    c15t.skipInstall = true;
  } else if (arg === "--resume") {
    c15t.resume = true;
  } else {
    return false;
  }
  return true;
};

// Parses everything after `c15t`, including the shared flags the main parser
// would otherwise consume.
export const parseC15tArguments = (
  result: CliArguments,
  args: string[]
): C15tOptions => {
  const c15t: C15tOptions = {
    action: "",
    dryRun: false,
    resume: false,
    skipInstall: false,
    yes: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if (arg === "--json") {
      result.json = true;
    } else if (arg === "--non-interactive") {
      result.nonInteractive = true;
    } else if (setScaffoldFlag(c15t, arg)) {
      continue;
    } else if (CODING_AGENTS.some((agent) => arg === `--${agent.id}`)) {
      setAction(c15t, "agent", arg.slice(2));
    } else if (arg.startsWith("--")) {
      const equals = arg.indexOf("=");
      const option = (equals === -1 ? arg : arg.slice(0, equals)).slice(2);
      if (!VALUE_OPTIONS.has(option)) {
        throw new CliError(
          "usage_error",
          `Unknown option "--${option}". Run inth c15t --help.`
        );
      }
      if (equals === -1) {
        index += 1;
        setValue(result, c15t, option, args[index] ?? "");
      } else {
        setValue(result, c15t, option, arg.slice(equals + 1));
      }
    } else if (["scaffold", "prompt"].includes(arg)) {
      setAction(c15t, arg);
    } else {
      throw new CliError("usage_error", C15T_USAGE);
    }
  }
  validate(c15t);
  if (c15t.action === "agent" && result.json) {
    throw new CliError(
      "usage_error",
      "Agent sessions use this terminal. Use inth c15t prompt --json to export the prompt."
    );
  }
  return c15t;
};

export interface PackageManifest {
  name?: string;
  packageManager?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export const dependencyNames = (manifest: PackageManifest): string[] => {
  const names = Object.keys(manifest.dependencies ?? {});
  for (const name of Object.keys(manifest.devDependencies ?? {})) {
    names.push(name);
  }
  return names;
};

// Most specific first: meta-frameworks also depend on their UI library.
const FRAMEWORK_PACKAGES = [
  ["@tanstack/react-start", "tanstack-start"],
  ["next", "next"],
  ["nuxt", "nuxt"],
  ["@sveltejs/kit", "sveltekit"],
  ["astro", "astro"],
  ["svelte", "svelte"],
  ["solid-js", "solid"],
  ["vue", "vue"],
  ["react", "react"],
];

/**
 * Pick the boilerplate target from the app's dependencies.
 * @param dependencies Package names from package.json.
 * @param pagesRouter Whether a Next.js app has a pages directory and no app directory.
 * @returns The target, or undefined when no supported framework is installed.
 */
export const detectFramework = (
  dependencies: string[],
  pagesRouter: boolean
): BoilerplateFramework | undefined => {
  for (const [name, target] of FRAMEWORK_PACKAGES) {
    if (name && dependencies.includes(name)) {
      if (target === "next") {
        return pagesRouter ? "next-pages" : "next-app";
      }
      return boilerplateFrameworks.find((entry) => entry === target);
    }
  }
  return undefined;
};

const LOCKFILES = [
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["package-lock.json", "npm"],
];

const packageManager = (name: string): PackageManager | undefined => {
  if (name === "npm" || name === "pnpm" || name === "yarn" || name === "bun") {
    return name;
  }
  return undefined;
};

/**
 * Choose the app's package manager.
 * @param declared The package.json packageManager field, such as pnpm@11.0.0.
 * @param lockfiles Lockfile names in the nearest directory that has one.
 * @returns The declared manager, else the lockfile's, else npm.
 */
export const detectPackageManager = (
  declared: string | undefined,
  lockfiles: string[]
): PackageManager => {
  const fromField = packageManager((declared ?? "").split("@")[0] ?? "");
  if (fromField) {
    return fromField;
  }
  for (const [file, name] of LOCKFILES) {
    const manager = packageManager(name ?? "");
    if (file && manager && lockfiles.includes(file)) {
      return manager;
    }
  }
  return "npm";
};

export const LOCKFILE_NAMES = LOCKFILES.map((entry) => entry[0] ?? "");

// A project as returned by GET /v1/projects. Extra fields are ignored.
export interface ApiProject {
  id: string;
  name: string;
  organizationSlug?: string | null;
  consent?: { backendUrl: string | null } | null;
}

export const hostedProject = (project: ApiProject): HostedProject => {
  const url = project.consent?.backendUrl ?? "";
  return {
    id: project.id,
    name: project.name,
    organizationSlug: project.organizationSlug ?? undefined,
    status: url ? "active" : "pending",
    url,
  };
};

/**
 * Name a new project after the app.
 * @param packageName The package.json name, if any.
 * @param directory The app directory's base name.
 * @returns The unscoped package name, or the directory name.
 */
export const defaultProjectName = (
  packageName: string | undefined,
  directory: string
): string => {
  const name = (packageName ?? "").split("/").pop() ?? "";
  return name || directory || "website";
};
