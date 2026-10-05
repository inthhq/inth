import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [
    ...ultracite.ignorePatterns,
    "tools/oxlint/anti-slop/**",
    "**/inrepo_modules/**",
    "**/.inrepo/**",
    // Unmodified upstream source; see packages/cli/vendor/c15t/UPSTREAM.md.
    "packages/cli/vendor/c15t/**",
    "packages/cli/AGENTS.md",
    "packages/cli/SKILL.md",
    "packages/cli/docs/cli/**",
    // A list of review globs, not prose; Markdown formatting would rewrite the patterns.
    ".macroscope/ignore.md",
  ],
});
