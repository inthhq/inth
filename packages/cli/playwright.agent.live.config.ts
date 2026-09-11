import { defineConfig } from "@playwright/test";

// Live variant: drives the companion monorepo's local API and dashboard.
// Requires INTH_DEV_API_ORIGIN, INTH_DEV_DASHBOARD_ORIGIN and INTH_E2E_API_LOG.
export default defineConfig({
  reporter: [["list"], ["html", { open: "never" }]],
  retries: 0,
  testDir: "./e2e/agent/live",
  timeout: 120_000,
  use: {
    ignoreHTTPSErrors: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  workers: 1,
});
