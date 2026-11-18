import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

import { sdkPackages } from "./sdk-pack.ts";
import { sdkParts, sdkPublished, sdkReleaseIgnore } from "./sdk-release.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));

const ignored = (name: string) =>
  sdkReleaseIgnore.some((pattern) =>
    pattern instanceof RegExp ? pattern.test(name) : pattern === name
  );

test("Tegami releases every SDK package that publishes", () => {
  const published = sdkPackages(root).map(({ manifest }) => manifest.name);
  expect([...sdkPublished].toSorted()).toEqual(published.toSorted());
});

test("Tegami bumps every private part @inth/sdk ships", () => {
  const directory = path.join(root, "packages/sdk");
  const parts = readdirSync(directory)
    .flatMap((folder) => {
      try {
        return [
          JSON.parse(
            readFileSync(path.join(directory, folder, "package.json"), "utf-8")
          ),
        ];
      } catch {
        return [];
      }
    })
    .filter(
      (manifest) => manifest.private && manifest.name.startsWith("@inth/sdk-")
    )
    .map((manifest) => manifest.name);
  expect([...sdkParts].toSorted()).toEqual(parts.toSorted());
});

test("the SDK release leaves out the CLI and React Native", () => {
  for (const name of [...sdkPublished, ...sdkParts]) {
    expect(ignored(name), name).toBe(false);
    expect(ignored(`npm:${name}`), name).toBe(false);
  }
  for (const name of [
    "@inth/cli",
    "@inth/cli-linux-x64",
    "@inth/react-native",
    "inth",
  ]) {
    expect(ignored(name), name).toBe(true);
  }
});
