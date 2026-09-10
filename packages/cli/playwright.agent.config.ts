import { defineConfig } from "@playwright/test";

export default defineConfig({
  retries: 0,
  testDir: "./e2e/agent",
  timeout: 120_000,
  use: {
    ignoreHTTPSErrors: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  workers: 1,
});
