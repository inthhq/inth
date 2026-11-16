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
      // Imported c15t SDK. It keeps its own tooling until it joins this workspace.
      "sdk/**",
    ],
  },
});
