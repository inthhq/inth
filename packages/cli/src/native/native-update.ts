import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
// eslint-disable-next-line unicorn/import-style -- Scriptc requires named node:path imports.
import { dirname, join } from "node:path";

import type { CliArguments } from "../arguments.ts";
import { CliError } from "../cli-error.ts";
import { printResult } from "../output.ts";
import {
  automaticUpdate,
  distTagsUrl,
  formatUpdateNotice,
  INSTALL_SCRIPT_URL,
  installMethod,
  latestFromDistTags,
  newerVersion,
  packageManagerCommand,
  projectDirectory,
  registryOrigin,
  updateCheckDue,
  updateCommand,
  updateNoticeDue,
  UPDATE_CHECK_TIMEOUT_MS,
} from "../update.ts";
import type { InstallMethod, UpdateState } from "../update.ts";
import { VERSION } from "../version.ts";
import {
  prepareDirectory,
  productionBuild,
  writeConfig,
} from "./native-bindings.ts";

const STATE_FILE = "update-check";
const UPDATE_REQUEST_TIMEOUT_MS = 15_000;

export const currentExecutable = (): string => {
  try {
    return realpathSync(process.execPath);
  } catch {
    return process.execPath;
  }
};

const hasPackageJson = (directory: string): boolean =>
  existsSync(join(directory, "package.json"));

export const currentInstallMethod = (): InstallMethod =>
  installMethod(currentExecutable(), productionBuild() === 1, hasPackageJson);

const readState = (directory: string): UpdateState => {
  try {
    // SAFETY: Scriptc checks the saved record's field types at runtime.
    return JSON.parse(readFileSync(join(directory, STATE_FILE), "utf-8")) as {
      checkedAt: number;
      latest: string;
      notifiedAt: number;
    };
  } catch {
    return { checkedAt: 0, latest: "", notifiedAt: 0 };
  }
};

// Update state is advisory. Failing to save it never fails a command.
const saveState = (directory: string, state: UpdateState): void => {
  try {
    mkdirSync(dirname(directory), { recursive: true });
    if (prepareDirectory(directory) === 0) {
      writeConfig(join(directory, STATE_FILE), JSON.stringify(state));
    }
  } catch {
    // Keep the command's output and exit status.
  }
};

// Cancellation propagates as cancellation. A timeout is an ordinary registry
// failure, so it reports a handled error instead of an unexpected exception.
export const latestVersion = async (
  cancel: AbortSignal,
  timeoutMs: number
): Promise<string> => {
  const timeout = AbortSignal.timeout(timeoutMs);
  // Keep fetch types inferred; Scriptc's Windows target resolves fewer ambient types.
  let status = 0;
  let body = "";
  try {
    const response = await fetch(
      distTagsUrl(registryOrigin(process.env.INTH_NPM_REGISTRY)),
      {
        headers: { Accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.any([cancel, timeout]),
      }
    );
    ({ status } = response);
    body = await response.text();
  } catch (error) {
    cancel.throwIfAborted();
    if (timeout.aborted) {
      throw new CliError(
        "command_failed",
        `The npm registry did not answer the update check within ${Math.round(timeoutMs / 1000)} seconds.`
      );
    }
    throw new CliError(
      "command_failed",
      `Cannot reach the npm registry to check for updates${error instanceof Error && error.message ? `: ${error.message}` : "."}`
    );
  }
  if (status < 200 || status > 299) {
    throw new CliError(
      "http_error",
      `The npm registry answered the update check with HTTP ${status}.`,
      status
    );
  }
  const latest = latestFromDistTags(body);
  if (!latest) {
    throw new CliError(
      "invalid_response",
      "The npm registry returned an invalid latest version."
    );
  }
  return latest;
};

const latestOrEmpty = async (): Promise<string> => {
  try {
    return await latestVersion(
      new AbortController().signal,
      UPDATE_CHECK_TIMEOUT_MS
    );
  } catch {
    return "";
  }
};

// Checks the registry at most once a day while a command runs, then prints a
// notice after the command finishes. Only interactive global installations
// create a notifier, so scripts and agents never make this request.
export class UpdateNotifier {
  private readonly directory: string;
  private readonly method: InstallMethod;
  private pending: Promise<string> | undefined;
  constructor(directory: string, method: InstallMethod) {
    this.directory = directory;
    this.method = method;
  }
  start(now = Date.now()): void {
    if (updateCheckDue(readState(this.directory), now)) {
      this.pending = latestOrEmpty();
    }
  }
  async finish(columns: number, color: boolean): Promise<string> {
    const state = readState(this.directory);
    const now = Date.now();
    if (this.pending) {
      const latest = await this.pending;
      // A failed check waits a day like a successful one, so an offline
      // machine does not pay the timeout on every command.
      state.checkedAt = now;
      state.latest = latest || state.latest;
    }
    const notice = updateNoticeDue(state, VERSION, now);
    if (notice) {
      state.notifiedAt = now;
    }
    if (this.pending || notice) {
      saveState(this.directory, state);
    }
    if (!notice) {
      return "";
    }
    const command = automaticUpdate(this.method, process.platform)
      ? "inth update"
      : updateCommand(this.method, process.platform, currentExecutable());
    return formatUpdateNotice(VERSION, state.latest, command, columns, color);
  }
}

// Replace the running executable by rerunning the install script. The script
// is downloaded to a file first so a failed download cannot run a partial script.
const INSTALLER = `set -eu
script=$(mktemp 2>/dev/null || mktemp -t inth)
trap 'rm -f "$script"' EXIT
if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$1" -o "$script"
elif command -v wget >/dev/null 2>&1; then
  wget -q -O "$script" "$1"
else
  echo "Install curl or wget, then run inth update again." >&2
  exit 1
fi
sh "$script"`;

// Runs an updater with inherited output. The child gets this process's
// environment without INTH_TOKEN, plus any extra variables.
const runInherited = async (
  command: string,
  args: string[],
  extra: string[][],
  signal: AbortSignal
): Promise<number> => {
  // Scriptc's Windows target lacks NodeJS.ProcessEnv, so keep this type inferred.
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.toUpperCase() === "INTH_TOKEN") {
      env[key] = undefined;
    }
  }
  for (const [key = "", value = ""] of extra) {
    env[key] = value;
  }
  // eslint-disable-next-line promise/avoid-new -- Adapt Scriptc child process events to the async command contract.
  return await new Promise<number>((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: "inherit" });
    const cancel = (): void => {
      child.kill("SIGTERM");
    };
    signal.addEventListener("abort", cancel);
    child.on("error", () => {
      signal.removeEventListener("abort", cancel);
      reject(
        new CliError(
          "command_failed",
          `Cannot start ${command}. Install it or run the update command yourself.`
        )
      );
    });
    child.on("exit", (code: number | null, childSignal: string | null) => {
      signal.removeEventListener("abort", cancel);
      if (
        signal.aborted ||
        childSignal === "SIGINT" ||
        childSignal === "SIGTERM"
      ) {
        reject(new CliError("cancelled", "Update cancelled."));
      } else {
        resolve(code ?? 1);
      }
    });
  });
};

