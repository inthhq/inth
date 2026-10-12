import { existsSync, readFileSync } from "node:fs";
// eslint-disable-next-line unicorn/import-style -- Scriptc requires named node:path imports.
import { join } from "node:path";

import type {
  FileMerge,
  GenerationPlan,
} from "../../vendor/c15t/generate/index.ts";
import type { PackageManifest } from "../c15t.ts";
import { withoutConfigComments } from "./c15t-config.ts";

const nuxtSource = (cwd: string, config?: string): string => {
  if (config) {
    const contents = withoutConfigComments(
      readFileSync(join(cwd, config), "utf-8")
    );
    if (
      /(?:["']?\bsrcDir\b["']?\s*:|\.srcDir\s*=|\[\s*["']srcDir["']\s*\]\s*=|\bsrcDir\b\s*[,}])/u.test(
        contents
      )
    ) {
      const match =
        /["']?\bsrcDir\b["']?\s*:\s*["'](?<source>[^"']*)["']\s*(?:[,}]|$)/u.exec(
          contents
        );
      const source = match ? match.groups?.source : undefined;
      if (
        source === undefined ||
        !/^[\w./-]*$/u.test(source) ||
        source.startsWith("/") ||
        source.split("/").includes("..")
      ) {
        throw new Error(
          "Cannot verify the Nuxt srcDir. Use agent setup to integrate c15t with a computed or external source directory."
        );
      }
      const directory = source
        .split("/")
        .filter((part) => part && part !== ".")
        .join("/");
      return directory ? `${directory}/` : "";
    }
  }
  const manifest: PackageManifest = JSON.parse(
    readFileSync(join(cwd, "package.json"), "utf-8")
  );
  const installedPath = join(cwd, "node_modules", "nuxt", "package.json");
  let version =
    manifest.dependencies?.nuxt ?? manifest.devDependencies?.nuxt ?? "";
  if (existsSync(installedPath)) {
    const { version: installedVersion }: { version: string } = JSON.parse(
      readFileSync(installedPath, "utf-8")
    );
    version = installedVersion;
  }
  if (
    existsSync(join(cwd, "app", "app.vue")) &&
    !existsSync(join(cwd, "app.vue"))
  ) {
    return "app/";
  }
  if (/^[~^]?\s*3(?:\.|$)/u.test(version)) {
    return "";
  }
  if (
    !existsSync(join(cwd, "app", "app.vue")) &&
    existsSync(join(cwd, "app.vue"))
  ) {
    return "";
  }
  return "app/";
};

/** Keep Nuxt templates in the active source directory and preserve app config. */
export const adaptNuxtGeneration = (
  generation: GenerationPlan,
  cwd: string
): void => {
  if (!Object.hasOwn(generation.files, "nuxt.config.ts")) {
    return;
  }
  const config = ["nuxt.config.ts", "nuxt.config.js", "nuxt.config.mjs"].find(
    (name) => existsSync(join(cwd, name))
  );
  const source = nuxtSource(cwd, config);
  const files: Record<string, string> = {};
  const merge: Record<string, FileMerge> = {};
  for (const [name, content] of Object.entries(generation.files)) {
    const target = name.startsWith("app/") ? `${source}${name.slice(4)}` : name;
    files[target] = content;
    const rule = generation.merge?.[name];
    if (rule) {
      merge[target] = rule;
    }
    if (name.startsWith("app/") && existsSync(join(cwd, target))) {
      merge[target] = { type: "keep" };
      if (target.endsWith("app.vue")) {
        generation.instructions.push(
          `Integrate c15t into ${target}: keep your existing app content and providers. Add <ConsentRoot /> and a <ConsentDialogLink>Privacy settings</ConsentDialogLink> where users can open their preferences.`
        );
      } else if (target.endsWith("app.config.ts")) {
        generation.instructions.push(
          `Update ${target}: merge the generated c15t vendor settings with your existing app config.`
        );
      }
    }
  }
  generation.files = files;
  generation.merge = merge;
  generation.instructions = generation.instructions.map((instruction) =>
    instruction.replaceAll("app/app.config.ts", `${source}app.config.ts`)
  );
  if (config) {
    const template = generation.files["nuxt.config.ts"];
    if (!template) {
      throw new Error("Nuxt scaffolding requires a config template.");
    }
    delete generation.files["nuxt.config.ts"];
    generation.files[config] = template;
    generation.merge[config] = { type: "keep" };
    generation.instructions = generation.instructions.map((instruction) =>
      instruction.replaceAll("nuxt.config.ts", config)
    );
    generation.instructions.push(
      `Update ${config}: add 'c15t/vue' to the modules list if it is not already present. Keep your existing modules and config options.`
    );
  }
};
