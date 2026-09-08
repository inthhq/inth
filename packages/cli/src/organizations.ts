/* eslint-disable no-control-regex -- Strip terminal controls from server labels and reject them in saved IDs. */
import { CliError } from "./cli-error.ts";

export interface Organization {
  id: string;
  slug: string;
  name: string;
  role: string;
}
export interface CreateOrganizationInput {
  name: string;
  slug: string;
}
export interface OrganizationResponse {
  success: true;
  data: Organization;
}
export const requireOrganizationCreator = (key: string | undefined): void => {
  if (key) {
    throw new CliError(
      "usage_error",
      "Organization API keys cannot create organizations. Remove --token and unset INTH_TOKEN, then run inth login."
    );
  }
};
export interface OrganizationUI {
  interactive: boolean;
  select: (organizations: Organization[]) => Promise<string>;
}
export const terminalText = (value: string): string =>
  value.replaceAll(/[\u0000-\u001F\u007F-\u009F]/gu, "");
export const createdOrganizationMessage = (
  organization: Organization
): string =>
  `Created ${terminalText(organization.name)} (${terminalText(organization.slug)}).\nRun inth switch ${terminalText(organization.slug)} to use it as your default.`;
export const organizationId = (value: string): string => {
  if (!value || value.length > 200 || /[\s\u0000-\u001F\u007F]/u.test(value)) {
    throw new Error("Use a non-empty organization ID without spaces.");
  }
  return value;
};
const at = (organizations: Organization[], index: number): Organization => {
  const org = organizations[index];
  if (!org) {
    throw new Error("Invalid organization selection.");
  }
  return org;
};
export const chooseOrganization = async (
  organizations: Organization[],
  requested: string | undefined,
  current: string | undefined,
  ui: OrganizationUI
): Promise<string> => {
  if (organizations.length === 0) {
    throw new CliError(
      "organization_required",
      "No organizations are available. Run inth org create --name <name> --slug <slug>, or join an organization in the dashboard."
    );
  }
  if (requested) {
    const matches = organizations.filter(
      (org) => org.id === requested || org.slug === requested
    );
    if (matches.length !== 1) {
      throw new CliError(
        "organization_unavailable",
        "That organization is not available to this sign-in. Run inth switch to choose one."
      );
    }
    return organizationId(at(matches, 0).id);
  }
  if (current && organizations.some((org) => org.id === current)) {
    return current;
  }
  if (organizations.length === 1) {
    return organizationId(at(organizations, 0).id);
  }
  if (!ui.interactive) {
    throw new CliError(
      "interaction_required",
      "Choose a default organization with inth switch <organization-id>, or use login --organization <organization-id>."
    );
  }
  const selected = await ui.select(organizations);
  if (!organizations.some((org) => org.id === selected)) {
    throw new CliError(
      "organization_unavailable",
      "Invalid organization selection."
    );
  }
  return organizationId(selected);
};

export interface OrganizationPage {
  success: boolean;
  data: Organization[];
  pagination: { nextCursor: string | null; hasMore: boolean };
}

export const collectOrganizations = async (
  read: (path: string) => Promise<OrganizationPage>
): Promise<Organization[]> => {
  const organizations: Organization[] = [];
  const cursors: string[] = [];
  let cursor: string | null = null;
  while (true) {
    const query = new URLSearchParams({ limit: "100" });
    if (cursor) {
      query.set("cursor", cursor);
    }
    // eslint-disable-next-line no-await-in-loop -- Each page needs the cursor from the preceding response.
    const page = await read(`/v1/organizations?${query.toString()}`);
    organizations.push(...page.data);
    if (!page.pagination.hasMore) {
      return organizations;
    }
    cursor = page.pagination.nextCursor;
    if (!cursor || cursors.includes(cursor)) {
      throw new CliError(
        "invalid_response",
        "Invalid organization pagination cursor."
      );
    }
    cursors.push(cursor);
  }
};
