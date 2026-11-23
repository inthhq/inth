import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
// eslint-disable-next-line unicorn/import-style -- Scriptc requires named node:path imports.
import { basename, delimiter, dirname, join } from "node:path";

import { createInthAgentSetupPlan } from "../../vendor/inth-setup/frontend/agent/inth.ts";
import {
  requireProjectBackendURL,
  resolveProject,
} from "../../vendor/inth-setup/frontend/projects.ts";
import { recoverGeneration } from "../../vendor/inth-setup/frontend/runtime/index.ts";
import type { GenerationWorkflowResult } from "../../vendor/inth-setup/frontend/runtime/index.ts";
import { boilerplateFrameworks } from "../../vendor/inth-setup/generate/index.ts";
import type { BoilerplateFramework } from "../../vendor/inth-setup/generate/index.ts";
import type { CliArguments } from "../arguments.ts";
import {
  defaultProjectName,
  dependencyNames,
  detectFramework,
  detectPackageManager,
  CODING_AGENTS,
  hostedProject,
  LOCKFILE_NAMES,
  SETUP_PRODUCTS,
} from "../c15t.ts";
import type {
  ApiProject,
  CodingAgent,
  PackageManifest,
  SetupOptions,
  SetupProduct,
} from "../c15t.ts";
import { CliError } from "../cli-error.ts";
import { chooseOrganization, terminalText } from "../organizations.ts";
import type { Organization, OrganizationUI } from "../organizations.ts";
import { printResult } from "../output.ts";
import { createAgentSetupPlan } from "./c15t-agent.ts";
import {
  publicGenerationPlan,
  runGenerationWorkflow,
} from "./c15t-generation.ts";
import type { NativeApi } from "./native-api.ts";
import { invalidResponse } from "./native-protocol.ts";
import type { NativeContext } from "./native-state.ts";
import { nativeUI } from "./native-ui.ts";

interface ProjectPage {
  success: boolean;
  data: ApiProject[];
  pagination: { hasMore: boolean; nextCursor: string | null };
}
interface ProjectDetail {
  success: boolean;
  data: ApiProject;
}
interface ProjectSelection {
  name: string;
  // Absent when the user asked for a new project.
  project?: ApiProject;
}
interface ScaffoldCheck {
  framework: BoilerplateFramework;
  // The files were already reviewed and confirmed for a new project.
  confirmed: boolean;
  // False after a dry run for a new project, which creates nothing.
  proceed: boolean;
}
interface Region {
  id: string;
  label: string;
}
interface RegionList {
  success: boolean;
  data: Region[];
}

const NEW_PROJECT = "__inth_new_project__";
// Where c15t's runtime journals an apply; see vendor/inth-setup/frontend/runtime/files.ts.
const RECOVERY_DIRECTORY = ".c15t-native-generation";
// A new project's consent backend usually provisions within a minute.
const PROVISION_ATTEMPTS = 30;
const PROVISION_INTERVAL_MS = 2000;

const choice = (id: string, name: string): Organization => ({
  id,
  name,
  role: "",
  slug: id,
});

const readManifest = (directory: string): PackageManifest | undefined => {
  const file = join(directory, "package.json");
  if (!existsSync(file)) {
    return undefined;
  }
  try {
    // SAFETY: Scriptc validates the declared package.json fields at runtime.
    return JSON.parse(readFileSync(file, "utf-8")) as PackageManifest;
  } catch {
    throw new CliError("invalid_config", "Cannot read package.json.");
  }
};

// Lockfiles in the nearest directory that has one, for monorepo apps.
const nearestLockfiles = (directory: string): string[] => {
  let current = directory;
  for (;;) {
    const found: string[] = [];
    for (const name of LOCKFILE_NAMES) {
      if (existsSync(join(current, name))) {
        found.push(name);
      }
    }
    const parent = dirname(current);
    if (found.length || parent === current) {
      return found;
    }
    current = parent;
  }
};

const pagesRouter = (directory: string): boolean =>
  !existsSync(join(directory, "app")) &&
  !existsSync(join(directory, "src", "app")) &&
  (existsSync(join(directory, "pages")) ||
    existsSync(join(directory, "src", "pages")));

