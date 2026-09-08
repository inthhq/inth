/* eslint-disable no-await-in-loop -- Each client is inspected in order; writes use a per-file lock. */
import { createHash } from "node:crypto";
import { lstatSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
// eslint-disable-next-line unicorn/import-style -- Scriptc requires named path imports.
import { dirname, join } from "node:path";

import type { CliArguments } from "../arguments.ts";
import { CliError } from "../cli-error.ts";
import { colorEnabled } from "../display.ts";
import {
  MCP_CLIENTS,
  MCP_URL,
  mcpClientName,
  mcpLocation,
} from "../mcp-clients.ts";
import type { McpClient } from "../mcp-clients.ts";
import { editMcpJson } from "../mcp-json.ts";
import { mcpNextStep, mcpSummary } from "../mcp-output.ts";
import type { McpResult } from "../mcp-output.ts";
import { editMcpToml } from "../mcp-toml.ts";
import { printResult } from "../output.ts";
import { nativeStateDirectory } from "../platform.ts";
import { optionValue } from "../resource-commands.ts";
import {
  lockAcquire,
  lockRelease,
  mcpTomlStatus,
  outputColumns,
  prepareDirectory,
  writeMcpConfig,
} from "./native-bindings.ts";
import { nativeUI } from "./native-ui.ts";

const configLock = async (filename: string): Promise<number> => {
  const state = nativeStateDirectory();
  await mkdir(dirname(state), { recursive: true });
  const directory = join(state, "mcp-locks");
  if (prepareDirectory(state) !== 0 || prepareDirectory(directory) !== 0) {
    throw new CliError(
      "config_busy",
      "Cannot create a private configuration lock directory."
    );
  }
  const normalized =
    process.platform === "win32" ? filename.toLowerCase() : filename;
  const name = createHash("sha256").update(normalized).digest("hex");
  return lockAcquire(join(directory, name));
};
const missing = (error: Error): boolean => error.message.startsWith("ENOENT:");
const read = async (path: string): Promise<string> => {
  try {
    const info = lstatSync(path);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.size > 4 * 1024 * 1024
    ) {
      throw new CliError(
        "invalid_config",
        "Client configuration must be a regular file smaller than 4 MB."
      );
    }
    return await readFile(path, "utf-8");
  } catch (error) {
    if (error instanceof Error && missing(error)) {
      return "";
    }
    throw error;
  }
};
const chooseTargets = async (
  options: CliArguments,
  signal: AbortSignal
): Promise<{ agents: McpClient[]; scope: string }> => {
  const action = options.argument || "setup";
  let agent = optionValue(options, "agent");
  let scope = optionValue(options, "scope");
  const ui = nativeUI(
    signal,
    !options.json && !options.nonInteractive,
    "Choose an MCP client",
    false
  );
  if (action !== "list" && (!agent || !scope)) {
    if (!ui.interactive) {
      throw new CliError(
        "interaction_required",
        "Provide --agent and --scope project|global. Example: inth mcp setup --agent cursor --scope project --json."
      );
    }
    if (!agent) {
      agent = await ui.select(
        MCP_CLIENTS.map((name) => ({
          id: name,
          name: mcpClientName(name),
          role: "",
          slug: name,
        }))
      );
    }
    if (!scope) {
      scope = await nativeUI(
        signal,
        true,
        "Choose where to configure Inth MCP",
        false
      ).select([
        { id: "project", name: "This project", role: "", slug: "project" },
        { id: "global", name: "All projects", role: "", slug: "global" },
      ]);
    }
  }
  const selectedScope = scope || "project";
  const client = MCP_CLIENTS.find((value) => value === agent);
  if (agent && !client) {
    throw new CliError("usage_error", "Unknown MCP client.");
  }
  const agents = client ? [client] : MCP_CLIENTS;
  return { agents, scope: selectedScope };
};
const editStatus = (
  changed: boolean,
  dryRun: boolean,
  remove: boolean
): string => {
  if (!changed) {
    return "unchanged";
  }
  if (dryRun) {
    return remove ? "would-remove" : "would-add";
  }
  return remove ? "removed" : "configured";
};
export const runMcp = async (
  options: CliArguments,
  signal: AbortSignal
): Promise<void> => {
  const action = options.argument || "setup";
  const dryRun = optionValue(options, "dry-run") === "true";
  const selected = await chooseTargets(options, signal);
  const { agents } = selected;
  const selectedScope = selected.scope;
  const results: McpResult[] = [];
  const environment = {
    appData: process.env.APPDATA,
    codexHome: process.env.CODEX_HOME,
    cwd: process.cwd(),
    home: homedir(),
    platform: process.platform,
    xdgConfig: process.env.XDG_CONFIG_HOME,
  };
  for (const client of agents) {
    signal.throwIfAborted();
    const location = mcpLocation(client, selectedScope, environment);
    if (client === "opencode") {
      const jsonc = location.path.replace(/\.json$/u, ".jsonc");
      try {
        lstatSync(jsonc);
        location.path = jsonc;
      } catch (error) {
        if (!(error instanceof Error) || !missing(error)) {
          throw error;
        }
      }
    }
    const original = await read(location.path);
    const remove = action === "remove" || action === "list";
    const edit =
      location.format === "toml"
        ? editMcpToml(
            original,
            remove,
            (value) => mcpTomlStatus(value),
            action === "list"
          )
        : editMcpJson(
            original,
            location.key,
            location.config,
            remove,
            action === "list"
          );
    if (action === "list") {
      results.push({
        agent: client,
        changed: false,
        nextStep: null,
        path: location.path,
        scope: selectedScope,
        status: edit.configured ? "configured" : "not-configured",
      });
      continue;
    }
    if (edit.changed && !dryRun) {
      await mkdir(dirname(location.path), { recursive: true });
      const lock = await configLock(location.path);
      if (lock < 0) {
        throw new CliError(
          "config_busy",
          "Cannot lock the client configuration. Close other setup commands and retry."
        );
      }
      try {
        if ((await read(location.path)) !== original) {
          throw new CliError(
            "config_conflict",
            "Client configuration changed during setup. Retry the command."
          );
        }
        signal.throwIfAborted();
        if (writeMcpConfig(location.path, edit.source) !== 0) {
          throw new CliError(
            "config_write_failed",
            "Cannot save the client configuration."
          );
        }
        if ((await read(location.path)) !== edit.source) {
          throw new CliError(
            "config_conflict",
            "The client configuration changed after saving. Retry setup after closing other configuration tools."
          );
        }
      } finally {
        lockRelease(lock);
      }
    }
    const status = editStatus(edit.changed, dryRun, remove);
    results.push({
      agent: client,
      changed: edit.changed && !dryRun,
      nextStep: mcpNextStep(client, selectedScope, action, dryRun),
      path: location.path,
      scope: selectedScope,
      status,
    });
  }
  printResult(
    options.json,
    mcpSummary(results, action, dryRun, environment, {
      color: colorEnabled(Boolean(process.stdout.isTTY)),
      columns: outputColumns(),
    }),
    JSON.stringify({
      authentication: "client-oauth",
      connectionVerified: false,
      dryRun,
      results,
      server: "inth",
      url: MCP_URL,
    })
  );
};
