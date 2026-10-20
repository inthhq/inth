import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
// eslint-disable-next-line unicorn/import-style -- Matches the native sources.
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runScriptsToIntegrationsCodemod } from "../../src/native/c15t-codemods/scripts-to-integrations.ts";

const directories: string[] = [];
const fixture = async (source: string, extension = "ts") => {
  const projectRoot = await mkdtemp(join(tmpdir(), "c15t-integration-rename-"));
  directories.push(projectRoot);
  const filePath = join(projectRoot, `config.${extension}`);
  await writeFile(filePath, source);
  return { filePath, projectRoot };
};

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  );
});

describe("scripts-to-integrations", { timeout: 20_000 }, () => {
  it.each(["node:module", "module"])(
    "migrates createRequire bindings imported from %s without changing shadowed calls",
    async (moduleName) => {
      const source = `import { createRequire as makeRequire } from '${moduleName}';
const require = makeRequire(import.meta.url);
const posthog = require('@c15t/scripts/posthog');
function custom(require: (value: string) => string) {
  return require('@c15t/scripts/events');
}
`;
      const { filePath, projectRoot } = await fixture(source);
      const result = await runScriptsToIntegrationsCodemod({
        dryRun: false,
        projectRoot,
      });
      expect(result.errors).toEqual([]);
      expect(await readFile(filePath, "utf-8")).toBe(
        source.replace("@c15t/scripts/posthog", "@c15t/integrations/posthog")
      );
    }
  );

  it.each(["mts", "cts", "mjs", "cjs"])(
    "migrates .%s files",
    async (extension) => {
      const source = "const events = require('@c15t/scripts/events');\n";
      const { filePath, projectRoot } = await fixture(source, extension);
      const result = await runScriptsToIntegrationsCodemod({
        dryRun: false,
        projectRoot,
      });
      expect(result.errors).toEqual([]);
      expect(await readFile(filePath, "utf-8")).toBe(
        source.replace("@c15t/scripts", "@c15t/integrations")
      );
    }
  );

  it.each([
    ["namespace", "import * as module from 'node:module';"],
    ["default", "import module from 'module';"],
  ])(
    "migrates createRequire reached through a %s import",
    async (_form, importLine) => {
      const source = `${importLine}
const require = module.createRequire(import.meta.url);
const events = require('@c15t/scripts/events');
`;
      const { filePath, projectRoot } = await fixture(source);
      const result = await runScriptsToIntegrationsCodemod({
        dryRun: false,
        projectRoot,
      });
      expect(result.errors).toEqual([]);
      expect(await readFile(filePath, "utf-8")).toBe(
        source.replace("@c15t/scripts/events", "@c15t/integrations/events")
      );
    }
  );

  it.each([
    "createRequire(import.meta.url) as NodeRequire",
    "createRequire(import.meta.url) satisfies NodeRequire",
    "(createRequire(import.meta.url))",
    "createRequire(import.meta.url)!",
    "<NodeRequire>createRequire(import.meta.url)",
  ])("migrates a require binding initialised with %s", async (initializer) => {
    const source = `import { createRequire } from 'node:module';
const require = ${initializer};
const events = require('@c15t/scripts/events');
`;
    const { filePath, projectRoot } = await fixture(source);
    const result = await runScriptsToIntegrationsCodemod({
      dryRun: false,
      projectRoot,
    });
    expect(result.errors).toEqual([]);
    expect(await readFile(filePath, "utf-8")).toBe(
      source.replace("@c15t/scripts/events", "@c15t/integrations/events")
    );
  });

  it("leaves createRequire on a local module object untouched", async () => {
    const source = `const createRequire = (_url: string) => (value: string) => value;
const module = { createRequire };
const require = module.createRequire(import.meta.url);
const value = require('@c15t/scripts/events');
`;
    const { filePath, projectRoot } = await fixture(source);
    const result = await runScriptsToIntegrationsCodemod({
      dryRun: false,
      projectRoot,
    });
    expect(result.errors).toEqual([]);
    expect(await readFile(filePath, "utf-8")).toBe(source);
  });

  it("leaves a custom createRequire function untouched", async () => {
    const source = `const createRequire = (_url: string) => (value: string) => value;
const require = createRequire(import.meta.url);
const value = require('@c15t/scripts/events');
`;
    const { filePath, projectRoot } = await fixture(source);
    const result = await runScriptsToIntegrationsCodemod({
      dryRun: false,
      projectRoot,
    });
    expect(result.errors).toEqual([]);
    expect(result.changedFiles).toEqual([]);
    expect(await readFile(filePath, "utf-8")).toBe(source);
  });

  it("rewrites imports, re-exports, dynamic imports, require calls and import types", async () => {
    const source = `import { posthog as analytics } from '@c15t/scripts/posthog';
import type { VendorManifest } from '@c15t/scripts/types';
import '@c15t/scripts/events';
export { gtag } from '@c15t/scripts/google-tag';
export * from '@c15t/scripts/registry';
const lazy = import('@c15t/scripts/meta-pixel');
const events = require('@c15t/scripts/events');
type Manifest = import('@c15t/scripts/types').VendorManifest;
const scripts = [analytics({ token: 'test' })];
`;
    const { filePath, projectRoot } = await fixture(source);
    const result = await runScriptsToIntegrationsCodemod({
      dryRun: false,
      projectRoot,
    });
    expect(result.errors).toEqual([]);
    expect(result.changedFiles).toHaveLength(1);
    expect(result.changedFiles[0]?.operations).toBe(8);
    expect(await readFile(filePath, "utf-8")).toBe(
      source.replaceAll("@c15t/scripts/", "@c15t/integrations/")
    );
    const rerun = await runScriptsToIntegrationsCodemod({
      dryRun: false,
      projectRoot,
    });
    expect(rerun.changedFiles).toEqual([]);
  });

  it("rewrites test-runner mocks and require.resolve", async () => {
    const source = `import { vi as test } from 'vitest';
test.mock('@c15t/scripts/posthog');
const actual = await vi.importActual('@c15t/scripts/events');
jest.mock('@c15t/scripts');
const path = require.resolve('@c15t/scripts/meta-pixel');
`;
    const { filePath, projectRoot } = await fixture(source);
    const result = await runScriptsToIntegrationsCodemod({
      dryRun: false,
      projectRoot,
    });
    expect(result.errors).toEqual([]);
    expect(result.changedFiles[0]?.operations).toBe(4);
    expect(await readFile(filePath, "utf-8")).toBe(
      source.replaceAll("@c15t/scripts", "@c15t/integrations")
    );
  });

  it("rewrites TypeScript import equals declarations", async () => {
    const source = `import posthog = require('@c15t/scripts/posthog');
export = posthog;
`;
    const { filePath, projectRoot } = await fixture(source, "cts");
    const result = await runScriptsToIntegrationsCodemod({
      dryRun: false,
      projectRoot,
    });
    expect(result.errors).toEqual([]);
    expect(await readFile(filePath, "utf-8")).toBe(
      source.replace("@c15t/scripts", "@c15t/integrations")
    );
  });

  it("leaves mocks on a local vi object alone", async () => {
    const source = `const vi = { mock: (_path: string) => undefined };
vi.mock('@c15t/scripts/posthog');
`;
    const { filePath, projectRoot } = await fixture(source);
    const result = await runScriptsToIntegrationsCodemod({
      dryRun: false,
      projectRoot,
    });
    expect(result.errors).toEqual([]);
    expect(result.changedFiles).toEqual([]);
    expect(await readFile(filePath, "utf-8")).toBe(source);
  });

  it("previews JavaScript changes without saving files", async () => {
    const source = `export { posthog } from '@c15t/scripts/posthog';\n`;
    const { filePath, projectRoot } = await fixture(source, "js");
    const result = await runScriptsToIntegrationsCodemod({
      dryRun: true,
      projectRoot,
    });
    expect(result.errors).toEqual([]);
    expect(result.changedFiles[0]).toMatchObject({
      after: source.replace("@c15t/scripts", "@c15t/integrations"),
      before: source,
    });
    expect(await readFile(filePath, "utf-8")).toBe(source);
  });

  it("leaves unrelated packages, strings, comments and shadowed require calls alone", async () => {
    const source = `import '@c15t/scripts-extra';
import { posthog } from '@c15t/integrations/posthog';
const example = '@c15t/scripts/posthog';
// import '@c15t/scripts/events';
function custom(require: (value: string) => string) {
  return require('@c15t/scripts/events');
}
`;
    const { filePath, projectRoot } = await fixture(source);
    const result = await runScriptsToIntegrationsCodemod({
      dryRun: false,
      projectRoot,
    });
    expect(result.errors).toEqual([]);
    expect(result.changedFiles).toEqual([]);
    expect(await readFile(filePath, "utf-8")).toBe(source);
  });
});
