/* eslint-disable no-await-in-loop -- Each codemod sees the edits of the one before it. */

// `inth c15t codemods`: the c15t v2 to v3 source codemods from @c15t/cli,
// limited to the ones a hosted app needs. It reads and writes files in the
// app and nothing else, so it needs no sign-in or Inth project.

import { access } from "node:fs/promises";
// eslint-disable-next-line unicorn/import-style -- Scriptc requires named node:path imports.
import { dirname, join } from "node:path";

import { CliError } from "../../cli-error.ts";
import { runCallbacksToV3Codemod } from "./callbacks-to-v3.ts";
import { runConsentProviderOptionsCodemod } from "./consent-provider-options.ts";
import { runCssVariablesToV3Codemod } from "./css-variables-to-v3.ts";
import { runDevToolsToC15tCodemod } from "./dev-tools-to-c15t.ts";
import { runIabOptionToIabProviderCodemod } from "./iab-option-to-iab-provider.ts";
import { runPackagesToC15tCodemod } from "./packages-to-c15t.ts";
import { runPolicyPacksToPolicyRulesCodemod } from "./policy-packs-to-policy-rules.ts";
import { runPostcssTailwind3Codemod } from "./postcss-tailwind3.ts";
import { runRootExportsToSubpathsCodemod } from "./root-exports-to-subpaths.ts";
import { createCodemodSession } from "./runner.ts";
import type { CodemodRunOptions, CodemodRunResult } from "./runner.ts";
import { runScriptsToIntegrationsCodemod } from "./scripts-to-integrations.ts";
import { runThemeToConsentThemeCodemod } from "./theme-to-consent-theme.ts";
import { runUseConsentManagerToHooksCodemod } from "./use-consent-manager-to-hooks.ts";
import {
  detectInstalledC15tVersion,
  isCodemodApplicableForVersion,
} from "./versioning.ts";
import type { CodemodVersionMetadata } from "./versioning.ts";

export interface CodemodOptions {
  /** Codemod IDs to run. They run in list order, as upstream runs them. */
  names: string[];
  dryRun: boolean;
  list: boolean;
}

interface CodemodDefinition {
  id: string;
  description: string;
  run: (options: CodemodRunOptions) => Promise<CodemodRunResult>;
  versioning?: CodemodVersionMetadata;
}

const TARGET_VERSION = "3.0.0";
const V3_VERSIONING: CodemodVersionMetadata = {
  fromRange: "<3.0.0-0",
  toRange: ">=3.0.0-0",
};

