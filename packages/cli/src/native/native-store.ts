/* eslint-disable no-await-in-loop -- Retry the cross-process lock without blocking the event loop. */
/* eslint-disable require-await -- Async store operations convert synchronous FFI failures into rejected promises. */
import { setTimeout } from "node:timers/promises";

import type { AuthStore, Credentials } from "../auth-types.ts";
import { lockAcquire, lockRelease } from "./native-bindings.ts";
import type { NativeKeychain } from "./native-keychain.ts";
import { parseCredentials } from "./native-protocol.ts";

const release = (handle: number): void => {
  if (lockRelease(handle) !== 0) {
    throw new Error("Cannot release the credential lock.");
  }
};
export class NativeStore implements AuthStore {
  private readonly entry: NativeKeychain;
  private readonly lockPath: string;
  private readonly observe: (token: string) => void;
  private readonly checkAbort: () => void;
  constructor(
    entry: NativeKeychain,
    lockPath: string,
    checkAbort: () => void = () => {
      // Benchmarks and isolated store callers may have no cancellation source.
    },
    observe: (token: string) => void = () => {
      // Most credential-store callers do not need to observe the active token.
    }
  ) {
    this.observe = observe;
    this.entry = entry;
    this.lockPath = lockPath;
    this.checkAbort = checkAbort;
  }
  adapter(): AuthStore {
    return {
      clear: () => this.clear(),
      exclusive: (work) => this.exclusive(work),
      read: () => this.read(),
      write: (value) => this.write(value),
    };
  }
  async read(): Promise<Credentials | null> {
    const value = this.entry.read();
    if (value === null) {
      this.observe("");
      return null;
    }
    try {
      const credentials = parseCredentials(value);
      this.observe(credentials.access_token);
      return credentials;
    } catch {
      throw new Error(
        "The saved sign-in is invalid. Run inth logout, then inth login."
      );
    }
  }
  async write(value: Credentials): Promise<void> {
    const encoded = JSON.stringify(value);
    parseCredentials(encoded);
    this.entry.write(encoded);
    this.observe(value.access_token);
  }
  async clear(): Promise<void> {
    this.entry.clear();
    this.observe("");
  }
  async exclusive(work: () => Promise<void>): Promise<void> {
    this.checkAbort();
    const deadline = Date.now() + 30_000;
    let handle = lockAcquire(this.lockPath);
    while (handle === -2 && Date.now() < deadline) {
      await setTimeout(25);
      this.checkAbort();
      handle = lockAcquire(this.lockPath);
    }
    if (handle < 0) {
      throw new Error("Cannot acquire the credential lock.");
    }
    try {
      this.checkAbort();
      await work();
    } finally {
      release(handle);
    }
  }
}
