/* eslint-disable require-await -- Convert synchronous filesystem FFI failures to the asynchronous state contract. */
import { mkdir, readFile } from "node:fs/promises";
// eslint-disable-next-line unicorn/import-style -- Scriptc requires named node:path imports.
import { dirname, join } from "node:path";

import { parseConnection } from "../connection-selection.ts";
import { diagnosticStep } from "../error-diagnostics.ts";
import { organizationId } from "../organizations.ts";
import { StateDirectoryError } from "../sandbox.ts";
import { prepareDirectory, writeConfig } from "./native-bindings.ts";

const read = async (filename: string): Promise<string | undefined> => {
  diagnosticStep("config_read");
  let source: string;
  try {
    source = await readFile(filename, "utf-8");
  } catch (error) {
    // Scriptc exposes filesystem errno in Error.message, but not Error.code.
    if (error instanceof Error && error.message.startsWith("ENOENT:")) {
      return undefined;
    }
    throw error;
  }
  try {
    // SAFETY: Scriptc validates this JSON record's field types at runtime.
    const value = JSON.parse(source) as { organizationId: string };
    return organizationId(value.organizationId);
  } catch {
    throw new Error(
      "Invalid organization configuration. Run inth switch or inth link to replace it."
    );
  }
};
// `state` marks writes to the CLI state directory rather than a project link.
const write = async (
  directory: string,
  name: string,
  id: string,
  state: boolean
): Promise<void> => {
  diagnosticStep("config_write");
  const failure = (message: string): Error =>
    state ? new StateDirectoryError(message) : new Error(message);
  const config = { organizationId: organizationId(id) };
  try {
    await mkdir(dirname(directory), { recursive: true });
  } catch {
    throw failure(
      "Cannot create a private organization configuration directory."
    );
  }
  if (prepareDirectory(directory) !== 0) {
    throw failure(
      "Cannot create a private organization configuration directory."
    );
  }
  if (writeConfig(join(directory, name), JSON.stringify(config)) !== 0) {
    throw failure("Cannot save organization configuration.");
  }
};
export class NativeContext {
  private readonly directory: string;
  private readonly cwd: string;
  constructor(directory: string, cwd: string) {
    this.directory = directory;
    this.cwd = cwd;
  }
  defaultOrganization(): Promise<string | undefined> {
    return read(join(this.directory, "config.json"));
  }
  async selectedConnection(): Promise<string | undefined> {
    let source: string;
    try {
      source = await readFile(join(this.directory, "connection.json"), "utf-8");
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("ENOENT:")) {
        return undefined;
      }
      throw error;
    }
    return parseConnection(source);
  }
  async selectConnection(auth: string): Promise<void> {
    const source = JSON.stringify({ auth });
    parseConnection(source);
    await mkdir(dirname(this.directory), { recursive: true });
    if (
      prepareDirectory(this.directory) !== 0 ||
      writeConfig(join(this.directory, "connection.json"), source) !== 0
    ) {
      throw new Error(
        "Cannot save the selected connection. Retry sign-in completion."
      );
    }
  }
  async resolve(explicit?: string): Promise<string | undefined> {
    if (explicit) {
      return organizationId(explicit);
    }
    let current = this.cwd;
    for (;;) {
      // eslint-disable-next-line no-await-in-loop -- Nearest linked directory takes precedence.
      const linked = await read(join(current, ".inth", "project.json"));
      if (linked) {
        return linked;
      }
      const parent = dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
    return this.defaultOrganization();
  }
  select(id: string): Promise<void> {
    return write(this.directory, "config.json", id, true);
  }
  link(id: string): Promise<void> {
    return write(join(this.cwd, ".inth"), "project.json", id, false);
  }
}
