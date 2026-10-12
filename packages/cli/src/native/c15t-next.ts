import { existsSync, readFileSync } from "node:fs";
// eslint-disable-next-line unicorn/import-style -- Scriptc requires named node:path imports.
import { join } from "node:path";

import type { ApplicationPlan } from "../../vendor/c15t/frontend/runtime/index.ts";
import type {
  FileMerge,
  GenerationPlan,
} from "../../vendor/c15t/generate/index.ts";

const withoutConfigComments = (source: string): string => {
  let result = "";
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] ?? "";
    const next = source[index + 1];
    if (lineComment) {
      if (character === "\n") {
        lineComment = false;
        result += character;
      }
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        index += 1;
      } else if (character === "\n") {
        result += character;
      }
      continue;
    }
    if (quote) {
      result += character;
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = "";
      }
      continue;
    }
    if (character === "/" && (next === "/" || next === "*")) {
      lineComment = next === "/";
      blockComment = next === "*";
      result += " ";
      index += 1;
    } else {
      if (character === "'" || character === '"' || character === "`") {
        quote = character;
      }
      result += character;
    }
  }
  return result;
};

const nextPageExtensions = (cwd: string, config?: string): string[] => {
  const defaults = ["tsx", "ts", "jsx", "js"];
  if (!config) {
    return defaults;
  }
  const contents = withoutConfigComments(
    readFileSync(join(cwd, config), "utf-8")
  );
  if (
    !/(?:["']?\bpageExtensions\b["']?\s*:|\.pageExtensions\s*=|\[\s*["']pageExtensions["']\s*\]\s*=|\bpageExtensions\b\s*[,}])/u.test(
      contents
    )
  ) {
    return defaults;
  }
  const match =
    /["']?\bpageExtensions\b["']?\s*:\s*\[(?<values>[^\]]*)\]\s*(?:[,}]|$)/u.exec(
      contents
    );
  const values = match ? match.groups?.values : undefined;
  const list = values ?? "";
  const literals = list
    .split(",")
    .map((literal) => literal.trim())
    .filter(Boolean);
  const extensions = literals.map((literal) => literal.slice(1, -1));
  if (
    !extensions.length ||
    literals.some((literal) => !/^(?:"[^"\n]+"|'[^'\n]+')$/u.test(literal)) ||
    extensions.some((extension) => !/^[\w-]+(?:\.[\w-]+)*$/u.test(extension))
  ) {
    throw new Error(
      "Cannot verify Next.js pageExtensions. Scaffolding needs a literal list of file extensions in the config. Use agent setup to integrate c15t with a computed pageExtensions config."
    );
  }
  return extensions;
};

const generatedPageExtension = (name: string, extensions: string[]): string => {
  const script = name.endsWith(".ts");
  const extension =
    extensions.find((candidate) =>
      script
        ? /(?:^|\.)(?:ts|js)$/u.test(candidate)
        : /(?:^|\.)(?:tsx|jsx)$/u.test(candidate)
    ) ??
    (script
      ? extensions.find((candidate) => /(?:^|\.)(?:tsx|jsx)$/u.test(candidate))
      : extensions.find((candidate) => /(?:^|\.)js$/u.test(candidate)));
  if (!extension) {
    throw new Error(
      "Next.js pageExtensions must include a TypeScript or JavaScript extension for generated consent pages and API routes. Use agent setup to integrate c15t with other page formats."
    );
  }
  return extension;
};

const preserveNextEntries = (
  generation: GenerationPlan,
  cwd: string,
  extensions: string[]
): void => {
  for (const [name, content] of Object.entries(generation.files)) {
    if (!/^(?:src\/)?(?:app|pages)\/.*\.tsx?$/u.test(name)) {
      continue;
    }
    const stem = name.replace(/\.tsx?$/u, "");
    const pages = /^(?:src\/)?pages\//u.test(name);
    const suffixes = pages ? extensions : ["tsx", "ts", "jsx", "js"];
    const existing = suffixes
      .map((extension) => `${stem}.${extension}`)
      .find((candidate) => existsSync(join(cwd, candidate)));
    const target =
      existing ??
      (pages ? `${stem}.${generatedPageExtension(name, extensions)}` : name);
    if (!existing && target === name) {
      continue;
    }
    const generated = /(?:^|\.)jsx?$/u.test(target)
      ? content
          .replaceAll(/^import type .*\n/gmu, "")
          .replace(": AppProps<ConsentPageProps>", "")
      : content;
    generation.files = {
      ...Object.fromEntries(
        Object.entries(generation.files).filter(([key]) => key !== name)
      ),
      [target]: generated,
    };
    generation.merge = {
      ...Object.fromEntries(
        Object.entries(generation.merge ?? {}).filter(([key]) => key !== name)
      ),
      [target]: existing
        ? { type: "keep" }
        : (generation.merge?.[name] ?? { type: "keep" }),
    };
    if (!existing) {
      continue;
    }
    let guidance =
      "Keep your page content. For server consent, import withConsentProps from 'c15t/next/pages' and integrate it with getServerSideProps.";
    if (stem.endsWith("/layout")) {
      guidance =
        "Keep your layout, styles, and metadata. Import ConsentRoot, ConsentBanner, ConsentDialog, and ConsentDialogLink from 'c15t/next', and resolveConsent from 'c15t/next/server'. Inside the body, wrap children and the consent components in <ConsentRoot state={resolveConsent()}>.";
    } else if (stem.endsWith("/_app")) {
      guidance =
        "Keep your providers and styles. Import ConsentRoot, ConsentBanner, ConsentDialog, and ConsentDialogLink from 'c15t/next'. Wrap <Component {...pageProps} /> and the consent components in <ConsentRoot state={pageProps.consent}>.";
    } else if (stem.endsWith("/[...c15t]")) {
      guidance =
        "Keep or adapt your existing consent handler. Import createPagesConsentRoute from 'c15t/next/pages' and use createPagesConsentRoute() as the default handler for /api/c15t.";
    }
    generation.instructions.push(
      `Integrate c15t into ${existing}: ${guidance}`
    );
  }
};

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
  preserveNextEntries(
    generation,
    cwd,
    router === "pages"
      ? nextPageExtensions(cwd, config)
      : ["tsx", "ts", "jsx", "js"]
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
