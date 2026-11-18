import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

import { createSdkRelease, releaseArgv, sdkPackages } from "./sdk-release.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));

test("the SDK release versions the @inth packages in packages/sdk and nothing else", async () => {
  const { graph } = await createSdkRelease(root)._internal.context();
  const members = graph
    .getPackages()
    .filter((pkg) => pkg.options?.group === "sdk")
    .map((pkg) => pkg.name);
  expect(
    graph
      .getPackages()
      .map((pkg) => pkg.name)
      .toSorted()
  ).toEqual(members.toSorted());
  expect(members.toSorted()).toEqual(
    sdkPackages(root)
      .map(({ manifest }) => manifest.name)
      .toSorted()
  );
  for (const name of ["@inth/cli", "@inth/react-native", "inth"]) {
    expect(members, name).not.toContain(name);
  }
});

test("a release finishes a pending publish before it drafts a new version", () => {
  expect(releaseArgv("pending", ["--dry-run"])).toEqual([
    "publish",
    "--dry-run",
  ]);
  expect(releaseArgv("success", [])).toEqual(["ci"]);
  expect(releaseArgv("none", [])).toEqual(["ci"]);
});

// Tegami writes these entries when it versions. A publish lock written any
// other way skips them, and the release ships without its notes.
test("each published SDK package's changelog starts with its version", () => {
  for (const { dir, manifest } of sdkPackages(root)) {
    if (manifest.private) {
      continue;
    }
    const tag = manifest.publishConfig?.tag;
    expect(
      readFileSync(path.join(dir, "CHANGELOG.md"), "utf-8").split("\n")[0],
      manifest.name
    ).toBe(`## ${manifest.name}@${manifest.version}${tag ? ` (${tag})` : ""}`);
  }
});