// Upstream's order and descriptions, so `--list` reads the same.
export const CODEMODS: CodemodDefinition[] = [
  {
    description:
      "Points @c15t/react and @c15t/nextjs imports at c15t/react and c15t/next, and removes their styles.css imports, which v3 components add themselves.",
    id: "packages-to-c15t",
    run: runPackagesToC15tCodemod,
    versioning: V3_VERSIONING,
  },
  {
    description:
      "Rewrites useConsentManager() destructuring to the v3 hooks and marks fields that need manual work.",
    id: "use-consent-manager-to-hooks",
    run: runUseConsentManagerToHooksCodemod,
    versioning: {
      fromRange: "<3.0.0-alpha.3",
      toRange: ">=3.0.0-alpha.3",
    },
  },
  {
    description:
      "Renames @c15t/scripts imports to @c15t/integrations. Update the dependency separately.",
    id: "scripts-to-integrations",
    run: runScriptsToIntegrationsCodemod,
  },
  {
    description:
      "Renames ConsentManagerProvider to ConsentProvider, turns mode/backendURL into hosted(), and renames iframeBlockerConfig. Offline and custom modes get a TODO(c15t v3) comment.",
    id: "consent-provider-options",
    run: runConsentProviderOptionsCodemod,
    versioning: V3_VERSIONING,
  },
  {
    description:
      "Moves imports of names that left the c15t/react and c15t/next roots to /headless, /consent-dialog-trigger, /types and /components/consent-banner.",
    id: "root-exports-to-subpaths",
    run: runRootExportsToSubpathsCodemod,
    versioning: V3_VERSIONING,
  },
  {
    description:
      "Points @c15t/dev-tools/react and /tanstack imports at c15t/react/devtools or c15t/next/devtools.",
    id: "dev-tools-to-c15t",
    run: runDevToolsToC15tCodemod,
    versioning: V3_VERSIONING,
  },
  {
    description:
      "Renames policyPackPresets to policyRulePresets and worldNoBanner() to worldOptOutNoPrompt().",
    id: "policy-packs-to-policy-rules",
    run: runPolicyPacksToPolicyRulesCodemod,
    versioning: V3_VERSIONING,
  },
  {
    description:
      "Renames --consent-widget-* to --consent-manager-* and --frame-* to --consent-gate-* in stylesheets and inline styles.",
    id: "css-variables-to-v3",
    run: runCssVariablesToV3Codemod,
    versioning: V3_VERSIONING,
  },
  {
    description:
      "Adds the c15t PostCSS plugin before tailwindcss in an object-form postcss.config for Tailwind CSS 3.",
    id: "postcss-tailwind3",
    run: runPostcssTailwind3Codemod,
    versioning: V3_VERSIONING,
  },
  {
    description:
      "Renames onConsentChanged to onChoiceRecorded and marks onConsentSet and onBannerFetched for manual work.",
    id: "callbacks-to-v3",
    run: runCallbacksToV3Codemod,
    versioning: V3_VERSIONING,
  },
  {
    description:
      "Marks theme tokens on the provider, which need ConsentTheme or generateThemeCSS() in v3.",
    id: "theme-to-consent-theme",
    run: runThemeToConsentThemeCodemod,
    versioning: V3_VERSIONING,
  },
  {
    description:
      "Marks the iab provider option, which moves to <IABProvider> in v3.",
    id: "iab-option-to-iab-provider",
    run: runIabOptionToIabProviderCodemod,
    versioning: V3_VERSIONING,
  },
];

/** Where a line of progress goes: stdout, or stderr when stdout holds JSON. */
type Log = (line: string) => void;

const warn: Log = (line) => console.error(`Warning: ${line}`);

interface CodemodListEntry {
  applicable: boolean;
  description: string;
  fromRange?: string;
  id: string;
  targetVersion: string;
  toRange?: string;
}

/** `data` for `--list`, as @c15t/cli returns it. */
export interface CodemodListResult {
  codemods: CodemodListEntry[];
  declaredVersion: string | null;
  kind: "codemods";
  sourceVersion: string | null;
  targetVersion: string;
}

interface CodemodResultEntry {
  id: string;
  result: CodemodRunResult;
  targetVersion: string;
}

/** `data` for a run, as @c15t/cli returns it. */
export interface CodemodRunSummary {
  declaredVersion: string | null;
  dryRun: boolean;
  kind: "codemods";
  results: CodemodResultEntry[];
  sourceVersion: string | null;
  targetVersion: string;
}

/**
 * The nearest directory at or above `cwd` with a package.json, within ten
 * levels, else `cwd`, as @c15t/cli finds the project root.
 */
const projectRootOf = async (cwd: string): Promise<string> => {
  let directory = cwd;
  for (let depth = 0; depth < 10; depth += 1) {
    try {
      await access(join(directory, "package.json"));
      return directory;
    } catch {
      const parent = dirname(directory);
      if (parent === directory) {
        return cwd;
      }
      directory = parent;
    }
  }
  return cwd;
};

