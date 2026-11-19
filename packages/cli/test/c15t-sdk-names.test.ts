import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { PARTS } from "../../sdk/shared/sdk-parts.ts";
import {
  boilerplateFrameworks,
  generateBoilerplateTemplate,
} from "../vendor/c15t/generate/index.ts";

const sdkRoot = fileURLToPath(new URL("../../sdk/", import.meta.url));

const packageDirectories = new Map<string, string[]>([
  ["@inth/sdk", PARTS.map((part) => path.join(sdkRoot, part))],
]);
for (const entry of readdirSync(sdkRoot)) {
  const manifest = path.join(sdkRoot, entry, "package.json");
  if (existsSync(manifest)) {
    const { name } = JSON.parse(readFileSync(manifest, "utf-8"));
    if (!packageDirectories.has(name)) {
      packageDirectories.set(name, [path.join(sdkRoot, entry)]);
    }
  }
}

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { recursive: true, withFileTypes: true })
    .map((file) => path.join(file.parentPath, file.name))
    .filter(
      (file) =>
        /\.(?:ts|tsx|svelte)$/u.test(file) &&
        !/__tests__|\.test\.|\.spec\./u.test(file)
    );

const DECLARATION =
  /export\s+(?:declare\s+)?(?:async\s+)?(?:const|let|function\*?|class|interface|type|enum)\s+(?<name>[\w$]+)/gu;
const EXPORT_LIST = /export\s+(?:type\s+)?\{(?<list>[^}]*)\}/gu;
const STAR_EXPORT =
  /export\s+\*\s+from\s+['"](?<pkg>@inth\/[\w-]+)[^'"]*['"]/gu;
const NAMED_IMPORT =
  /import\s+(?:type\s+)?\{(?<list>[^}]*)\}\s+from\s+['"](?<pkg>@inth\/[\w-]+)[^'"]*['"]/gu;

const exportedNames = new Map<string, Set<string>>();

/**
 * Every name a package's sources export, followed through `export *` from
 * other `@inth` packages. Package-wide rather than per subpath: enough to
 * catch a template that names something the SDK no longer has.
 */
const namesOf = (pkg: string): Set<string> => {
  const cached = exportedNames.get(pkg);
  if (cached) {
    return cached;
  }
  const names = new Set<string>();
  exportedNames.set(pkg, names);
  for (const directory of packageDirectories.get(pkg) ?? []) {
    const src = path.join(directory, "src");
    if (!existsSync(src)) {
      continue;
    }
    for (const file of sourceFiles(src)) {
      const source = readFileSync(file, "utf-8");
      for (const { groups } of source.matchAll(DECLARATION)) {
        names.add(groups?.name ?? "");
      }
      for (const { groups } of source.matchAll(EXPORT_LIST)) {
        for (const specifier of (groups?.list ?? "").split(",")) {
          const name = specifier
            .trim()
            .split(/\s+as\s+/u)
            .at(-1)
            ?.replace(/^type\s+/u, "");
          if (name) {
            names.add(name);
          }
        }
      }
      for (const { groups } of source.matchAll(STAR_EXPORT)) {
        for (const name of namesOf(groups?.pkg ?? "")) {
          names.add(name);
        }
      }
    }
  }
  return names;
};

/** `[name, package]` for each named import from an `@inth` package. */
const inthImports = (source: string): [string, string][] =>
  [...source.matchAll(NAMED_IMPORT)].flatMap(({ groups }) =>
    (groups?.list ?? "")
      .split(",")
      .map(
        (specifier) =>
          specifier
            .trim()
            .replace(/^type\s+/u, "")
            .split(/\s+as\s+/u)[0] ?? ""
      )
      .filter(Boolean)
      .map((name): [string, string] => [name, groups?.pkg ?? ""])
  );

describe("the code inth c15t setup generates", () => {
  it.each(boilerplateFrameworks)(
    "imports only names the SDK exports for %s",
    (framework) => {
      const template = generateBoilerplateTemplate({
        backendURL: "https://your-project.inth.app",
        framework,
        mode: "hosted",
        scripts: ["posthog"],
      });
      const missing = Object.entries(template.files).flatMap(
        ([file, content]) =>
          inthImports(content)
            .filter(([name, pkg]) => !namesOf(pkg).has(name))
            .map(([name, pkg]) => `${file}: ${name} from ${pkg}`)
      );
      expect(missing).toEqual([]);
    }
  );
});