// Agents on PATH. Launching is macOS and Linux only, like c15t's own launcher.
const installedAgents = (): CodingAgent[] => {
  if (process.platform === "win32") {
    return [];
  }
  const directories = (process.env.PATH ?? "").split(delimiter);
  return CODING_AGENTS.filter((agent) =>
    directories.some(
      (directory) => directory && existsSync(join(directory, agent.command))
    )
  );
};

const launchAgent = async (
  agent: CodingAgent,
  prompt: string,
  cwd: string,
  signal: AbortSignal
): Promise<number> => {
  signal.throwIfAborted();
  // eslint-disable-next-line promise/avoid-new -- Adapt Scriptc child process events to the async command contract.
  return await new Promise<number>((resolve, reject) => {
    const child = spawn(agent.command, [...agent.args, prompt], {
      cwd,
      stdio: "inherit",
    });
    const cancel = (): void => {
      child.kill("SIGTERM");
    };
    signal.addEventListener("abort", cancel);
    child.on("error", () => {
      signal.removeEventListener("abort", cancel);
      reject(
        new CliError(
          "command_failed",
          `Cannot start ${agent.name}. Check that ${agent.command} runs in this terminal.`
        )
      );
    });
    child.on("exit", (code: number | null) => {
      signal.removeEventListener("abort", cancel);
      if (signal.aborted) {
        reject(
          new CliError(
            "cancelled",
            `${agent.name} stopped. Review any changes it made.`
          )
        );
      } else {
        resolve(code ?? 1);
      }
    });
  });
};

const sleep = async (ms: number, signal: AbortSignal): Promise<void> => {
  signal.throwIfAborted();
  // eslint-disable-next-line promise/avoid-new -- Scriptc timers have no promise API.
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
  signal.throwIfAborted();
};

const planText = (result: GenerationWorkflowResult): string => {
  const lines = [`Files in ${result.plan.root}:`];
  for (const file of result.plan.files) {
    lines.push(`  ${file.path}${file.exists ? " (unchanged)" : ""}`);
  }
  lines.push(`Packages: ${result.plan.dependencies.join(" ")}`);
  return lines.join("\n");
};

// Scriptc classes cannot hold an AbortSignal, so the signal stays in closures.
interface SetupTerminal {
  organizations: OrganizationUI;
  ui: (title: string) => OrganizationUI;
  wait: (ms: number) => Promise<void>;
}

class Setup {
  private readonly options: CliArguments;
  private readonly setup: SetupOptions;
  private readonly product: SetupProduct;
  private readonly api: NativeApi;
  private readonly terminal: SetupTerminal;
  private readonly interactive: boolean;
  constructor(
    options: CliArguments,
    setup: SetupOptions,
    product: SetupProduct,
    api: NativeApi,
    terminal: SetupTerminal
  ) {
    this.options = options;
    this.setup = setup;
    this.product = product;
    this.api = api;
    this.terminal = terminal;
    this.interactive = terminal.ui("").interactive;
  }

  select(title: string, choices: Organization[]): Promise<string> {
    return this.terminal.ui(title).select(choices);
  }

  async organization(context: NativeContext): Promise<string> {
    const selected = await context.resolve(this.options.organization);
    if (selected) {
      return selected;
    }
    return chooseOrganization(
      await this.api.organizations(),
      undefined,
      undefined,
      this.terminal.organizations
    );
  }

  async projects(organization: string): Promise<ApiProject[]> {
    const projects: ApiProject[] = [];
    const cursors: string[] = [];
    let cursor = "";
    for (let page = 0; page < 100; page += 1) {
      const query = new URLSearchParams({ limit: "100" });
      if (cursor) {
        query.set("cursor", cursor);
      }
      // eslint-disable-next-line no-await-in-loop -- Each page needs the previous cursor.
      const response = await this.api.execute(
        `/v1/projects?${query.toString()}`,
        "GET",
        undefined,
        organization
      );
      let value: ProjectPage;
      try {
        // SAFETY: Scriptc validates the page record and each project at runtime.
        value = JSON.parse(response.body) as ProjectPage;
      } catch {
        throw invalidResponse(response, "Invalid project list response.");
      }
      for (const project of value.data) {
        projects.push(project);
      }
      const next = value.pagination.nextCursor ?? "";
      if (!value.pagination.hasMore) {
        return projects;
      }
      if (!next || cursors.includes(next)) {
        break;
      }
      cursors.push(next);
      cursor = next;
    }
    throw new CliError(
      "invalid_response",
      "Invalid project pagination cursor."
    );
  }

