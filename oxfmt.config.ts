import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [
    ...ultracite.ignorePatterns,
    "tools/oxlint/anti-slop/**",
    "**/inrepo_modules/**",
    "**/.inrepo/**",
    "packages/cli/AGENTS.md",
    "packages/cli/SKILL.md",
    "packages/cli/docs/cli/**",
  ],
});
