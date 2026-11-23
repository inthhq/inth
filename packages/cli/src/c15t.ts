import type { HostedProject } from "../vendor/inth-setup/frontend/projects.ts";
import type { PackageManager } from "../vendor/inth-setup/frontend/runtime/install.ts";
import { boilerplateFrameworks } from "../vendor/inth-setup/generate/index.ts";
import type { BoilerplateFramework } from "../vendor/inth-setup/generate/index.ts";
import type { CliArguments } from "./arguments.ts";
import { CliError } from "./cli-error.ts";

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

export interface SetupOptions {
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

// `inth init` sets up the Inth SDK; `inth c15t` sets up c15t.
export type SetupCommand = "c15t" | "init";

export interface SetupProduct {
  command: SetupCommand;
  // What setup installs, as messages name it.
  name: string;
  // Branding for a project setup creates.
  branding: string;
  // npm specifier the scaffold installs the @inth packages from. Unset keeps
  // the generator's release line.
  inthRelease?: string;
}

export const SETUP_PRODUCTS: Record<SetupCommand, SetupProduct> = {
  c15t: { branding: "c15t", command: "c15t", name: "c15t" },
  init: {
    branding: "inth",
    command: "init",
    inthRelease: "latest",
    name: "Inth",
  },
};

const setupUsage = (command: SetupCommand): string =>
  `Usage: inth ${command} [scaffold|prompt|--codex|--claude|--cursor|--grok|--fx] [--project <id|name>] [--name <name> --region <id>] [--framework <name>] [--organization <id>] [--yes] [--dry-run] [--skip-install] [--resume] [--json]`;

export const C15T_USAGE = setupUsage("c15t");
export const INIT_USAGE = setupUsage("init");

const setupHelp = (
  command: SetupCommand,
  summary: string,
  extraActions: string[]
): string => {
  const { name } = SETUP_PRODUCTS[command];
  return [
    summary,
    "",
    setupUsage(command),
    "",
    `Recommended: use a coding agent to adapt ${name} to this app and verify consent in a browser.`,
    "If your agent is not installed here, use prompt and paste the output into it.",
    "",
    "Actions:",
    "  --codex, --claude, --cursor, --grok, --fx",
    `            Start that coding agent here with the ${name} setup prompt`,
    "  prompt    Print the setup prompt for any other agent",
    `  scaffold  Write framework quickstart files and install ${command === "init" ? "the latest Inth" : "c15t v3"} packages`,
    ...extraActions,
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
};

export const c15tHelp = (): string =>
  setupHelp(
    "c15t",
    "Set up c15t v3 consent management in the current application.",
    ["  codemods  Rewrite c15t v2 source for v3; needs no sign-in"]
  );

export const initHelp = (): string =>
  setupHelp(
    "init",
    "Set up the Inth SDK for consent management in the current application.",
    []
  );

const VALUE_OPTIONS = new Set([
  "project",
  "name",
  "region",
  "framework",
  "organization",
  "token",
]);

/** Whether `arg` is a setup option whose value is the next argument. */
export const setupOptionTakesValue = (arg: string): boolean =>
  arg.startsWith("--") && VALUE_OPTIONS.has(arg.slice(2));

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
  setup: SetupOptions,
  option: string,
  value: string
): void => {
  if (!value || value.startsWith("--")) {
    throw new CliError("usage_error", `Provide a value for --${option}.`);
  }
  const seen =
    (option === "project" && setup.project !== undefined) ||
    (option === "name" && setup.name !== undefined) ||
    (option === "region" && setup.region !== undefined) ||
    (option === "framework" && setup.framework !== undefined) ||
    (option === "organization" && result.organization !== undefined) ||
    (option === "token" && result.token !== undefined);
  if (seen) {
    throw new CliError("usage_error", `Use --${option} only once.`);
  }
  if (option === "project") {
    setup.project = value;
  } else if (option === "name") {
    setup.name = value;
  } else if (option === "region") {
    setup.region = value;
  } else if (option === "framework") {
    setup.framework = readFramework(value);
  } else if (option === "organization") {
    result.organization = value;
  } else {
    result.token = value;
  }
};

const validate = (setup: SetupOptions): void => {
  if (setup.project !== undefined && (setup.name || setup.region)) {
    throw new CliError(
      "usage_error",
      "Use --project for an existing project, or --name and --region to create one."
    );
  }
  if (setup.region !== undefined && setup.name === undefined) {
    throw new CliError("usage_error", "Use --region with --name.");
  }
  if (
    (setup.action === "prompt" || setup.action === "agent") &&
    (setup.dryRun || setup.skipInstall || setup.yes || setup.resume)
  ) {
    throw new CliError(
      "usage_error",
      "--yes, --dry-run, --skip-install, and --resume apply to scaffold."
    );
  }
  if (setup.resume && setup.dryRun) {
    throw new CliError(
      "usage_error",
      "--resume removes files, so it cannot be combined with --dry-run."
    );
  }
};

const setAction = (setup: SetupOptions, action: string, agent = ""): void => {
  if (setup.action) {
    throw new CliError(
      "usage_error",
      "Choose one of scaffold, prompt, --codex, --claude, --cursor, --grok, or --fx."
    );
  }
  setup.action = action;
  if (agent) {
    setup.agent = agent;
  }
};

// Scaffold switches. Returns whether `arg` was one.
const setScaffoldFlag = (setup: SetupOptions, arg: string): boolean => {
  if (arg === "--yes" || arg === "-y") {
    setup.yes = true;
  } else if (arg === "--dry-run") {
    setup.dryRun = true;
  } else if (arg === "--skip-install") {
    setup.skipInstall = true;
  } else if (arg === "--resume") {
    setup.resume = true;
  } else {
    return false;
  }
  return true;
};

// The scaffold-only flags choose scaffold, so a dry run never starts an
// agent from the picker.
const impliedScaffold = (setup: SetupOptions): void => {
  if (
    !setup.action &&
    (setup.dryRun || setup.yes || setup.skipInstall || setup.resume)
  ) {
    setup.action = "scaffold";
  }
};

// Parses everything after `c15t` or `init`, including the shared flags the
// main parser would otherwise consume.
export const parseSetupArguments = (
  result: CliArguments,
  args: string[],
  command: SetupCommand
): SetupOptions => {
  const setup: SetupOptions = {
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
    } else if (setScaffoldFlag(setup, arg)) {
      continue;
    } else if (CODING_AGENTS.some((agent) => arg === `--${agent.id}`)) {
      setAction(setup, "agent", arg.slice(2));
    } else if (arg.startsWith("--")) {
      const equals = arg.indexOf("=");
      const option = (equals === -1 ? arg : arg.slice(0, equals)).slice(2);
      if (!VALUE_OPTIONS.has(option)) {
        throw new CliError(
          "usage_error",
          `Unknown option "--${option}". Run inth ${command} --help.`
        );
      }
      if (equals === -1) {
        index += 1;
        setValue(result, setup, option, args[index] ?? "");
      } else {
        setValue(result, setup, option, arg.slice(equals + 1));
      }
    } else if (["scaffold", "prompt"].includes(arg)) {
      setAction(setup, arg);
    } else {
      throw new CliError("usage_error", setupUsage(command));
    }
  }
  impliedScaffold(setup);
  validate(setup);
  if (setup.action === "agent" && result.json) {
    throw new CliError(
      "usage_error",
      `Agent sessions use this terminal. Use inth ${command} prompt --json to export the prompt.`
    );
  }
  return setup;
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
  // Dependencies do not identify Astro's output mode. Server output is explicit.
  ["astro", "astro-static"],
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