  async project(id: string): Promise<ApiProject> {
    const response = await this.api.execute(
      `/v1/projects/${encodeURIComponent(id)}`,
      "GET"
    );
    try {
      // SAFETY: Scriptc validates the project record at runtime.
      return (JSON.parse(response.body) as ProjectDetail).data;
    } catch {
      throw invalidResponse(response, "Invalid project response.");
    }
  }

  async region(): Promise<string> {
    if (this.setup.region) {
      return this.setup.region;
    }
    const response = await this.api.execute("/v1/regions", "GET");
    let regions: Region[];
    try {
      // SAFETY: Scriptc validates each region record at runtime.
      regions = (JSON.parse(response.body) as RegionList).data;
    } catch {
      throw invalidResponse(response, "Invalid region response.");
    }
    const [only] = regions;
    if (regions.length === 1 && only) {
      return only.id;
    }
    if (!this.interactive || regions.length === 0) {
      throw new CliError(
        "interaction_required",
        "Choose a region with --region <id>. Run inth region list to see them."
      );
    }
    return this.select(
      "Choose a region for the project",
      regions.map((region) => choice(region.id, region.label))
    );
  }

  async create(organization: string, name: string): Promise<ApiProject> {
    const region = await this.region();
    const response = await this.api.execute(
      "/v1/projects",
      "POST",
      // The project API nests branding under consent, like inth project create.
      JSON.stringify({
        consent: { branding: this.product.branding },
        name,
        region,
      }),
      organization
    );
    let created: ApiProject;
    try {
      // SAFETY: Scriptc validates the project record at runtime.
      created = (JSON.parse(response.body) as ProjectDetail).data;
    } catch {
      throw invalidResponse(response, "Invalid project response.");
    }
    console.error(`Created project ${terminalText(created.name)}.`);
    return created;
  }

  // Picks an existing project or names a new one. Creation waits until the
  // local checks pass, so a failed setup leaves no project behind.
  async chooseProject(
    organization: string,
    manifest: PackageManifest | undefined,
    cwd: string
  ): Promise<ProjectSelection> {
    const name =
      this.setup.name ?? defaultProjectName(manifest?.name, basename(cwd));
    if (this.setup.name) {
      return { name };
    }
    const projects = await this.projects(organization);
    if (this.setup.project) {
      try {
        const match = resolveProject(
          this.setup.project,
          projects.map((project) => hostedProject(project))
        );
        const project = projects.find((entry) => entry.id === match.id);
        if (project) {
          return { name: project.name, project };
        }
      } catch (error) {
        throw new CliError(
          "usage_error",
          error instanceof Error ? error.message : "Project not found."
        );
      }
    }
    if (!this.interactive) {
      throw new CliError(
        "interaction_required",
        "Choose a project with --project <id|name>, or create one with --name <name>."
      );
    }
    // First, so it stays visible when the picker scrolls through many projects.
    const choices = [
      choice(NEW_PROJECT, `Create a new project named "${name}"`),
    ];
    for (const project of projects) {
      choices.push(choice(project.id, project.name));
    }
    const selected = await this.select("Choose your Inth project", choices);
    const project = projects.find((entry) => entry.id === selected);
    if (project) {
      return { name: project.name, project };
    }
    return { name };
  }

  // Wait for a new project's consent backend, then return its URL.
  async backendURL(start: ApiProject): Promise<string> {
    let project = start;
    for (let attempt = 0; !project.consent?.backendUrl; attempt += 1) {
      if (attempt >= PROVISION_ATTEMPTS) {
        throw new CliError(
          "command_failed",
          `Project ${terminalText(project.name)} is still provisioning. Retry with inth ${this.product.command} --project ${project.id} in a minute.`
        );
      }
      if (attempt === 0) {
        console.error("Waiting for the project's consent backend...");
      }
      // eslint-disable-next-line no-await-in-loop -- Poll until provisioning finishes.
      await this.terminal.wait(PROVISION_INTERVAL_MS);
      // eslint-disable-next-line no-await-in-loop -- Poll until provisioning finishes.
      project = await this.project(project.id);
    }
    return requireProjectBackendURL(hostedProject(project));
  }

