import {
  organizationLabel,
  organizationReference,
  padText,
  shortId,
  style,
  textWidth,
  wrapText,
} from "./display.ts";
import type { DisplayOptions } from "./display.ts";
import { terminalText } from "./organizations.ts";
import type { Organization } from "./organizations.ts";

// Response contract from https://api.inth.com/openapi.json, components.schemas.Me.
// Profile details are fetched separately from OAuth UserInfo.
export interface Principal {
  type: string;
  userId?: string;
  keyId?: string;
  organizationId?: string;
  createdBy?: string;
  activeOrganizationId?: string | null;
}
export interface Me {
  principal: Principal;
  activeOrganizationId: string | null;
  organizations: Organization[];
  scopes: string[];
}
export interface MeResponse {
  success: true;
  data: Me;
}
export interface UserProfile {
  sub: string;
  name?: string | null;
  email?: string | null;
}
export interface IdentityResponse extends MeResponse {
  profile?: UserProfile;
}
const organizationRows = (
  organizations: Organization[],
  display: DisplayOptions
): string[] => {
  const names = Math.max(
    12,
    Math.max(...organizations.map((org) => textWidth(organizationLabel(org))))
  );
  const roles = Math.max(
    4,
    Math.max(...organizations.map((org) => textWidth(terminalText(org.role))))
  );
  const table = names + roles + 6 <= display.columns;
  const lines: string[] = [];
  if (table) {
    lines.push(
      style(`    ${padText("Organization", names)}  Role`, "2", display.color)
    );
  }
  for (const org of organizations) {
    const selected =
      org.id === display.selectedOrganization ||
      org.slug === display.selectedOrganization;
    const marker = selected ? "●" : " ";
    const name = terminalText(org.name);
    const slug = terminalText(org.slug);
    const role = terminalText(org.role);
    if (table) {
      lines.push(
        `  ${style(marker, "36", display.color)} ${style(name, selected ? "1;36" : "1", display.color)} ${style(padText(`(${slug})`, names - textWidth(name) - 1), "2", display.color)}  ${role}`
      );
    } else {
      const label = wrapText(
        organizationLabel(org),
        Math.max(2, display.columns - 4),
        "    "
      );
      const detail = wrapText(role, Math.max(2, display.columns - 4), "    ");
      lines.push(
        `  ${style(marker, "36", display.color)} ${style(label, selected ? "1;36" : "1", display.color)}`,
        `    ${style(detail, "2", display.color)}`,
        ""
      );
    }
  }
  return lines;
};

const selectionSummary = (
  identity: Me,
  selected: string | undefined
): string => {
  if (identity.principal.type === "api_key") {
    const id = identity.principal.organizationId;
    return id
      ? `Key organization: ${organizationReference(identity.organizations, id)}`
      : "Organization API key";
  }
  if (!selected) {
    return "No organization selected. Run inth switch.";
  }
  const available = identity.organizations.some(
    (org) => org.id === selected || org.slug === selected
  );
  return available
    ? ""
    : "Selected organization is unavailable. Run inth switch.";
};

const profileLabel = (profile: UserProfile | undefined): string => {
  const name = profile?.name ? terminalText(profile.name).trim() : "";
  const email = profile?.email ? terminalText(profile.email).trim() : "";
  return name && email ? `${name} <${email}>` : name || email;
};

const principalLabel = (type: string, authMode?: string): string => {
  if (authMode === "agent") {
    return "Auth.md agent";
  }
  if (type === "oauth") {
    return "Browser login";
  }
  if (type === "session") {
    return "Session";
  }
  return terminalText(type);
};

const plainDisplay: DisplayOptions = { color: false, columns: 80 };

export const identitySummary = (
  identity: Me,
  display: DisplayOptions = plainDisplay
): string => {
  const { principal } = identity;
  const columns = Math.max(8, display.columns - 1);
  const line = (text: string): string => wrapText(text, columns);
  const key = principal.type === "api_key";
  const id = key ? principal.keyId : principal.userId;
  const method = principalLabel(principal.type, display.authMode);
  const lines = [
    style(
      line(key ? "Organization API key" : "Signed in"),
      "1;32",
      display.color
    ),
  ];
  if (id) {
    const person = key ? "" : profileLabel(display.profile);
    lines.push(
      style(
        line(
          key
            ? `Key ${shortId(id)}`
            : person || `User ${shortId(id)} · ${method}`
        ),
        person ? "1" : "2",
        display.color
      )
    );
  }
  lines.push(
    "",
    line(
      `Capabilities: ${identity.scopes.length ? identity.scopes.map(terminalText).join(", ") : "none"}`
    )
  );
  if (!key && !identity.scopes.includes("organizations.read")) {
    lines.push(
      line(
        display.authMode === "agent"
          ? "Organization access was not granted. Start a new auth.md claim with organizations.read."
          : "Organization access was not granted. Run inth login again to approve the current scopes."
      )
    );
    return lines.join("\n");
  }
  const selection = selectionSummary(identity, display.selectedOrganization);
  if (selection) {
    lines.push("", line(selection));
  }
  if (
    identity.activeOrganizationId &&
    identity.activeOrganizationId !== display.selectedOrganization &&
    !key
  ) {
    lines.push(
      style(
        line(
          `API active: ${organizationReference(identity.organizations, identity.activeOrganizationId)}`
        ),
        "2",
        display.color
      )
    );
  }
  lines.push(
    "",
    style(
      line(`Organizations (${identity.organizations.length})`),
      "1",
      display.color
    )
  );
  if (identity.organizations.length === 0) {
    lines.push(
      line(
        key
          ? "No memberships returned for this key."
          : "None. Run inth org create --name <name> --slug <slug>."
      )
    );
  } else {
    lines.push(
      ...organizationRows(identity.organizations, {
        ...display,
        columns,
        selectedOrganization: key
          ? principal.organizationId
          : display.selectedOrganization,
      })
    );
  }
  return lines.join("\n").trimEnd();
};
