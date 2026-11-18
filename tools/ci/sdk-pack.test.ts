import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

import {
  publishOrder,
  sdkDistTag,
  sdkPackages,
  tarballProblems,
} from "./sdk-pack.ts";
import type { Expectations, Manifest, PackedPackage } from "./sdk-pack.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));

const source: Manifest = {
  dependencies: { "@inth/sdk": "workspace:*" },
  exports: { ".": { import: "./dist/index.js", types: "./dist/index.d.ts" } },
  files: ["dist", "AGENTS.md"],
  name: "@inth/react",
  publishConfig: { access: "public", tag: sdkDistTag },
  version: "0.0.0-alpha.0",
};

const expectations: Expectations = {
  privateNames: new Set(["@inth/sdk-core", "inth"]),
  source,
  versions: new Map([
    ["@inth/react", "0.0.0-alpha.0"],
    ["@inth/sdk", "0.0.0-alpha.0"],
  ]),
};

const packed = (
  manifest: Partial<Manifest>,
  code: Record<string, string> = {}
): PackedPackage => ({
  code: new Map(Object.entries(code)),
  files: ["package.json", "AGENTS.md", "dist/index.js", "dist/index.d.ts"],
  manifest: {
    ...source,
    dependencies: { "@inth/sdk": "0.0.0-alpha.0" },
    ...manifest,
  },
});

test("a tarball as pnpm packs it passes", () => {
  expect(
    tarballProblems(
      packed({}, { "dist/index.js": 'export const name = "inth";' }),
      expectations
    )
  ).toEqual([]);
});

test("a tarball that would install wrong is refused", () => {
  const problems = tarballProblems(
    {
      ...packed(
        {
          dependencies: {
            "@inth/sdk": "workspace:*",
            "@inth/sdk-core": "0.0.0-alpha.0",
          },
          devDependencies: { "@c15t/vitest-config": "workspace:*" },
          publishConfig: { access: "public" },
        },
        { "dist/index.js": 'import { version } from "@inth/sdk-core/version";' }
      ),
      files: ["package.json", "dist/index.js"],
    },
    expectations
  );
  expect(problems).toEqual([
    'publishConfig.tag is not "alpha"',
    "dependencies keeps @inth/sdk@workspace:*",
    "devDependencies keeps @c15t/vitest-config@workspace:*",
    "dependencies asks for @inth/sdk@workspace:*, which publishes 0.0.0-alpha.0",
    "dependencies names the private package @inth/sdk-core",
    "files lists AGENTS.md, which is not in the tarball",
    "entry point dist/index.d.ts is not in the tarball",
    'dist/index.js imports the private package from "@inth/sdk-core/version"',
  ]);
});

test("each package publishes after the packages it depends on", () => {
  const order = publishOrder(sdkPackages(root).map(({ manifest }) => manifest));
  expect(order[0]).toBe("@inth/sdk");
  expect(order.indexOf("@inth/react")).toBeLessThan(
    order.indexOf("@inth/nextjs")
  );
  expect(order.indexOf("@inth/vue")).toBeLessThan(order.indexOf("@inth/nuxt"));
  expect(order.indexOf("@inth/svelte")).toBeLessThan(
    order.indexOf("@inth/astro")
  );
  expect(order).not.toContain("@inth/sdk-core");
});

test("every published SDK package carries the prerelease settings", () => {
  for (const { manifest } of sdkPackages(root)) {
    expect(manifest.publishConfig, manifest.name).toEqual({
      access: "public",
      tag: sdkDistTag,
    });
  }
});
