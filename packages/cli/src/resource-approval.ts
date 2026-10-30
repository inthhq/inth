import type { CliArguments } from "./arguments.ts";
import { CliError } from "./cli-error.ts";
import type { OrganizationUI } from "./organizations.ts";
import { terminalText } from "./organizations.ts";
import { optionValue, resourceCommand } from "./resource-commands.ts";

export const approvalMessage = (options: CliArguments): string => {
  const effect = resourceCommand(options)?.approval;
  return effect ? `${effect}: ${terminalText(options.id)}?` : "";
};

export const approveResource = async (
  options: CliArguments,
  ui: OrganizationUI,
  explicitMessage?: string
): Promise<void> => {
  if (resourceCommand(options)?.writeSchema && explicitMessage === undefined) {
    return;
  }
  const message = explicitMessage ?? approvalMessage(options);
  if (!message || optionValue(options, "yes") === "true") {
    return;
  }
  if (!ui.interactive) {
    throw new CliError(
      "interaction_required",
      `${message} Approve this explicit target with --yes, or use an interactive terminal.`
    );
  }
  console.error(message);
  const selected = await ui.select([
    { id: "cancel", name: "Cancel", role: "", slug: "No changes" },
    {
      id: "confirm",
      name: "Confirm",
      role: "",
      slug: explicitMessage ? "Run the reviewed action" : message,
    },
  ]);
  if (selected !== "confirm") {
    throw new CliError("cancelled", "Cancelled.");
  }
};
