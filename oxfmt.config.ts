import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [
    ...ultracite.ignorePatterns,
    "tools/oxlint/anti-slop/**",
    "**/inrepo_modules/**",
    "**/.inrepo/**",
    // Unmodified upstream source; see packages/cli/vendor/inth/UPSTREAM.md.
    "packages/cli/vendor/inth/**",
    "packages/cli/AGENTS.md",
    "packages/cli/SKILL.md",
    "packages/cli/docs/cli/**",
  ],
});