  action(agents: CodingAgent[], scaffold: boolean): Promise<string> {
    if (this.setup.action) {
      return Promise.resolve(this.setup.action);
    }
    if (!this.interactive) {
      throw new CliError(
        "interaction_required",
        "Choose --codex, --claude, --cursor, --grok, --fx, scaffold, or prompt."
      );
    }
    const choices = agents.length
      ? [choice("agent", "Use a coding agent (recommended)")]
      : [];
    choices.push(
      choice(
        "prompt",
        agents.length
          ? "Show the setup prompt for another agent"
          : "Show the setup prompt for your agent (recommended)"
      )
    );
    // HTML sites can scaffold without a package manifest.
    if (scaffold) {
      choices.push(
        choice("scaffold", "Scaffold the framework quickstart files")
      );
    }
    return this.select(
      `How do you want to set up ${this.product.name}?`,
      choices
    );
  }

  async agent(agents: CodingAgent[]): Promise<CodingAgent> {
    const requested = this.setup.agent;
    if (requested) {
      const agent = CODING_AGENTS.find((entry) => entry.id === requested);
      if (process.platform === "win32") {
        throw new CliError(
          "usage_error",
          `inth cannot start coding agents on Windows yet. Run inth ${this.product.command} prompt and paste the prompt into your agent.`
        );
      }
      if (!agent || !agents.includes(agent)) {
        throw new CliError(
          "usage_error",
          `${agent?.name ?? requested} is not installed: ${agent?.command ?? requested} is not on PATH. Install it, or run inth ${this.product.command} prompt and paste the prompt into your agent.`
        );
      }
      return agent;
    }
    const selected = await this.select(
      "Pick an agent",
      agents.map((agent) => choice(agent.id, agent.name))
    );
    const agent = agents.find((entry) => entry.id === selected);
    if (!agent) {
      throw new CliError("cancelled", `${this.product.name} setup cancelled.`);
    }
    return agent;
  }

  async framework(
    detected: BoilerplateFramework | undefined
  ): Promise<BoilerplateFramework> {
    const requested = this.setup.framework ?? detected;
    if (requested) {
      return requested;
    }
    if (!this.interactive) {
      throw new CliError(
        "interaction_required",
        "No supported framework found in package.json. Use --framework <name>."
      );
    }
    const selected = await this.select(
      "Choose your framework",
      boilerplateFrameworks.map((framework) => choice(framework, framework))
    );
    const framework = boilerplateFrameworks.find((entry) => entry === selected);
    if (!framework) {
      throw new CliError("cancelled", `${this.product.name} setup cancelled.`);
    }
    return framework;
  }

  // An interrupted apply blocks every later plan until it is undone.
  async recover(cwd: string): Promise<void> {
    if (!existsSync(join(cwd, RECOVERY_DIRECTORY))) {
      return;
    }
    if (!this.setup.resume) {
      const { command } = this.product;
      const message = `An earlier inth ${command} scaffold in this app was interrupted. Run inth ${command} scaffold --resume to undo its partial files and try again.`;
      if (!this.interactive || this.setup.dryRun) {
        throw new CliError("interaction_required", message);
      }
      const selected = await this.select(
        `An earlier ${this.product.name} setup in this app was interrupted`,
        [
          choice("resume", "Undo its partial files and continue"),
          choice("cancel", "Cancel"),
        ]
      );
      if (selected !== "resume") {
        throw new CliError(
          "cancelled",
          `${this.product.name} setup cancelled.`
        );
      }
    }
    if (recoverGeneration(cwd)) {
      console.error(`Undid the interrupted ${this.product.name} setup.`);
    }
  }

  // Local scaffold checks, plus review and confirmation for a new project.
  async prepareScaffold(
    cwd: string,
    detected: BoilerplateFramework | undefined,
    selection: ProjectSelection,
    install: boolean,
    signal: AbortSignal
  ): Promise<ScaffoldCheck> {
    const framework = await this.framework(detected);
    await this.recover(cwd);
    if (selection.project) {
      return { confirmed: false, framework, proceed: true };
    }
    const confirmed = await this.confirmNewScaffold(
      cwd,
      framework,
      selection.name,
      install && framework !== "html",
      signal
    );
    return { confirmed, framework, proceed: confirmed };
  }

