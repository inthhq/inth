/* eslint-disable prefer-named-capture-group -- Scriptc uses indexed regex captures. */
// Update policy shared by the native CLI and its unit tests. Keep native
// bindings out of this module so Vitest can exercise it under Node.
import { style, wrapText } from "./display.ts";

export const DEFAULT_REGISTRY = "https://registry.npmjs.org";
export const INSTALL_SCRIPT_URL = "https://inth.com/cli/install.sh";
export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const UPDATE_CHECK_TIMEOUT_MS = 1500;

export type InstallMethod =
  | "development"
  | "standalone"
  | "npm"
  | "pnpm"
  | "pnpm-virtual-store"
  | "bun"
  | "yarn"
  | "temporary"
  | "project";

export const projectDirectory = (executable: string): string => {
  const index = executable
    .split("\\")
    .join("/")
    .toLowerCase()
    .indexOf("/node_modules/");
  return index > 0 ? executable.slice(0, index) : executable;
};

// Classifies the real path of the running executable. Global package-manager
// layouts were measured with npm 11, pnpm 10 through 12, bun 1.3, and Yarn 1.
// hasPackageJson reports whether a directory contains package.json.
export const installMethod = (
  executable: string,
  production: boolean,
  hasPackageJson: (directory: string) => boolean
): InstallMethod => {
  if (!production) {
    return "development";
  }
  const path = executable.split("\\").join("/");
  if (!/\/node_modules\//iu.test(path)) {
    return "standalone";
  }
  if (/\/(?:_npx|dlx)\/|\/bunx-/iu.test(path)) {
    return "temporary";
  }
  if (/\/install\/global\/node_modules\//iu.test(path)) {
    return "bun";
  }
  if (/\/yarn\/(?:data\/)?global\/node_modules\//iu.test(path)) {
    return "yarn";
  }
  // pnpm 10 uses global/5/.pnpm and pnpm 11+ global/v11/<id>/node_modules/.pnpm.
  if (/\/global\/v?\d+\/(?:[^/]+\/)?(?:node_modules\/)?\.pnpm\//iu.test(path)) {
    return "pnpm";
  }
  // With enable-global-virtual-store, global installations and project
  // dependencies both resolve into the store's v<N>/links, so the path cannot
  // tell them apart. Stores on another filesystem are named .pnpm-store.
  if (/\/(?:\.pnpm-)?store\/v\d+\/links\//iu.test(path)) {
    return "pnpm-virtual-store";
  }
  // npm nests platform packages under the launcher for global installs. A
  // project installed with --install-strategy nested looks the same, but its
  // node_modules sits beside package.json and a global prefix's does not.
  if (/\/node_modules\/@inth\/cli\/node_modules\/@inth\/cli-/iu.test(path)) {
    return hasPackageJson(projectDirectory(executable)) ? "project" : "npm";
  }
  return "project";
};

// Each entry holds the argv the CLI runs and the shorter form it prints.
const PACKAGE_MANAGER_COMMANDS: [InstallMethod, string[], string][] = [
  [
    "npm",
    ["npm", "install", "--global", "@inth/cli@latest"],
    "npm install -g @inth/cli@latest",
  ],
  [
    "pnpm",
    ["pnpm", "add", "--global", "@inth/cli@latest"],
    "pnpm add -g @inth/cli@latest",
  ],
  [
    "bun",
    ["bun", "add", "--global", "@inth/cli@latest"],
    "bun add -g @inth/cli@latest",
  ],
  [
    "yarn",
    ["yarn", "global", "add", "@inth/cli@latest"],
    "yarn global add @inth/cli@latest",
  ],
];

const packageManagerEntry = (method: InstallMethod) =>
  PACKAGE_MANAGER_COMMANDS.find((entry) => entry[0] === method);

// Returns the package manager command for a global installation, or an empty list.
export const packageManagerCommand = (method: InstallMethod): string[] =>
  packageManagerEntry(method)?.[1] ?? [];

// Windows cannot replace a running executable, so updates there are manual.
export const automaticUpdate = (
  method: InstallMethod,
  platform: string
): boolean =>
  platform !== "win32" &&
  (method === "standalone" || packageManagerCommand(method).length > 0);

// Global installations get the launch notice. Project dependencies and
// temporary runners use the version their project or command requests.
export const updateNoticeMethod = (method: InstallMethod): boolean =>
  method === "standalone" || packageManagerCommand(method).length > 0;

const shellQuote = (value: string): string =>
  /^[A-Za-z0-9_./~-]+$/u.test(value)
    ? value
    : `'${value.split("'").join(String.raw`'\''`)}'`;

