import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { OrganizationContext } from "../experiments/node/state.ts";
import { PlatformStore } from "../experiments/node/store.ts";
import type { SecretEntry } from "../experiments/node/store.ts";
import { credentials } from "./fixtures.ts";

const directories: string[] = [];
const temporary = async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "inth-cli-test-"));
  directories.push(directory);
  return directory;
};
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  );
});

class TestEntry implements SecretEntry {
  value: string | null | undefined;
  getPassword(): Promise<string | null | undefined> {
    return Promise.resolve(this.value);
  }
  setPassword(value: string): Promise<void> {
    this.value = value;
    return Promise.resolve();
  }
  deleteCredential(): Promise<boolean> {
    this.value = undefined;
    return Promise.resolve(true);
  }
}

describe("platform credentials", () => {
  it("treats the native binding's null result as a missing credential", async () => {
    const entry = new TestEntry();
    entry.value = null;
    expect(await new PlatformStore(entry, await temporary()).read()).toBeNull();
  });
  it("stores credentials only in the OS entry and keeps lock metadata private", async () => {
    const directory = await temporary();
    const entry = new TestEntry();
    const store = new PlatformStore(entry, directory);
    await store.exclusive(() => store.write(credentials));
    expect(await store.read()).toEqual(credentials);
    expect(await readdir(directory)).toEqual([]);
    if (process.platform !== "win32") {
      const info = await stat(directory);
      expect(info.mode % 0o1000).toBe(0o700);
    }
    await store.clear();
    expect(await store.read()).toBeNull();
  });
  it("rejects corrupt credentials without printing their contents", async () => {
    const entry = new TestEntry();
    entry.value = "secret malformed JSON";
    await expect(
      new PlatformStore(entry, await temporary()).read()
    ).rejects.toThrow("saved sign-in is invalid");
  });
  it("fails closed when the credential store is unavailable", async () => {
    const entry: SecretEntry = {
      deleteCredential: () =>
        Promise.reject(new Error("private backend error")),
      getPassword: () => Promise.reject(new Error("private backend error")),
      setPassword: () => Promise.reject(new Error("private backend error")),
    };
    const directory = await temporary();
    const store = new PlatformStore(entry, directory);
    await expect(store.write(credentials)).rejects.toThrow(
      "OS credential store"
    );
    await expect(store.read()).rejects.toThrow("OS credential store");
    expect(await readdir(directory)).toEqual([]);
  });
  it("serializes real filesystem locks across store instances", async () => {
    const directory = await temporary();
    const entry = new TestEntry();
    const first = new PlatformStore(entry, directory);
    const second = new PlatformStore(entry, directory);
    const order: string[] = [];
    await Promise.all([
      first.exclusive(async () => {
        order.push("first:start");
        await first.write(credentials);
        order.push("first:end");
      }),
      second.exclusive(async () => {
        order.push("second:start");
        await second.read();
        order.push("second:end");
      }),
    ]);
    expect(order).toSatisfy(
      (items: string[]) =>
        items.join(",") === "first:start,first:end,second:start,second:end" ||
        items.join(",") === "second:start,second:end,first:start,first:end"
    );
  });
});

describe("organization context", () => {
  it("prefers flags, then the closest linked directory, then the user default", async () => {
    const directory = await temporary();
    const project = await temporary();
    const context = new OrganizationContext(directory, project);
    expect(await context.resolve()).toBeUndefined();
    await context.select("org-default");
    expect(await context.resolve()).toBe("org-default");
    await context.link("org-project");
    expect(await context.resolve()).toBe("org-project");
    expect(await context.resolve("org-flag")).toBe("org-flag");
    expect(
      await new OrganizationContext(
        directory,
        path.join(project, "src", "nested")
      ).resolve()
    ).toBe("org-project");
    expect(await readdir(path.join(project, ".inth"))).toEqual([
      "project.json",
    ]);
  });
});