  // A new project's backend URL matches no existing file and does not change
  // the file list, so review a placeholder plan before creating the project.
  // Returns false after a dry run, when nothing should be created.
  async confirmNewScaffold(
    cwd: string,
    framework: BoilerplateFramework,
    name: string,
    install: boolean,
    signal: AbortSignal
  ): Promise<boolean> {
    const draft = await runGenerationWorkflow(
      ["setup", "--framework", framework],
      { generation: { backendURL: "https://new-project.invalid" } },
      { cwd, inthRelease: this.product.inthRelease, signal }
    );
    // Omit contents, which hold the placeholder URL.
    const files = draft.plan.files.map((file) => ({
      exists: file.exists,
      path: file.path,
    }));
    if (this.setup.dryRun) {
      printResult(
        this.options.json,
        `${planText(draft)}\nRun without --dry-run to create the project "${terminalText(name)}" and write these files.`,
        JSON.stringify({
          action: "scaffold",
          framework,
          plan: {
            dependencies: draft.plan.dependencies,
            files,
            root: draft.plan.root,
          },
          project: { backendUrl: null, id: null, name },
        })
      );
      return false;
    }
    if (!this.options.json) {
      console.error(planText(draft));
    }
    await this.confirm(files.filter((file) => !file.exists).length, install);
    return true;
  }

  async confirm(count: number, install: boolean): Promise<void> {
    if (this.setup.yes) {
      return;
    }
    if (!this.interactive) {
      throw new CliError(
        "interaction_required",
        "Use --yes to write files without confirming, or --dry-run to preview them."
      );
    }
    const packages = install ? " and install packages" : "";
    const selected = await this.select("Write these files?", [
      choice("write", `Create ${count} files${packages}`),
      choice("cancel", "Cancel"),
    ]);
    if (selected !== "write") {
      throw new CliError("cancelled", `${this.product.name} setup cancelled.`);
    }
  }
}

const requireManifest = (
  manifest: PackageManifest | undefined,
  product: SetupProduct
): PackageManifest => {
  if (!manifest) {
    throw new CliError(
      "usage_error",
      `Run inth ${product.command} scaffold from the app directory that contains package.json.`
    );
  }
  return manifest;
};

const scaffoldFramework = (
  manifest: PackageManifest | undefined,
  cwd: string
): BoilerplateFramework | undefined => {
  if (manifest) {
    return detectFramework(dependencyNames(manifest), pagesRouter(cwd));
  }
  return existsSync(join(cwd, "index.html")) ? "html" : undefined;
};

const canScaffold = (
  manifest: PackageManifest | undefined,
  framework: BoilerplateFramework | undefined
): boolean => Boolean(manifest) || framework === "html";

const requireScaffoldApp = (
  manifest: PackageManifest | undefined,
  framework: BoilerplateFramework | undefined,
  product: SetupProduct
): void => {
  if (framework !== "html") {
    requireManifest(manifest, product);
  }
};

const shouldInstall = (skip: boolean, dependencies: string[]): boolean =>
  !skip && dependencies.length > 0;

const resultText = (
  result: GenerationWorkflowResult,
  manager: string,
  product: SetupProduct
): string => {
  const lines = [
    result.created.length
      ? `Created ${result.created.length} files.`
      : `The ${product.name} files are already in place.`,
  ];
  if (result.installed) {
    lines.push(`Installed ${product.name} packages with ${manager}.`);
  } else if (result.plan.dependencies.length) {
    lines.push(`Install the packages: ${result.plan.dependencies.join(" ")}`);
  }
  lines.push("", "Next steps:");
  for (const instruction of result.plan.instructions) {
    lines.push(`- ${instruction}`);
  }
  return lines.join("\n");
};

const startAgent = async (
  agent: CodingAgent,
  prompt: string,
  cwd: string,
  project: string,
  product: SetupProduct,
  signal: AbortSignal
): Promise<void> => {
  console.error(
    `Starting ${agent.name} in ${cwd} to set up ${product.name} for ${terminalText(project)}.`
  );
  const status = await launchAgent(agent, prompt, cwd, signal);
  if (status !== 0) {
    throw new CliError(
      "command_failed",
      `${agent.name} exited with status ${status}. Review any changes it made.`
    );
  }
  const resume = agent.resume
    ? ` Continue the conversation with ${agent.resume}.`
    : "";
  console.log(
    `${agent.name} finished. Review its changes before you commit.${resume}`
  );
};

const requireSetupOptions = (
  options: CliArguments,
  product: SetupProduct
): SetupOptions => {
  if (!options.setup) {
    throw new CliError("usage_error", `Run inth ${product.command} --help.`);
  }
  return options.setup;
};

