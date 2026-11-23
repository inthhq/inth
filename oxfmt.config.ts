import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

import sdkPaths from "./sdk-paths.json" with { type: "json" };

export default defineConfig({
  ...ultracite,
  ignorePatterns: [
    ...ultracite.ignorePatterns,
    "tools/oxlint/anti-slop/**",
    "**/inrepo_modules/**",
    "**/.inrepo/**",
    // The SDK keeps its own formatting until it adopts the root style. Format
    // it with `pnpm sdk:fmt`, which reads oxfmt.sdk.config.ts.
    ...sdkPaths.map((path) => (path.endsWith(".ts") ? path : `${path}/**`)),
    // Forked from upstream c15t; see packages/cli/vendor/inth-setup/README.md.
    "packages/cli/vendor/inth-setup/**",
    "packages/cli/AGENTS.md",
    "packages/cli/SKILL.md",
    "packages/cli/docs/cli/**",
  ],
});
