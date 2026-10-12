import { existsSync, readFileSync } from "node:fs";
// eslint-disable-next-line unicorn/import-style -- Scriptc requires named node:path imports.
import { join } from "node:path";

import type { GenerationPlan } from "../../vendor/c15t/generate/index.ts";
import type { PackageManifest } from "../c15t.ts";

const requireSupportedKit = (version: string, declaredRange: boolean): void => {
  const match =
    /^[~^]?\s*(?<major>\d+)(?:\.(?<minor>\d+)(?:\.\d+)?)?(?:\+[\w.-]+)?$/u.exec(
      version.trim()
    );
  const parts = match ? match.groups : undefined;
  if (!parts && declaredRange) {
    throw new Error(
      "Cannot verify the declared SvelteKit range. Install the app's dependencies and retry so setup can check the installed @sveltejs/kit version. Scaffolding needs stable Kit 2.63+ or 3.x."
    );
  }
  const major = Number(parts?.major);
  const minor = Number(parts?.minor ?? "0");
  if (!parts || (major !== 2 && major !== 3) || (major === 2 && minor < 63)) {
    throw new Error(
      "SvelteKit scaffolding requires @sveltejs/kit 2.63.0 or newer in 2.x, or stable 3.x, to match @c15t/svelte@3. Upgrade and install the app's SvelteKit packages before scaffolding, or use agent setup to plan the upgrade."
    );
  }
};

/** Check the installed Kit API before generating Vite-based adapter config. */
export const adaptSvelteKitGeneration = (
  generation: GenerationPlan,
  cwd: string
): void => {
  if (
    !generation.files["vite.config.ts"]?.includes(
      "import adapter from '@sveltejs/adapter-auto';"
    )
  ) {
    return;
  }
  const manifest: PackageManifest = JSON.parse(
    readFileSync(join(cwd, "package.json"), "utf-8")
  );
  const dependencies = {
    ...manifest.devDependencies,
    ...manifest.dependencies,
  };
  const installedPath = join(
    cwd,
    "node_modules",
    "@sveltejs",
    "kit",
    "package.json"
  );
  let kit = dependencies["@sveltejs/kit"] ?? "";
  const installedKit = existsSync(installedPath);
  if (installedKit) {
    const installed: { version: string } = JSON.parse(
      readFileSync(installedPath, "utf-8")
    );
    kit = installed.version;
  }
  if (kit) {
    requireSupportedKit(kit, !installedKit);
  }
  const declared = dependencies["@sveltejs/adapter-auto"];
  const version = declared ?? (/^[~^]?\s*2(?:\.|$)/u.test(kit) ? "7" : "");
  generation.dependencies.push(
    `@sveltejs/adapter-auto${version ? `@${version}` : ""}`
  );
};
