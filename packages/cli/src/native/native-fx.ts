import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
// eslint-disable-next-line unicorn/import-style -- Scriptc requires named node:path imports.
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

import type { BoilerplateFramework } from "../../vendor/c15t/generate/index.ts";
import {
  backendEnv,
  fxArguments,
  fxAsset,
  fxEnvironment,
  fxFailure,
  fxSettings,
  hex,
  mergeBackendEnv,
  tarFile,
  unsupportedPlatform,
  wizardInstructions,
} from "../c15t-fx.ts";
import type { FxRelease, FxResult, WizardSession } from "../c15t-fx.ts";
import { CliError } from "../cli-error.ts";
import { HttpError } from "../http-error.ts";
import { terminalText } from "../organizations.ts";
import { VERSION } from "../version.ts";
import type { NativeApi } from "./native-api.ts";
import { invalidResponse } from "./native-protocol.ts";

interface SessionEnvelope {
  success: boolean;
  data: WizardSession;
}

// Archives are about 5 MB; anything far larger is not an fx release.
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;

/**
 * The verified fx executable for this machine, downloaded on first use into
 * inth's state directory and reused by later runs.
 */
export const ensureFx = async (
  release: FxRelease,
  stateDirectory: string,
  signal: AbortSignal
): Promise<string> => {
  const asset = fxAsset(release, process.platform, process.arch);
  if (!asset) {
    throw unsupportedPlatform();
  }
  const directory = join(stateDirectory, "fx", release.version);
  const binary = join(directory, "fx");
  if (existsSync(binary)) {
    return binary;
  }
  console.error(`Downloading fx ${release.version}, Inth's setup agent...`);
  let bytes: Uint8Array;
  try {
    const response = await fetch(`${release.baseUrl}${asset.name}`, {
      redirect: "follow",
      signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch {
    signal.throwIfAborted();
    throw new CliError(
      "command_failed",
      "Could not download Inth's setup agent. Check your connection and try again."
    );
  }
  const digest = hex(
    new Uint8Array(createHash("sha256").update(bytes).digest())
  );
  if (bytes.length > MAX_ARCHIVE_BYTES || digest !== asset.sha256) {
    throw new CliError(
      "command_failed",
      "The downloaded setup agent did not match its published checksum, so inth did not run it."
    );
  }
  const executable = tarFile(new Uint8Array(gunzipSync(bytes)), "fx");
  if (!executable) {
    throw new CliError(
      "command_failed",
      "The downloaded setup agent archive has no fx executable."
    );
  }
  mkdirSync(directory, { mode: 0o700, recursive: true });
  // Write beside the target and rename, so an interrupted download never
  // leaves a partial executable at the path later runs trust.
  const partial = join(directory, `fx.${randomUUID()}.partial`);
  try {
    writeFileSync(partial, executable);
    chmodSync(partial, 0o700);
    renameSync(partial, binary);
  } finally {
    rmSync(partial, { force: true });
  }
  return binary;
};

const sessionError = (error: HttpError): Error => {
  if (error.code === "INSUFFICIENT_SCOPE") {
    return new CliError(
      "insufficient_scope",
      "Your sign-in does not allow Inth's setup agent yet. Run inth login, then inth c15t --inth again."
    );
  }
  if (error.status === 429) {
    return new CliError(
      "rate_limited",
      "You have used today's runs of Inth's setup agent. Try again tomorrow, or run inth c15t prompt and use your own coding agent."
    );
  }
  if (error.status === 403 || error.status === 503) {
    return new CliError(
      "access_denied",
      "Inth's setup agent is not available for this organization right now. Run inth c15t prompt and use your own coding agent."
    );
  }
  return error;
};

/** Open a wizard session: a short-lived token for one run's model requests. */
export const openWizardSession = async (
  api: NativeApi,
  organization: string,
  project: string,
  framework: string
): Promise<WizardSession> => {
  let response;
  try {
    response = await api.execute(
      "/v1/wizard/sessions",
      "POST",
      JSON.stringify({
        framework,
        organizationId: organization,
        projectId: project,
        wizardVersion: `inth-cli/${VERSION}`,
      }),
      organization
    );
  } catch (error) {
    throw error instanceof HttpError ? sessionError(error) : error;
  }
  try {
    // SAFETY: Scriptc validates the session record at runtime.
    return (JSON.parse(response.body) as SessionEnvelope).data;
  } catch {
    throw invalidResponse(response, "Invalid wizard session response.");
  }
};

/**
 * Write the backend URL where the framework's quickstart reads it, as
 * `inth c15t scaffold` does, so the agent never needs to open `.env`.
 */
const writeBackendEnv = (
  cwd: string,
  framework: BoilerplateFramework | undefined,
  backendURL: string
) => {
  const target = backendEnv(framework, backendURL);
  if (!target) {
    return;
  }
  const file = join(cwd, target.env.file);
  const existing = existsSync(file) ? readFileSync(file, "utf-8") : null;
  const merged = mergeBackendEnv(existing, target.line);
  if (merged !== existing) {
    const partial = `${file}.${randomUUID()}.partial`;
    try {
      writeFileSync(partial, merged, { mode: 0o600 });
      renameSync(partial, file);
    } finally {
      rmSync(partial, { force: true });
    }
    console.error(`Set ${target.env.name} in ${target.env.file}.`);
  }
  return target.env;
};

export interface FxRun {
  binary: string;
  stateDirectory: string;
  cwd: string;
  session: WizardSession;
  framework: BoilerplateFramework | undefined;
  backendURL: string;
  prompt: string;
  projectName: string;
}

const runAgent = async (
  run: FxRun,
  home: string,
  output: string,
  signal: AbortSignal
): Promise<number> => {
  // The fx home is private (0700), so its files need no narrower mode.
  const descriptor = openSync(output, "w");
  try {
    // eslint-disable-next-line promise/avoid-new -- Adapt Scriptc child process events to the async command contract.
    return await new Promise<number>((resolve, reject) => {
      const child = spawn(run.binary, fxArguments(run.session, run.prompt), {
        cwd: run.cwd,
        env: fxEnvironment(process.env, home, run.session.token),
        // fx streams progress to stderr and its JSON result to stdout.
        stdio: ["ignore", descriptor, "inherit"],
      });
      const cancel = (): void => {
        child.kill("SIGTERM");
      };
      signal.addEventListener("abort", cancel);
      child.on("error", () => {
        signal.removeEventListener("abort", cancel);
        reject(
          new CliError("command_failed", "Cannot start Inth's setup agent.")
        );
      });
      child.on("exit", (code: number | null, childSignal: string | null) => {
        signal.removeEventListener("abort", cancel);
        if (
          signal.aborted ||
          childSignal === "SIGINT" ||
          childSignal === "SIGTERM"
        ) {
          reject(
            new CliError(
              "cancelled",
              "Setup stopped. Changes made so far are in your working tree."
            )
          );
        } else {
          resolve(code ?? 1);
        }
      });
    });
  } finally {
    closeSync(descriptor);
  }
};

const readResult = (output: string): FxResult | undefined => {
  try {
    // SAFETY: Scriptc validates the result record at runtime.
    return JSON.parse(readFileSync(output, "utf-8")) as FxResult;
  } catch {
    return undefined;
  }
};

/**
 * Run fx in the app directory against Inth's gateway and return its report.
 * @throws {CliError} When the run fails; the message says what to do next.
 */
export const runFx = async (
  run: FxRun,
  signal: AbortSignal
): Promise<string> => {
  const home = join(run.stateDirectory, "fx-home");
  mkdirSync(home, { mode: 0o700, recursive: true });
  writeFileSync(join(home, "settings.json"), fxSettings(run.session), {
    mode: 0o600,
  });
  const env = writeBackendEnv(run.cwd, run.framework, run.backendURL);
  writeFileSync(
    join(home, "AGENTS.md"),
    wizardInstructions(run.backendURL, env),
    { mode: 0o600 }
  );
  const output = join(home, `result-${randomUUID()}.json`);
  console.error(
    `Inth's setup agent is adding c15t for ${terminalText(run.projectName)} in ${run.cwd}. This usually takes 5 to 15 minutes; press Ctrl+C to stop.`
  );
  try {
    const status = await runAgent(run, home, output, signal);
    const result = readResult(output);
    if (status !== 0 || !result || result.exit_code !== 0) {
      throw new CliError("command_failed", fxFailure(result?.output ?? ""));
    }
    return result.final_output || result.output;
  } finally {
    rmSync(output, { force: true });
  }
};
