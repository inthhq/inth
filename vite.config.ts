import ultraciteFmt from "ultracite/oxfmt";
import core from "ultracite/oxlint/core";
import { configDefaults, defineConfig } from "vite-plus";

import sdkPaths from "./sdk-paths.json" with { type: "json" };

const sdkIgnorePatterns = sdkPaths.map((path) =>
  path.endsWith(".ts") ? path : `${path}/**`
);

export default defineConfig({
  fmt: {
    ...ultraciteFmt,
    ignorePatterns: [
      ...ultraciteFmt.ignorePatterns,
      "tools/oxlint/anti-slop/**",
      "**/inrepo_modules/**",
      "**/.inrepo/**",
      // The SDK keeps its own formatting until it adopts the root style. Format
      // it with `pnpm sdk:fmt`, which reads oxfmt.sdk.config.ts.
      ...sdkIgnorePatterns,
      // Forked from upstream c15t; see packages/cli/vendor/inth-setup/README.md.
      "packages/cli/vendor/inth-setup/**",
      "AGENTS.md",
      "packages/cli/AGENTS.md",
      "packages/cli/SKILL.md",
      "packages/cli/docs/cli/**",
    ],
  },
  lint: {
    extends: [core],
    ignorePatterns: [
      ...core.ignorePatterns,
      "tools/oxlint/anti-slop/**",
      "**/inrepo_modules/**",
      "**/.inrepo/**",
      // The SDK keeps its own lint rules until it adopts the root ones. Lint it
      // with `pnpm sdk:lint`, which reads oxlint.sdk.config.ts.
      ...sdkIgnorePatterns,
      // c15t CLI mobile manifest code, kept as imported until Scriptc can compile
      // it; see packages/cli/vendor/c15t-mobile/README.md.
      "packages/cli/vendor/c15t-mobile/**",
      // Forked from upstream c15t; see packages/cli/vendor/inth-setup/README.md.
      "packages/cli/vendor/inth-setup/**",
    ],
    jsPlugins: [
      {
        name: "anti-slop",
        specifier: "./tools/oxlint/anti-slop/index.ts",
      },
      { name: "vite-plus", specifier: "vite-plus/oxlint-plugin" },
    ],
    overrides: [
      {
        files: [
          "examples/**",
          "internals/doc-snippets/**",
          "benchmarks/tailwind-matrix/**",
        ],
        rules: { "vite-plus/prefer-vite-plus-imports": "off" },
      },
    ],
    rules: {
      "anti-slop/no-chained-type-assertions": "error",
      "anti-slop/no-conditional-empty-object-spread": "error",
      "anti-slop/no-known-value-widening": "error",
      "anti-slop/no-module-mocking": "error",
      "anti-slop/no-object-parameters": "error",
      "anti-slop/no-reflect-apply": "error",
      "anti-slop/no-reflect-get": "error",
      "anti-slop/no-runtime-typeof": "error",
      "anti-slop/no-shape-in-symbol-names": "error",
      "anti-slop/no-unknown-parameters": "error",
      "anti-slop/no-unknown-returns": "error",
      "anti-slop/no-unknown-type-aliases": "error",
      "anti-slop/no-unsafe-dictionary-type": "error",
      "anti-slop/no-widen-then-assert": "error",
      "anti-slop/require-safety-comment-for-type-assertion": "error",
      "vite-plus/prefer-vite-plus-imports": "error",
    },
  },
  staged: {
    "*": "vp check --fix",
  },
  test: {
    env: { INTH_TELEMETRY_DISABLED: "1" },
    environment: "node",
    exclude: [
      ...configDefaults.exclude,
      "**/inrepo_modules/**",
      "**/.inrepo/**",
      "**/e2e/**",
      // The SDK's tests run through `pnpm sdk:test` and `pnpm sdk:test:scripts`.
      "apps/**",
      "benchmarks/**",
      "examples/**",
      "internals/**",
      "scripts/**",
      "packages/sdk/**",
      "packages/react-native/**",
      "packages/swift/**",
      "packages/android/**",
      "packages/native-protocol/**",
      "packages/cli/vendor/c15t-mobile/**",
    ],
  },
});