const manualUpdateMessage = (
  method: InstallMethod,
  executable: string
): string => {
  const command = updateCommand(method, process.platform, executable);
  if (method === "development") {
    return "This is a development build. Run pnpm dev:link to rebuild it.";
  }
  if (method === "temporary") {
    return `This inth runs from a temporary package runner cache. Run ${command} for the latest release, or install it globally.`;
  }
  if (method === "project") {
    return `inth is a dependency of the project in ${projectDirectory(executable)}. Update @inth/cli in that project with its package manager.`;
  }
  if (method === "pnpm-virtual-store") {
    return "inth runs from pnpm's global virtual store, which global installations and project dependencies share. For a global installation, run pnpm add -g @inth/cli@latest. For a project dependency, update @inth/cli in that project.";
  }
  return `Windows cannot replace a running inth.exe. Run ${command} to update.`;
};

export const runUpdate = async (
  options: CliArguments,
  directory: string,
  signal: AbortSignal
): Promise<void> => {
  const executable = currentExecutable();
  const method = installMethod(
    executable,
    productionBuild() === 1,
    hasPackageJson
  );
  const check = options.values.some((entry) => entry.name === "check");
  const latest = await latestVersion(signal, UPDATE_REQUEST_TIMEOUT_MS);
  const state = readState(directory);
  saveState(directory, { ...state, checkedAt: Date.now(), latest });
  const available = newerVersion(latest, VERSION);
  const automatic = automaticUpdate(method, process.platform);
  const command = updateCommand(method, process.platform, executable);
  if (check || !available) {
    let message = `inth ${VERSION} is the latest version.`;
    if (available) {
      message = `A new version of inth is available: ${VERSION} -> ${latest}.\n${
        automatic
          ? "Run `inth update` to update."
          : manualUpdateMessage(method, executable)
      }`;
    }
    printResult(
      options.json,
      message,
      JSON.stringify({
        automatic,
        currentVersion: VERSION,
        installMethod: method,
        latestVersion: latest,
        updateAvailable: available,
        updateCommand: command || null,
      })
    );
    return;
  }
  if (!automatic) {
    throw new CliError("usage_error", manualUpdateMessage(method, executable));
  }
  let status = 0;
  if (method === "standalone") {
    console.log(
      `Updating inth ${VERSION} -> ${latest} with the install script.`
    );
    status = await runInherited(
      "sh",
      [
        "-c",
        INSTALLER,
        "sh",
        process.env.INTH_INSTALL_SCRIPT_URL || INSTALL_SCRIPT_URL,
      ],
      [
        ["INTH_INSTALL_DIR", dirname(executable)],
        ["INTH_VERSION", latest],
      ],
      signal
    );
  } else {
    // Install the version that was checked. Resolving @latest again could
    // reach a different registry and install another release.
    const [program = "", ...args] = packageManagerCommand(method, latest);
    console.log(
      `Updating inth ${VERSION} -> ${latest} with ${[program, ...args].join(" ")}`
    );
    status = await runInherited(program, args, [], signal);
    if (status === 0) {
      console.log(`Updated inth to ${latest}.`);
    }
  }
  if (status !== 0) {
    throw new CliError(
      "command_failed",
      `The update did not finish. Run ${command} to retry.`
    );
  }
};
