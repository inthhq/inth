import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
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
      "packages/cli/vendor/inth-mobile/**",
    ],
  },
});
