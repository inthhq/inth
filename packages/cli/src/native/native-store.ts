/* eslint-disable no-await-in-loop -- Retry the cross-process lock without blocking the event loop. */
/* eslint-disable require-await -- Async store operations convert synchronous FFI failures into rejected promises. */
import { setTimeout } from "node:timers/promises";

import type { AuthStore, Credentials } from "../auth-types.ts";
import { diagnosticStep } from "../error-diagnostics.ts";
import { lockAcquire, lockRelease } from "./native-bindings.ts";
import type { NativeKeychain } from "./native-keychain.ts";
import { parseCredentials } from "./native-protocol.ts";

const release = (handle: number): void => {
  if (lockRelease(handle) !== 0) {
    diagnosticStep("credential_unlock");
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
      diagnosticStep("credential_decode");
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
  async exclusive(
    work: () => Promise<void>,
    requestedDeadline = Number.POSITIVE_INFINITY
  ): Promise<void> {
    diagnosticStep("credential_lock");
    this.checkAbort();
    const deadline = Math.min(Date.now() + 30_000, requestedDeadline);
    if (Date.now() >= deadline) {
      throw new Error("Cannot acquire the credential lock.");
    }
    let handle = lockAcquire(this.lockPath);
    while (handle === -2 && Date.now() < deadline) {
      await setTimeout(Math.min(25, deadline - Date.now()));
      this.checkAbort();
      if (Date.now() >= deadline) {
        break;
      }
      handle = lockAcquire(this.lockPath);
    }
    if (handle < 0) {
      throw new Error("Cannot acquire the credential lock.");
    }
    try {
      this.checkAbort();
      if (Date.now() >= requestedDeadline) {
        throw new Error("Cannot acquire the credential lock.");
      }
      await work();
    } finally {
      release(handle);
    }
  }
}
