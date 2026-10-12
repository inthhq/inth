import { existsSync } from "node:fs";
// eslint-disable-next-line unicorn/import-style -- Scriptc requires named node:path imports.
import { join } from "node:path";

import type { ApplicationPlan } from "../../vendor/c15t/frontend/runtime/index.ts";
import type {
  FileMerge,
  GenerationPlan,
} from "../../vendor/c15t/generate/index.ts";

/** Keep upstream Next.js templates in the app's active router and config. */
export const adaptNextGeneration = (
  generation: GenerationPlan,
  cwd: string
): void => {
  if (!Object.hasOwn(generation.files, "next.config.ts")) {
    return;
  }
  // Quickstart shells cannot assume an app stylesheet or a configured @ alias.
  for (const name of ["app/layout.tsx", "pages/_app.tsx"]) {
    const content = generation.files[name];
    if (content) {
      generation.files[name] = content
        .replace("import './globals.css';\n", "")
        .replace("import '@/styles/globals.css';\n", "");
    }
  }
  generation.instructions = generation.instructions.map((instruction) =>
    instruction.startsWith("app/layout.tsx imports ./globals.css.")
      ? "Keep your existing fonts, styles, and metadata when integrating consent with your layout."
      : instruction
  );
  const router = Object.hasOwn(generation.files, "app/layout.tsx")
    ? "app"
    : "pages";
  if (!existsSync(join(cwd, router)) && existsSync(join(cwd, "src", router))) {
    const files: Record<string, string> = {};
    const merge: Record<string, FileMerge> = {};
    for (const [name, content] of Object.entries(generation.files)) {
      files[name.startsWith(`${router}/`) ? `src/${name}` : name] = content;
    }
    for (const [name, rule] of Object.entries(generation.merge ?? {})) {
      merge[name.startsWith(`${router}/`) ? `src/${name}` : name] = rule;
    }
    generation.files = files;
    generation.merge = merge;
    generation.instructions = generation.instructions.map((instruction) =>
      instruction.replaceAll(`${router}/`, `src/${router}/`)
    );
  }
  const config = ["next.config.js", "next.config.mjs", "next.config.ts"].find(
    (name) => existsSync(join(cwd, name))
  );
  if (config) {
    const content = generation.files["next.config.ts"];
    if (!content) {
      throw new Error("Next.js scaffolding requires a config template.");
    }
    delete generation.files["next.config.ts"];
    generation.files[config] = content;
    generation.merge = {
      ...generation.merge,
      [config]: { type: "keep" },
    };
  }
};

/** Describe the wrapper for an existing config without exposing its contents. */
export const addNextConfigInstructions = (
  plan: ApplicationPlan,
  generation: GenerationPlan
): void => {
  const config = plan.files.find(
    (file) => /^next\.config\.(?:js|mjs|ts)$/u.test(file.path) && file.exists
  );
  if (!config) {
    return;
  }
  const template = generation.files[config.path];
  const expression = template?.split("export default ")[1]?.trim();
  if (!expression) {
    throw new Error("Next.js scaffolding requires a config wrapper.");
  }
  plan.instructions.push(
    `Update ${config.path}: wrap the exported config with withConsentManifest if it is not already wrapped. Keep your existing config object or function. In the examples below, nextConfig means your existing config.\n` +
      `ES modules:\nimport { withConsentManifest } from 'c15t/next/build';\nexport default ${expression}\n` +
      `CommonJS:\nconst { withConsentManifest } = require('c15t/next/build');\nmodule.exports = ${expression}`
  );
};