const logResult = (
  log: Log,
  result: CodemodRunResult,
  dryRun: boolean
): void => {
  for (const warning of result.warnings ?? []) {
    warn(`${warning.filePath}: ${warning.message}`);
  }
  if (result.changedFiles.length > 0) {
    log(
      `${dryRun ? "Dry run" : "Applied"}: updated ${result.changedFiles.length} file(s) out of ${result.totalFiles} scanned.`
    );
    for (const file of result.changedFiles) {
      const summary =
        file.summaries.length > 0 ? `: ${file.summaries.join(", ")}` : "";
      log(`- ${file.filePath} (${file.operations} changes${summary})`);
    }
  } else {
    log(`No files needed updates (scanned ${result.totalFiles} source files).`);
  }
  for (const error of result.errors) {
    warn(`Skipped ${error.filePath}: ${error.error}`);
  }
};

const listCodemods = (sourceVersion: string | null): CodemodListEntry[] =>
  CODEMODS.map(({ description, id, versioning }) => ({
    applicable: isCodemodApplicableForVersion(sourceVersion, versioning ?? {}),
    description,
    fromRange: versioning?.fromRange,
    id,
    targetVersion: TARGET_VERSION,
    toRange: versioning?.toRange,
  }));

/**
 * Run the named codemods, or list them, in the app around `cwd`.
 * @param options Parsed `inth c15t codemods` arguments.
 * @param cwd The directory the command runs in.
 * @param json Whether stdout carries the JSON result, which moves progress
 * lines to stderr.
 * @returns The `data` payload @c15t/cli returns for `codemods`.
 * @throws {CliError} usage_error for unknown or missing names, and
 * migration_failed when a codemod could not transform a file.
 */
export const runCodemods = async (
  options: CodemodOptions,
  cwd: string,
  json: boolean
): Promise<CodemodListResult | CodemodRunSummary> => {
  const log: Log = json
    ? (line) => console.error(line)
    : (line) => console.log(line);
  const projectRoot = await projectRootOf(cwd);
  // Upstream's --from can override the source version; inth has no --from.
  const declaredVersion = await detectInstalledC15tVersion(projectRoot);
  const sourceVersion = declaredVersion;
  if (options.list) {
    const codemods = listCodemods(sourceVersion);
    if (!json) {
      for (const entry of codemods) {
        log(`${entry.id}: ${entry.description}`);
      }
    }
    return {
      codemods,
      declaredVersion,
      kind: "codemods",
      sourceVersion,
      targetVersion: TARGET_VERSION,
    };
  }
  const unknown = options.names.filter(
    (name) => !CODEMODS.some((item) => item.id === name)
  );
  if (unknown.length > 0) {
    throw new CliError(
      "usage_error",
      `Unknown codemod: ${unknown.join(", ")}. Run inth c15t codemods --list.`
    );
  }
  const selected = CODEMODS.filter((item) => options.names.includes(item.id));
  if (selected.length === 0) {
    throw new CliError(
      "usage_error",
      "Name one or more codemods. Run inth c15t codemods --list to see them, and add --dry-run to review changes."
    );
  }
  const session = await createCodemodSession(projectRoot);
  const results: CodemodResultEntry[] = [];
  for (const item of selected) {
    // Each codemod sees the edits before it, including in dry runs.
    const result = await item.run({
      dryRun: options.dryRun,
      projectRoot,
      session,
    });
    logResult(log, result, options.dryRun);
    results.push({ id: item.id, result, targetVersion: TARGET_VERSION });
    if (result.errors.length > 0) {
      // The error replaces the result, so name what earlier codemods wrote.
      const changed = [
        ...new Set(
          results.flatMap((entry) =>
            entry.result.changedFiles.map(({ filePath }) => filePath)
          )
        ),
      ];
      const saved = options.dryRun
        ? "No changes saved."
        : changed.length > 0
          ? `Changed before it stopped: ${changed.join(", ")}.`
          : "No files changed.";
      throw new CliError(
        "migration_failed",
        `${item.id} failed for ${result.errors.length} file(s). ${saved} ${result.errors.map(({ filePath, error }) => `${filePath}: ${error}`).join("; ")}`
      );
    }
  }
  return {
    declaredVersion,
    dryRun: options.dryRun,
    kind: "codemods",
    results,
    sourceVersion,
    targetVersion: TARGET_VERSION,
  };
};
