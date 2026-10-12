import { expect, it } from "vitest";

import { createAgentSetupPlan } from "../src/native/c15t-agent.ts";

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
