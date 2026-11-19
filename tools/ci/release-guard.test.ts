import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

import { releaseNames, releaseRefusals } from "./release-guard.ts";
import type { ReleaseProduct } from "./release-guard.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const products: ReleaseProduct[] = ["android", "react-native", "sdk", "swift"];

test("each product finds what it would publish", () => {
  expect(releaseNames(root, "sdk")).toContain("@inth/sdk");
  expect(releaseNames(root, "sdk")).toContain("@inth/nuxt");
  expect(releaseNames(root, "sdk")).not.toContain("@inth/sdk-core");
  expect(releaseNames(root, "sdk")).not.toContain("@inth/build-shared");
  expect(releaseNames(root, "react-native")).toEqual(["@inth/react-native"]);
  expect(releaseNames(root, "android")).toEqual(["com.inth"]);
  expect(releaseNames(root, "swift")).toContain("InthCore");
});

test("every product carries Inth names", () => {
  for (const product of products) {
    const refusals = releaseRefusals(root, product, "true");
    expect(refusals.join("\n"), product).not.toMatch(/c15t names/u);
  }
});

test("a package with a c15t name refuses, even when enabled", () => {
  const fixture = mkdtempSync(path.join(tmpdir(), "release-guard-"));
  try {
    mkdirSync(path.join(fixture, "packages/react-native"), { recursive: true });
    writeFileSync(
      path.join(fixture, "packages/react-native/package.json"),
      JSON.stringify({ name: "@c15t/react-native" })
    );
    expect(releaseRefusals(fixture, "react-native", "true").join("\n")).toMatch(
      /c15t names/u
    );
  } finally {
    rmSync(fixture, { force: true, recursive: true });
  }
});

test("a release that is not enabled refuses", () => {
  for (const product of products) {
    expect(releaseRefusals(root, product, "").join("\n"), product).toMatch(
      /disabled/u
    );
  }
});
