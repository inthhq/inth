import path from "node:path";

import { expect, it } from "vitest";

import { nativeTarget } from "../scripts/native-target.ts";
import { stateDirectory } from "../src/platform.ts";

it.each([
  ["darwin", "arm64"],
  ["linux", "arm64"],
  ["linux", "x64"],
  ["win32", "x64"],
])("selects adapters for %s %s", (platform, arch) => {
  const target = nativeTarget(platform, arch);
  expect(target.platform).toBe(platform);
  expect(target.executable).toBe(platform === "win32" ? "inth.exe" : "inth");
  let source = "native-secret-macos";
  if (platform === "win32") {
    source = "native-windows";
  }
  if (platform === "linux") {
    source = "native-secret-linux";
  }
  expect(target.sources).toContain(source);
});
it("requires a cross toolchain and rejects unsupported targets", () => {
  expect(() => nativeTarget("darwin", "arm64", "x86_64-windows-gnu")).toThrow(
    "zigcc"
  );
  expect(
    nativeTarget("darwin", "arm64", "x86_64-windows-gnu", "zigcc")
      .systemLibraries
  ).toContain("advapi32");
  expect(() => nativeTarget("win32", "arm64")).toThrow("Unsupported");
});
it("rejects Intel Macs and cross-compilation to Intel macOS", () => {
  expect(() => nativeTarget("darwin", "x64")).toThrow("Apple silicon");
  expect(() =>
    nativeTarget("darwin", "arm64", "x86_64-macos", "zigcc")
  ).toThrow("Apple silicon");
});
it("respects platform state directories", () => {
  expect(stateDirectory("darwin", "/home/person")).toBe(
    path.join("/home/person", "Library", "Application Support", "com.inth.cli")
  );
  expect(stateDirectory("linux", "/home/person", undefined, "/state")).toBe(
    path.join("/state", "inth")
  );
  expect(stateDirectory("win32", "/home/person", "/appdata")).toBe(
    path.join("/appdata", "com.inth.cli")
  );
});

it("ignores relative state roots", () => {
  expect(stateDirectory("linux", "/home/person", undefined, "relative")).toBe(
    stateDirectory("linux", "/home/person")
  );
  expect(stateDirectory("win32", "/home/person", "relative")).toBe(
    stateDirectory("win32", "/home/person")
  );
});
