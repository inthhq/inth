import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";

import sdkPaths from "./sdk-paths.json" with { type: "json" };

export default defineConfig({
  extends: [core],
  ignorePatterns: [
    ...core.ignorePatterns,
    "tools/oxlint/anti-slop/**",
    "**/inrepo_modules/**",
    "**/.inrepo/**",
    // The SDK keeps its own lint rules until it adopts the root ones. Lint it
    // with `pnpm sdk:lint`, which reads oxlint.sdk.config.ts.
    ...sdkPaths.map((path) => (path.endsWith(".ts") ? path : `${path}/**`)),
    // Inth CLI mobile manifest code, kept as imported until Scriptc can compile
    // it; see packages/cli/vendor/c15t-mobile/README.md.
    "packages/cli/vendor/c15t-mobile/**",
    // Unmodified upstream source; see packages/cli/vendor/inth/UPSTREAM.md.
    "packages/cli/vendor/inth/**",
  ],
  jsPlugins: [
    {
      name: "anti-slop",
      specifier: "./tools/oxlint/anti-slop/index.ts",
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
  },
});
