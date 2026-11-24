import { expect, it } from "vite-plus/test";

import { createAgentSetupPlan } from "../src/native/c15t-agent.ts";
import { createInthAgentSetupPlan } from "../vendor/inth-setup/frontend/agent/inth.ts";

it("preserves existing v2 apps unless an upgrade is requested", () => {
  const { prompt } = createAgentSetupPlan({
    backendURL: "https://website.inth.app",
    framework: "next-app",
    mode: "hosted",
  });
  expect(prompt).toContain(
    "Running inth c15t alone does not request an upgrade."
  );
  expect(prompt).toContain(
    "follow its installed package's bundled docs, skip the v3 installation and migration steps"
  );
  expect(prompt).toContain(
    "If the user requests the upgrade, follow the Upgrade path below."
  );
  expect(prompt).not.toContain("below 3.0 → Upgrade path.");
  expect(prompt).not.toContain(
    "or upgrade or replace its existing consent setup"
  );
  expect(prompt).toContain('"backendURL": "https://website.inth.app"');
  expect(prompt).toContain('"framework": "next-app"');
  expect(prompt).toContain("<package>@latest");
});

it("points custom storage at a transport factory passed as mode", () => {
  const { prompt } = createAgentSetupPlan({
    framework: "next-app",
    mode: "custom",
  });
  expect(prompt).toContain(
    "Use the app's own transport as a transport factory passed as the provider's `mode`"
  );
  expect(prompt).toContain(
    "`ProviderTransportFactory` from `@inth/sdk/transports`"
  );
  expect(prompt).not.toContain("custom(transport)");
});

it("gives inth init an Inth prompt with the project URL and Inth docs", () => {
  const { prompt } = createInthAgentSetupPlan({
    framework: "next-app",
    projectUrl: "https://Website.inth.app/",
  });
  expect(prompt).toContain('"projectUrl": "https://website.inth.app"');
  expect(prompt).toContain('"framework": "next-app"');
  expect(prompt).toContain(
    "https://inth.com/docs/frameworks/<framework>/quickstart.md"
  );
  expect(prompt).toContain("https://inth.com/docs/migrate-from-c15t.md");
  expect(prompt).not.toMatch(/https:\/\/(?:v3\.)?c15t\.com/u);
  expect(prompt).not.toContain("backendURL");
});

it.each([
  ["next-pages", "next"],
  ["astro-static", "astro"],
  ["solid", "javascript"],
  ["sveltekit", "sveltekit"],
])("links the %s quickstart in the %s docs", (framework, folder) => {
  const { prompt } = createInthAgentSetupPlan({
    framework,
    projectUrl: "https://website.inth.app",
  });
  expect(prompt).toContain(
    `"quickstart": "https://inth.com/docs/frameworks/${folder}/quickstart.md"`
  );
});

it("rejects a project URL with credentials", () => {
  expect(() =>
    createInthAgentSetupPlan({ projectUrl: "https://user:pass@a.inth.app" })
  ).toThrow("without embedded credentials");
});
