/* eslint-disable no-await-in-loop -- Stop at the nearest linked ancestor before checking user defaults. */
import { randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
// eslint-disable-next-line unicorn/import-style -- Scriptc only supports named imports from node:path.
import { dirname, join } from "node:path";

import { z } from "zod";

export const stateDirectory = (): string => {
  const home = homedir();
  if (process.platform === "darwin") {
    return join(home, "Library", "Application Support", "inth");
  }
  if (process.platform === "win32") {
    return join(home, "AppData", "Local", "inth");
  }
  return join(home, ".local", "state", "inth");
};

export const privateDirectory = async (directory: string): Promise<void> => {
  await mkdir(directory, { mode: 0o700, recursive: true });
  const stat = await lstat(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error("The inth state directory must be a real directory.");
  }
  if (process.platform !== "win32") {
    if (stat.uid !== process.getuid?.()) {
      throw new Error(
        "The inth state directory must belong to the current user."
      );
    }
    await chmod(directory, 0o700);
  }
};

const organizationSchema = z.object({
  organizationId: z.string().min(1).max(200),
});
const readOrganization = async (
  filename: string
): Promise<string | undefined> => {
  let source: string;
  try {
    source = await readFile(filename, "utf-8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
  const parsed = organizationSchema.safeParse(JSON.parse(source));
  if (!parsed.success) {
    throw new Error(`Invalid organization configuration: ${filename}`);
  }
  return parsed.data.organizationId;
};

export class OrganizationContext {
  private readonly directory: string;
  private readonly cwd: string;
  constructor(directory: string, cwd: string) {
    this.directory = directory;
    this.cwd = cwd;
  }
  defaultOrganization(): Promise<string | undefined> {
    return readOrganization(join(this.directory, "config.json"));
  }
  async resolve(explicit?: string): Promise<string | undefined> {
    if (explicit) {
      return explicit;
    }
    let current = this.cwd;
    for (;;) {
      const linked = await readOrganization(
        join(current, ".inth", "project.json")
      );
      if (linked) {
        return linked;
      }
      const parent = dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
    return readOrganization(join(this.directory, "config.json"));
  }
  async select(organizationId: string): Promise<void> {
    await OrganizationContext.write(
      this.directory,
      "config.json",
      organizationId
    );
  }
  async link(organizationId: string): Promise<void> {
    await OrganizationContext.write(
      join(this.cwd, ".inth"),
      "project.json",
      organizationId
    );
  }
  private static async write(
    directory: string,
    name: string,
    organizationId: string
  ): Promise<void> {
    const config = organizationSchema.parse({ organizationId });
    await privateDirectory(directory);
    const temporary = join(directory, `${name}.${randomUUID()}.tmp`);
    await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporary, join(directory, name));
  }
}
