import { expect, it } from "vitest";

import { nativeTarget } from "../scripts/native-target.ts";
import { stateDirectory } from "../src/platform.ts";

it.each([
  ["darwin", "arm64"],
  ["darwin", "x64"],
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
it("preserves macOS credentials and respects platform state directories", () => {
  expect(stateDirectory("darwin", "/home/person")).toBe(
    "/home/person/Library/Application Support/inth-scriptc"
  );
  expect(stateDirectory("linux", "/home/person", undefined, "/state")).toBe(
    "/state/inth"
  );
  expect(stateDirectory("win32", "/home/person", "/appdata")).toBe(
    "/appdata/inth"
  );
});
