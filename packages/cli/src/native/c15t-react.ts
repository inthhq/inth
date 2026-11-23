import { existsSync, readdirSync, readFileSync } from "node:fs";
// eslint-disable-next-line unicorn/import-style -- Scriptc requires named node:path imports.
import { join } from "node:path";

import type { GenerationPlan } from "../../vendor/inth-setup/generate/index.ts";

// Names Vite and its React templates use, in the order Vite looks for them.
const VITE_CONFIGS = [
  "vite.config.js",
  "vite.config.mjs",
  "vite.config.ts",
  "vite.config.cjs",
  "vite.config.mts",
  "vite.config.cts",
];
const ENTRIES = ["src/main.tsx", "src/main.jsx", "src/main.ts", "src/main.js"];

/**
 * Leave an app's own Vite config or entry in place and say what to add. A
 * new `vite.config.ts` beside a `vite.config.js` would be ignored, and a new
 * `src/main.tsx` beside `src/main.jsx` would never load, so the generated
 * file moves onto the existing one.
 */
const keepExisting = (
  generation: GenerationPlan,
  cwd: string,
  name: string,
  candidates: string[],
  guidance: string
): void => {
  const generated = generation.files[name];
  const existing = candidates.find((candidate) =>
    existsSync(join(cwd, candidate))
  );
  if (generated === undefined || !existing) {
    return;
  }
  generation.files = {
    ...Object.fromEntries(
      Object.entries(generation.files).filter(([key]) => key !== name)
    ),
    [existing]: generated,
  };
  generation.merge = {
    ...Object.fromEntries(
      Object.entries(generation.merge ?? {}).filter(([key]) => key !== name)
    ),
    [existing]: { type: "keep" },
  };
  const matches = readFileSync(join(cwd, existing), "utf-8") === generated;
  // A quickstart file setup wrote earlier keeps its own description.
  if (matches && existing === name) {
    return;
  }
  const instructions = generation.instructions.filter(
    (instruction) => !instruction.startsWith(`${name} renders`)
  );
  // A file that already matches the quickstart needs no changes.
  generation.instructions = matches
    ? instructions
    : [
        ...instructions,
        `Update ${existing}: ${guidance} The quickstart's version:\n${generated.trimEnd()}`,
      ];
};

/** Use Vite's conventional default App export when the project contains it. */
const useDefaultApp = (generation: GenerationPlan, cwd: string): void => {
  const main = generation.files["src/main.tsx"];
  const source = join(cwd, "src");
  if (!main?.includes("import { App } from './app';") || !existsSync(source)) {
    return;
  }
  const app = readdirSync(source).find((name) =>
    /^App\.(?:tsx|jsx|ts|js)$/u.test(name)
  );
  if (!app) {
    return;
  }
  generation.files["src/main.tsx"] = main.replace(
    "import { App } from './app';",
    "import App from './App';"
  );
  generation.instructions = generation.instructions.map((instruction) =>
    instruction.startsWith("src/main.tsx renders the named App export")
      ? `src/main.tsx renders the default App export of src/${app} inside <Consent>. Keep your app component and styles.`
      : instruction
  );
};

/** Fit the React quickstart to an existing Vite app. */
export const adaptReactGeneration = (
  generation: GenerationPlan,
  cwd: string
): void => {
  if (!generation.files["src/consent.tsx"]) {
    return;
  }
  useDefaultApp(generation, cwd);
  keepExisting(
    generation,
    cwd,
    "src/main.tsx",
    ENTRIES,
    "keep your entry, import { Consent } from './consent', and render your root component inside <Consent>."
  );
  keepExisting(
    generation,
    cwd,
    "vite.config.ts",
    VITE_CONFIGS,
    "keep your config, import { consentManifest } from the React package's /build entry, and add consentManifest() to plugins, with the options shown."
  );
};