// `inth init` asks the agent for the Inth SDK; `inth c15t` for c15t.
const agentSetupPlan = (
  product: SetupProduct,
  projectUrl: string,
  framework: BoilerplateFramework | undefined
): { prompt: string } =>
  product.command === "init"
    ? createInthAgentSetupPlan({ framework, projectUrl })
    : createAgentSetupPlan({
        backendURL: projectUrl,
        framework,
        mode: "hosted",
      });

/** Run `inth init` or `inth c15t`, as `options.command` names. */
export const runSetup = async (
  options: CliArguments,
  api: NativeApi,
  context: NativeContext,
  signal: AbortSignal,
  allowInteractive: boolean
): Promise<void> => {
  const product = SETUP_PRODUCTS[options.command === "init" ? "init" : "c15t"];
  const flags = requireSetupOptions(options, product);
  const setup = new Setup(options, flags, product, api, {
    organizations: nativeUI(signal, allowInteractive),
    ui: (title) =>
      nativeUI(signal, allowInteractive, title, false, `${product.name} setup`),
    wait: (ms) => sleep(ms, signal),
  });
  const cwd = process.cwd();
  const manifest = readManifest(cwd);
  const detected = flags.framework ?? scaffoldFramework(manifest, cwd);
  const agents = installedAgents();
  const organization = await setup.organization(context);
  const selection = await setup.chooseProject(organization, manifest, cwd);
  const action = await setup.action(agents, canScaffold(manifest, detected));
  // The installer refuses Windows, so write the files and print the command.
  const skipInstall = flags.skipInstall || process.platform === "win32";
  // Check and confirm everything local before creating a project.
  const requestedAgent =
    action === "agent" ? await setup.agent(agents) : undefined;
  let scaffold: ScaffoldCheck | undefined;
  if (action === "scaffold") {
    requireScaffoldApp(manifest, detected, product);
    scaffold = await setup.prepareScaffold(
      cwd,
      detected,
      selection,
      !skipInstall,
      signal
    );
    if (!scaffold.proceed) {
      return;
    }
  }
  const project =
    selection.project ?? (await setup.create(organization, selection.name));
  const backendURL = await setup.backendURL(project);
  const summary = {
    backendUrl: backendURL,
    id: project.id,
    name: project.name,
  };
  if (action === "agent" || action === "prompt") {
    const plan = agentSetupPlan(product, backendURL, detected);
    if (action === "agent") {
      await startAgent(
        requestedAgent ?? (await setup.agent(agents)),
        plan.prompt,
        cwd,
        project.name,
        product,
        signal
      );
      return;
    }
    printResult(
      options.json,
      plan.prompt,
      JSON.stringify({ action, project: summary, prompt: plan.prompt })
    );
    return;
  }
  const framework = scaffold?.framework ?? (await setup.framework(detected));
  const manager = detectPackageManager(
    manifest?.packageManager,
    nearestLockfiles(cwd)
  );
  const args = ["setup", "--framework", framework];
  const generation = { generation: { backendURL } };
  await setup.recover(cwd);
  const preview = await runGenerationWorkflow(args, generation, {
    cwd,
    inthRelease: product.inthRelease,
    signal,
  });
  const pending = preview.plan.files.filter((file) => !file.exists).length;
  if (flags.dryRun) {
    printResult(
      options.json,
      planText(preview),
      JSON.stringify({
        action,
        framework,
        plan: publicGenerationPlan(preview.plan),
        project: summary,
      })
    );
    return;
  }
  if (!scaffold?.confirmed) {
    if (!options.json) {
      console.error(planText(preview));
    }
    await setup.confirm(
      pending,
      shouldInstall(skipInstall, preview.plan.dependencies)
    );
  }
  args.push("--apply");
  if (skipInstall) {
    args.push("--skip-install");
  }
  const result = await runGenerationWorkflow(args, generation, {
    cwd,
    inthRelease: product.inthRelease,
    packageManager: manager,
    signal,
  });
  printResult(
    options.json,
    resultText(result, manager, product),
    JSON.stringify({
      action,
      created: result.created,
      framework,
      installed: result.installed,
      packageManager: manager,
      plan: publicGenerationPlan(result.plan),
      project: summary,
    })
  );
};
