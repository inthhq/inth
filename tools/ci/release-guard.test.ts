import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

import { releaseNames, releaseRefusals } from "./release-guard.ts";
import type { ReleaseProduct } from "./release-guard.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const products: ReleaseProduct[] = ["android", "react-native", "sdk", "swift"];

test("each product finds what it would publish", () => {
  expect(releaseNames(root, "sdk")).toContain("@c15t/core");
  expect(releaseNames(root, "sdk")).not.toContain("@c15t/build-shared");
  expect(releaseNames(root, "react-native")).toEqual(["@c15t/react-native"]);
  expect(releaseNames(root, "android")).toEqual(["com.c15t"]);
  expect(releaseNames(root, "swift")).toContain("C15tCore");
});

test("no product can release c15t artifacts, even when enabled", () => {
  for (const product of products) {
    const refusals = releaseRefusals(root, product, "true");
    expect(refusals.join("\n"), product).toMatch(/c15t names/u);
  }
});

test("a release that is not enabled refuses", () => {
  for (const product of products) {
    expect(releaseRefusals(root, product, "").join("\n"), product).toMatch(
      /disabled/u
    );
  }
});
