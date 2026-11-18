import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

import { publishOrder, settingProblems, tarballProblems } from "./sdk-pack.ts";
import type { Expectations, PackedPackage } from "./sdk-pack.ts";
import { sdkPackages } from "./sdk-release.ts";
import type { Manifest } from "./sdk-release.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const published = sdkPackages(root).filter(({ manifest }) => !manifest.private);

const source: Manifest = {
  dependencies: { "@inth/sdk": "workspace:*" },
  exports: { ".": { import: "./dist/index.js", types: "./dist/index.d.ts" } },
  files: ["dist", "AGENTS.md"],
  name: "@inth/react",
  publishConfig: { access: "public", tag: "alpha" },
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

test("a stable version must not keep a prerelease dist-tag", () => {
  expect(settingProblems({ ...source, version: "1.0.0" })).toEqual([
    'publishConfig.tag is set, but 1.0.0 publishes to "latest"',
  ]);
});

test("each package publishes after the packages it depends on", () => {
  const order = publishOrder(published).map(({ manifest }) => manifest.name);
  expect(order[0]).toBe("@inth/sdk");
  expect(order.indexOf("@inth/react")).toBeLessThan(
    order.indexOf("@inth/nextjs")
  );
  expect(order.indexOf("@inth/vue")).toBeLessThan(order.indexOf("@inth/nuxt"));
  expect(order.indexOf("@inth/svelte")).toBeLessThan(
    order.indexOf("@inth/astro")
  );
});

test("every published SDK package has the publish settings its version needs", () => {
  for (const { manifest } of published) {
    expect(settingProblems(manifest), manifest.name).toEqual([]);
  }
});
