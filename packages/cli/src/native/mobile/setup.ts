// `inth mobile setup`: configure an Expo, bare React Native, Swift or Android
// app for Inth consent. It reads and writes files in the app and nothing else,
// so it needs no sign-in, and it never prompts.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
// eslint-disable-next-line unicorn/import-style -- Scriptc requires named node:path imports.
import { dirname, join } from "node:path";

import { detectPackageManager, LOCKFILE_NAMES } from "../../c15t.ts";
import { CliError } from "../../cli-error.ts";
import type { MobileSetupArguments } from "../../mobile.ts";
import { terminalText } from "../../organizations.ts";
import { detectMobileProject } from "./detect.ts";
import type { MobileProject } from "./detect.ts";
import { isPrivacyPolicyUrl } from "./privacy-policy-url.ts";
import { normalizeProjectUrl } from "./project-url.ts";
import {
  MOBILE_CATEGORIES,
  planNativeSetup,
  planReactNativeSetup,
  providerPath,
  UNKNOWN_ROOT_COMPONENT,
} from "./scaffold.ts";
import type {
  MobileSetupOptions,
  MobileSetupPlan,
  PlannedFile,
  ProjectFiles,
} from "./scaffold.ts";

/** Categories offered when --categories is not given. */
export const DEFAULT_CATEGORIES = ["necessary", "measurement", "marketing"];

/** `data` for `inth mobile setup --json`. */
export interface MobileSetupResult {
  /** "expo", "react-native" or "native". */
  platform: string;
  /** For a native app: "ios", "android" or both. */
  platforms: string[];
  root: string;
  options: MobileSetupOptions;
  /** False for --dry-run, which writes nothing. */
  applied: boolean;
  files: PlannedFile[];
  skipped: string[];
  steps: string[];
}

/**
 * The project URL in its normal form, checked with the strict rule the Expo
 * plugin and both native cores apply.
 * @throws {CliError} usage_error when the value is missing or refused.
 */
const readBackendUrl = (value: string): string => {
  if (value.trim() === "") {
    throw new CliError(
      "usage_error",
      "Provide --backend-url https://your-project.inth.app, the project URL from your Inth dashboard."
    );
  }
  return normalizeProjectUrl(value, "--backend-url");
};

/**
 * The privacy policy the consent screens link to. Required on every platform,
 * because every presenter refuses to open without one, and checked with the
 * presenters' own rule, so plain http is refused even on a loopback host.
 */
const readPrivacyPolicyUrl = (value: string): string => {
  if (value === "") {
    throw new CliError(
      "usage_error",
      "Provide --privacy-policy-url https://your-app.example/privacy; the consent screens link to it on every platform."
    );
  }
  if (!isPrivacyPolicyUrl(value)) {
    throw new CliError(
      "usage_error",
      "--privacy-policy-url must be an https URL with a DNS host, as the iOS and Android consent screens require."
    );
  }
  return value;
};

/**
 * The categories in the native cores' order, always starting with necessary.
 * @param value A comma-separated list, or "" for the defaults.
 */
export const readCategories = (value: string): string[] => {
  const listed =
    value.trim() === ""
      ? DEFAULT_CATEGORIES
      : value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
  const unknown = listed.filter(
    (category) => !MOBILE_CATEGORIES.includes(category)
  );
  if (unknown.length > 0) {
    throw new CliError(
      "usage_error",
      `Unknown categories: ${unknown.map(terminalText).join(", ")}. Use ${MOBILE_CATEGORIES.join(", ")}.`
    );
  }
  return MOBILE_CATEGORIES.filter(
    (category) => category === "necessary" || listed.includes(category)
  );
};

/**
 * Check the setup answers.
 * @param options Parsed `inth mobile setup` arguments.
 * @returns The answers in their normal form.
 * @throws {CliError} usage_error when an answer is missing or invalid.
 */
export const resolveMobileOptions = (
  options: MobileSetupArguments
): MobileSetupOptions => ({
  backendUrl: readBackendUrl(options.backendUrl),
  categories: readCategories(options.categories),
  privacyPolicyUrl: readPrivacyPolicyUrl(options.privacyPolicyUrl),
});

