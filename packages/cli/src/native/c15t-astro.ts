import { existsSync } from "node:fs";
// eslint-disable-next-line unicorn/import-style -- Scriptc requires named node:path imports.
import { join } from "node:path";

import type { GenerationPlan } from "../../vendor/c15t/generate/index.ts";

const CLIENT = "src/inth.client.ts";

/**
 * Keep an existing Astro client entrypoint. `@inth/astro` loads the first of
 * `src/inth.client.ts`, `.js` and `.mjs`, so a generated `.ts` file would
 * hide an existing `.js` or `.mjs` one. Target the existing file instead, so
 * setup's overwrite check protects it.
 */
export const adaptAstroGeneration = (
  generation: GenerationPlan,
  cwd: string
): void => {
  const content = generation.files[CLIENT];
  if (content === undefined || existsSync(join(cwd, CLIENT))) {
    return;
  }
  const existing = ["src/inth.client.js", "src/inth.client.mjs"].find((name) =>
    existsSync(join(cwd, name))
  );
  if (!existing) {
    return;
  }
  delete generation.files["src/inth.client.ts"];
  generation.files[existing] = content
    .replaceAll(/^import type .*\n/gmu, "")
    .replace(" satisfies InthClientOptionsExtension", "");
  generation.instructions = generation.instructions.map((instruction) =>
    instruction.replaceAll(CLIENT, existing)
  );
};
