import { existsSync, readdirSync } from "node:fs";
// eslint-disable-next-line unicorn/import-style -- Scriptc requires named node:path imports.
import { join } from "node:path";

import type { GenerationPlan } from "../../vendor/c15t/generate/index.ts";

/** Use Vite's conventional default App export when the project contains it. */
export const adaptReactGeneration = (
  generation: GenerationPlan,
  cwd: string
): void => {
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