const readIfExists = (file: string): string => {
  try {
    return readFileSync(file, "utf-8");
  } catch {
    return "";
  }
};

const isDirectory = (directory: string): boolean => {
  try {
    return statSync(directory).isDirectory();
  } catch {
    return false;
  }
};

const firstExisting = (root: string, candidates: string[]): string =>
  candidates.find((candidate) => existsSync(join(root, candidate))) ?? "";

const INSTALL_COMMANDS = [
  ["bun", "bun add"],
  ["npm", "npm install"],
  ["pnpm", "pnpm add"],
  ["yarn", "yarn add"],
];

/** Read what the project already has, so the plan never overwrites by accident. */
export const readProjectFiles = (project: MobileProject): ProjectFiles => {
  const { root } = project;
  const hasSrc = isDirectory(join(root, "src"));
  const expo = project.kind === "expo";
  const manager = detectPackageManager(
    project.packageManager || undefined,
    LOCKFILE_NAMES.filter((name) => existsSync(join(root, name)))
  );
  return {
    appJson: expo ? readIfExists(join(root, "app.json")) : "",
    dynamicConfig: expo
      ? firstExisting(root, [
          "app.config.ts",
          "app.config.js",
          "app.config.mjs",
          "app.config.cjs",
        ])
      : "",
    hasSrc,
    installCommand:
      INSTALL_COMMANDS.find((entry) => entry[0] === manager)?.[1] ??
      "npm install",
    providerExists: existsSync(
      join(root, providerPath(project.typescript, hasSrc))
    ),
    rootComponent:
      firstExisting(root, [
        "app/_layout.tsx",
        "app/_layout.jsx",
        "app/_layout.js",
        "src/app/_layout.tsx",
        "App.tsx",
        "App.jsx",
        "App.js",
      ]) || UNKNOWN_ROOT_COMPONENT,
  };
};

const writePlan = (root: string, plan: MobileSetupPlan): void => {
  for (const file of plan.files) {
    const target = join(root, file.path);
    try {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, file.contents);
    } catch {
      throw new CliError(
        "write_failed",
        `Could not write ${terminalText(file.path)}. Check that the project directory is writable.`
      );
    }
  }
};

/**
 * Run `inth mobile setup` in the app around `cwd`.
 * @param options Parsed `inth mobile setup` arguments.
 * @param cwd The directory the command runs in.
 * @returns The plan, the answers, and whether the files were written.
 * @throws {CliError} usage_error when no mobile app is found or an answer is
 * missing or invalid, invalid_config for an unreadable app.json, and
 * write_failed when a file cannot be written.
 */
export const runMobileSetup = (
  options: MobileSetupArguments,
  cwd: string
): MobileSetupResult => {
  const project = detectMobileProject(cwd);
  if (!project) {
    throw new CliError(
      "usage_error",
      "No Expo, React Native, Swift or Android project found here or in a parent directory. Run inth mobile setup inside the app. For a website, run inth c15t."
    );
  }
  const answers = resolveMobileOptions(options);
  const plan =
    project.kind === "native"
      ? planNativeSetup(project.platforms, answers)
      : planReactNativeSetup(
          project,
          answers,
          readProjectFiles(project),
          options.overwrite
        );
  if (!options.dryRun) {
    writePlan(project.root, plan);
  }
  return {
    applied: !options.dryRun,
    files: plan.files,
    options: answers,
    platform: project.kind,
    platforms: project.platforms,
    root: project.root,
    skipped: plan.skipped,
    steps: plan.steps,
  };
};

/** The text `inth mobile setup` prints without --json. */
export const mobileSetupMessage = (result: MobileSetupResult): string => {
  const lines = result.files.map(
    (file) => `${result.applied ? "Wrote" : "Would write"} ${file.path}`
  );
  for (const reason of result.skipped) {
    lines.push(`Skipped: ${reason}`);
  }
  lines.push(
    "",
    "Next steps:",
    result.steps.map((step, index) => `${index + 1}. ${step}`).join("\n\n")
  );
  return lines.join("\n").trimStart();
};
