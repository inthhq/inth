import { createAgentSetupPlan as upstreamAgentSetupPlan } from "../../vendor/c15t/frontend/agent/prompt.ts";
import type {
  AgentSetupOptions,
  AgentSetupPlan,
} from "../../vendor/c15t/frontend/agent/prompt.ts";

/** Build the upstream setup task with Inth's explicit-upgrade policy. */
export const createAgentSetupPlan = (
  options: AgentSetupOptions
): AgentSetupPlan => {
  const plan = upstreamAgentSetupPlan(options);
  plan.prompt = plan.prompt
    .replace(
      "or upgrade or replace its existing consent setup,",
      "or replace another consent manager,"
    )
    .replace(
      "Yes, any c15t package is below 3.0 → Upgrade path.",
      "Yes, any c15t package is below 3.0 → Keep its existing major unless the user requested an upgrade."
    );
  const policy =
    "Existing c15t installations stay on their current major version unless the user explicitly requests an upgrade. Running inth c15t alone does not request an upgrade. For an existing v2 app without an upgrade request, follow its installed package's bundled docs, skip the v3 installation and migration steps below, and tell the user v3 is available. If the user requests the upgrade, follow the Upgrade path below.";
  plan.prompt = plan.prompt.replace("\n\n", `\n\n${policy}\n\n`);
  return plan;
};
