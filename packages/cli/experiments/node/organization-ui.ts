import { isCancel, select } from "@clack/prompts";

import { CliError } from "../../src/cli-error.ts";
import { terminalText } from "../../src/organizations.ts";
import type { Organization, OrganizationUI } from "../../src/organizations.ts";
import type { ApiClient } from "./api.ts";

export const listOrganizations = (api: ApiClient): Promise<Organization[]> =>
  api.organizations();
export const organizationUI = (
  signal: AbortSignal,
  allowInteractive = true,
  title = "Choose your default organization",
  cancellationMessage = "Organization selection cancelled."
): OrganizationUI => ({
  interactive:
    allowInteractive && Boolean(process.stdin.isTTY && process.stderr.isTTY),
  select: async (organizations) => {
    signal.throwIfAborted();
    const value = await select({
      message: title,
      options: organizations.map((org) => ({
        hint: terminalText(org.slug),
        label: terminalText(org.name),
        value: org.id,
      })),
      output: process.stderr,
      signal,
    });
    if (isCancel(value)) {
      throw new CliError("cancelled", cancellationMessage);
    }
    return value;
  },
});
