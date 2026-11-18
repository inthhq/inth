import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

import { releaseNames, releaseRefusals } from "./release-guard.ts";
import type { ReleaseProduct } from "./release-guard.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const products: ReleaseProduct[] = ["android", "react-native", "sdk", "swift"];

test("each product finds what it would publish", () => {
  expect(releaseNames(root, "sdk")).toContain("@inth/sdk/engine");
  expect(releaseNames(root, "sdk")).not.toContain("@c15t/build-shared");
  expect(releaseNames(root, "react-native")).toEqual(["@inth/react-native"]);
  expect(releaseNames(root, "android")).toEqual(["com.inth"]);
  expect(releaseNames(root, "swift")).toContain("InthCore");
});

test("the SDK cannot release its c15t packages, even when enabled", () => {
  const refusals = releaseRefusals(root, "sdk", "true");
  expect(refusals.join("\n")).toMatch(/c15t names/u);
});

test("the mobile products carry Inth names", () => {
  for (const product of ["android", "react-native", "swift"] as const) {
    const refusals = releaseRefusals(root, product, "true");
    expect(refusals.join("\n"), product).not.toMatch(/c15t names/u);
  }
});

test("a release that is not enabled refuses", () => {
  for (const product of products) {
    expect(releaseRefusals(root, product, "").join("\n"), product).toMatch(
      /disabled/u
    );
  }
});
