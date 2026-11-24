import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "vite-plus/test";

import {
  computeCliCacheKey,
  extractCliLockfileInputs,
} from "./cli-cache-key.ts";

const tempDirs: string[] = [];

const makeRepo = (files: Record<string, string>): string => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "inth-cli-cache-key-"));
  tempDirs.push(dir);
  for (const [relative, content] of Object.entries(files)) {
    const full = path.join(dir, relative);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
};

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

const baseLockfile = `lockfileVersion: '9.0'
importers:
  packages/cli:
    devDependencies:
      '@scriptc/compiler':
        specifier: 0.3.6
        version: 0.3.6(patch_hash=abc)
      tsrs:
        specifier: 'catalog:'
        version: 7.1.0-beta.tsrs4
  packages/sdk/core:
    dependencies:
      valibot:
        specifier: 1.0.0
        version: 1.0.0
packages:
  '@scriptc/compiler@0.3.6':
    resolution: {integrity: sha512-aaa}
  valibot@1.0.0:
    resolution: {integrity: sha512-bbb}
`;

const baseRepo = {
  ".node-version": "24.13.1\n",
  "docs/cli/index.mdx": "# CLI\n",
  "npm/cli-linux-x64/package.json": '{"name":"@inth/cli-linux-x64"}\n',
  "packages/cli/package.json": '{"name":"@inth/cli","version":"0.0.8"}\n',
  "packages/cli/src/inth.ts": "export const main = () => 0;\n",
  "patches/@scriptc__compiler@0.3.6.patch": "--- a\n+++ b\n",
  "pnpm-lock.yaml": baseLockfile,
};

describe("computeCliCacheKey", () => {
  test("ignores unrelated SDK files, build artifacts, mobile vendor, and non-CLI lockfile edits", () => {
    const first = makeRepo(baseRepo);
    const second = makeRepo({
      ...baseRepo,
      "apps/storybook-react/src/story.tsx": "export default {};\n",
      "packages/cli/artifacts/inth.tgz": "cached-tgz",
      "packages/cli/build/native/inth": "binary",
      "packages/cli/dist/inth": "binary",
      "packages/cli/vendor/c15t-mobile/index.ts": "export const mobile = 1;\n",
      "packages/sdk/react/src/index.ts": "export const react = 1;\n",
      "pnpm-lock.yaml": baseLockfile.replace("1.0.0", "2.0.0"),
    });

    expect(computeCliCacheKey({ root: first })).toBe(
      computeCliCacheKey({ root: second })
    );
  });

  test("changes when CLI sources, npm wrappers, docs, patches, lockfile CLI deps, or target env change", () => {
    const baseline = computeCliCacheKey({
      env: { SCRIPTC_CC: "zigcc", SCRIPTC_TARGET: "x86_64-linux-gnu.2.36" },
      root: makeRepo(baseRepo),
    });

    const cliSourceChanged = computeCliCacheKey({
      env: { SCRIPTC_CC: "zigcc", SCRIPTC_TARGET: "x86_64-linux-gnu.2.36" },
      root: makeRepo({
        ...baseRepo,
        "packages/cli/src/inth.ts": "export const main = () => 1;\n",
      }),
    });
    expect(cliSourceChanged).not.toBe(baseline);

    const npmPackageChanged = computeCliCacheKey({
      env: { SCRIPTC_CC: "zigcc", SCRIPTC_TARGET: "x86_64-linux-gnu.2.36" },
      root: makeRepo({
        ...baseRepo,
        "npm/cli-linux-x64/package.json":
          '{"name":"@inth/cli-linux-x64","version":"0.0.9"}\n',
      }),
    });
    expect(npmPackageChanged).not.toBe(baseline);

    const docsChanged = computeCliCacheKey({
      env: { SCRIPTC_CC: "zigcc", SCRIPTC_TARGET: "x86_64-linux-gnu.2.36" },
      root: makeRepo({
        ...baseRepo,
        "docs/cli/index.mdx": "# Updated CLI\n",
      }),
    });
    expect(docsChanged).not.toBe(baseline);

    const patchChanged = computeCliCacheKey({
      env: { SCRIPTC_CC: "zigcc", SCRIPTC_TARGET: "x86_64-linux-gnu.2.36" },
      root: makeRepo({
        ...baseRepo,
        "patches/@scriptc__compiler@0.3.6.patch": "--- a\n+++ c\n",
      }),
    });
    expect(patchChanged).not.toBe(baseline);

    const cliDepChanged = computeCliCacheKey({
      env: { SCRIPTC_CC: "zigcc", SCRIPTC_TARGET: "x86_64-linux-gnu.2.36" },
      root: makeRepo({
        ...baseRepo,
        "pnpm-lock.yaml": baseLockfile.replace("tsrs4", "tsrs5"),
      }),
    });
    expect(cliDepChanged).not.toBe(baseline);

    const scriptcPackageChanged = computeCliCacheKey({
      env: { SCRIPTC_CC: "zigcc", SCRIPTC_TARGET: "x86_64-linux-gnu.2.36" },
      root: makeRepo({
        ...baseRepo,
        "pnpm-lock.yaml": baseLockfile.replace("sha512-aaa", "sha512-zzz"),
      }),
    });
    expect(scriptcPackageChanged).not.toBe(baseline);

    const targetChanged = computeCliCacheKey({
      env: { SCRIPTC_CC: "zigcc", SCRIPTC_TARGET: "aarch64-linux-gnu.2.36" },
      root: makeRepo(baseRepo),
    });
    expect(targetChanged).not.toBe(baseline);
  });

  test("extractCliLockfileInputs keeps only packages/cli and @scriptc/* blocks", () => {
    const extracted = extractCliLockfileInputs(baseLockfile);
    expect(extracted).toContain("packages/cli:");
    expect(extracted).toContain("@scriptc/compiler@0.3.6");
    expect(extracted).not.toContain("packages/sdk/core");
    expect(extracted).not.toContain("valibot@1.0.0");
  });
});
