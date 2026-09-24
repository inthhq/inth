// eslint-disable-next-line unicorn/import-style -- Scriptc only supports named imports from node:path.
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";

import { AsyncEntry } from "@napi-rs/keyring";
import lockfile from "proper-lockfile";

import type { CredentialStore } from "./auth.ts";
import { credentialsSchema } from "./protocol.ts";
import type { Credentials } from "./protocol.ts";
import { privateDirectory } from "./state.ts";

export interface SecretEntry {
  getPassword: () => Promise<string | null | undefined>;
  setPassword: (value: string) => Promise<void>;
  deleteCredential: () => Promise<boolean>;
}

export class PlatformStore implements CredentialStore {
  private readonly entry: SecretEntry;
  private readonly directory: string;
  constructor(entry: SecretEntry, directory: string) {
    this.entry = entry;
    this.directory = directory;
  }
  async read(): Promise<Credentials | null> {
    let value: string | null | undefined;
    try {
      value = await this.entry.getPassword();
    } catch {
      throw new Error(
        "Cannot read the OS credential store. Unlock it, or use INTH_TOKEN for unattended commands."
      );
    }
    // The native async binding returns null on macOS despite declaring undefined.
    if (value === undefined || value === null) {
      return null;
    }
    let credentials: Credentials;
    try {
      credentials = credentialsSchema.parse(JSON.parse(value));
    } catch {
      throw new Error(
        "The saved sign-in is invalid. Run `inth logout`, then `inth login` again."
      );
    }
    return credentials;
  }
  async write(credentials: Credentials): Promise<void> {
    try {
      await this.entry.setPassword(
        JSON.stringify(credentialsSchema.parse(credentials))
      );
    } catch {
      throw new Error(
        "Cannot save the sign-in in the OS credential store. Unlock it and run `inth login` again."
      );
    }
  }
  async clear(): Promise<void> {
    try {
      await this.entry.deleteCredential();
    } catch {
      throw new Error(
        "Cannot delete the saved sign-in. Unlock the OS credential store and run `inth logout` again."
      );
    }
  }
  private async acquire(deadline: number): Promise<() => Promise<void>> {
    const options = {
      realpath: false,
      stale: 60_000,
      update: 10_000,
    };
    const target = join(this.directory, "credentials");
    if (!Number.isFinite(deadline)) {
      return lockfile.lock(target, {
        ...options,
        retries: { factor: 1, maxTimeout: 250, minTimeout: 250, retries: 120 },
      });
    }
    const stopAt = Math.min(Date.now() + 30_000, deadline);
    while (Date.now() < stopAt) {
      try {
        // eslint-disable-next-line no-await-in-loop -- Retry contention only until the caller's deadline.
        return await lockfile.lock(target, { ...options, retries: 0 });
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !("code" in error) ||
          error.code !== "ELOCKED"
        ) {
          throw error;
        }
      }
      // eslint-disable-next-line no-await-in-loop -- Bound each contention wait by the remaining time.
      await setTimeout(Math.max(0, Math.min(250, stopAt - Date.now())));
    }
    throw new Error("Cannot acquire the credential lock.");
  }
  async exclusive<T>(
    work: () => Promise<T>,
    deadline = Number.POSITIVE_INFINITY
  ): Promise<T> {
    await privateDirectory(this.directory);
    const release = await this.acquire(deadline);
    try {
      if (Date.now() >= deadline) {
        throw new Error("Cannot acquire the credential lock.");
      }
      return await work();
    } finally {
      await release();
    }
  }
}

export const platformStore = (directory: string): PlatformStore =>
  new PlatformStore(new AsyncEntry("com.inth.cli.node", "oauth"), directory);