// The command that installs the latest release for this installation, or an
// empty string when the CLI cannot name one.
export const updateCommand = (
  method: InstallMethod,
  platform: string,
  executable: string
): string => {
  if (method === "standalone") {
    if (platform === "win32") {
      return "npm install -g @inth/cli@latest";
    }
    const directory = executable.slice(0, executable.lastIndexOf("/"));
    return `curl -fsSL ${INSTALL_SCRIPT_URL} | INTH_INSTALL_DIR=${shellQuote(directory)} sh`;
  }
  if (method === "temporary") {
    return "npx @inth/cli@latest";
  }
  if (method === "development") {
    return "pnpm dev:link";
  }
  return packageManagerEntry(method)?.[2] ?? "";
};

interface SemanticVersion {
  core: number[];
  prerelease: string[];
}

const parseVersion = (value: string): SemanticVersion | undefined => {
  const match =
    /^(\d{1,9})\.(\d{1,9})\.(\d{1,9})(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u.exec(
      value
    );
  if (!match) {
    return undefined;
  }
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] ? match[4].split(".") : [],
  };
};

// SemVer precedence for one prerelease identifier: numeric identifiers compare
// numerically and sort before alphanumeric ones, which compare in ASCII order.
const compareIdentifier = (left: string, right: string): number => {
  const leftNumeric = /^\d{1,15}$/u.test(left);
  const rightNumeric = /^\d{1,15}$/u.test(right);
  if (leftNumeric && rightNumeric) {
    return Number(left) - Number(right);
  }
  if (leftNumeric !== rightNumeric) {
    return leftNumeric ? -1 : 1;
  }
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
};

const compareVersions = (
  left: SemanticVersion,
  right: SemanticVersion
): number => {
  for (let index = 0; index < 3; index += 1) {
    const difference = (left.core[index] ?? 0) - (right.core[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  // A release sorts after its prereleases.
  if (!left.prerelease.length || !right.prerelease.length) {
    return right.prerelease.length - left.prerelease.length;
  }
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = left.prerelease[index];
    const rightIdentifier = right.prerelease[index];
    if (leftIdentifier === undefined) {
      return -1;
    }
    if (rightIdentifier === undefined) {
      return 1;
    }
    const difference = compareIdentifier(leftIdentifier, rightIdentifier);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
};

export const validVersion = (value: string): boolean =>
  parseVersion(value) !== undefined;

export const newerVersion = (candidate: string, current: string): boolean => {
  const next = parseVersion(candidate);
  const installed = parseVersion(current);
  return next !== undefined && installed !== undefined
    ? compareVersions(next, installed) > 0
    : false;
};

export const registryOrigin = (value?: string): string => {
  const origin = (value ?? "").trim().replace(/\/+$/u, "");
  return /^https?:\/\/[^\s/]+(?:\/\S*)?$/u.test(origin)
    ? origin
    : DEFAULT_REGISTRY;
};

export const distTagsUrl = (registry: string): string =>
  `${registry}/-/package/@inth/cli/dist-tags`;

// Reads `latest` from the registry's dist-tags document.
export const latestFromDistTags = (body: string): string => {
  const match = /"latest"\s*:\s*"([^"]{1,64})"/u.exec(body);
  const version = match?.[1] ?? "";
  return validVersion(version) ? version : "";
};

export const updateChecksDisabled = (
  disabled: string | undefined,
  noNotifier: string | undefined,
  ci: string | undefined
): boolean =>
  [disabled, noNotifier, ci].some(
    (value) => Boolean(value) && value !== "0" && value !== "false"
  );

export interface UpdateState {
  checkedAt: number;
  latest: string;
  notifiedAt: number;
}

// Clock changes that move time backwards make a saved timestamp due again.
const elapsed = (since: number, now: number): boolean =>
  now < since || now - since >= UPDATE_CHECK_INTERVAL_MS;

export const updateCheckDue = (state: UpdateState, now: number): boolean =>
  elapsed(state.checkedAt, now);

export const updateNoticeDue = (
  state: UpdateState,
  current: string,
  now: number
): boolean =>
  newerVersion(state.latest, current) && elapsed(state.notifiedAt, now);

export const formatUpdateNotice = (
  current: string,
  latest: string,
  command: string,
  columns = 80,
  color = false
): string => {
  const width = Math.max(20, columns - 1);
  return `${wrapText(`A new version of inth is available: ${current} -> ${latest}.`, width)}\nRun \`${style(command, "1", color)}\` to update.`;
};
