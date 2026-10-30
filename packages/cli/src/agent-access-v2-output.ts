import type { CliArguments } from "./arguments.ts";
import { terminalText } from "./organizations.ts";

interface ReadRow {
  id?: string;
  name?: string;
  accountLogin?: string;
  accountType?: string;
  clientName?: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  expiresAt?: string | null;
  lastActiveAt?: string | null;
  isCurrent?: boolean;
  owner?: string;
  defaultBranch?: string | null;
  prScansEnabled?: boolean;
  projectName?: string;
  projectId?: string;
  scanMode?: string;
  trigger?: string;
  enabled?: boolean;
  cronExpression?: string | null;
  policiesPath?: string;
  policiesNextCursor?: string | null;
  domain?: string;
  siteUrl?: string;
  permissionLevel?: string;
  method?: string | null;
  verifiedAt?: string | null;
  website?: string;
  targetId?: string;
  scanId?: string;
  cookiesPath?: string;
  credits?: number;
  product?: string;
  activity?: string;
  settledAt?: string;
  initiatedBy?: { label: string; type: string } | null;
  attribution?: { evidenceStatus: string; initiatorStatus: string };
}

interface ReadData extends ReadRow {
  organizationId?: string;
  slug?: string;
  status?: string;
  runStatus?: string;
  items?: ReadRow[];
  nextCursor?: string | null;
  pageSize?: number;
  credentialKind?: string;
  currentSessionId?: string | null;
  visibility?: string;
  dataCompleteness?: string;
  googleSearchConsoleAvailable?: boolean;
  googleSearchConsoleLinked?: boolean;
  canManageRepositories?: boolean;
  branchFilters?: string[];
  ignoredPaths?: string[];
  projectLinksPath?: string;
  coverage?: string;
  window?: { since: string | null; until: string };
  quote?: {
    quoteId: string;
    totalCredits: number;
    expiresAt: string;
    plan: { candidatePlanChecksum: string; plannedFileCount: number };
  };
  approvalAvailability?: string;
  availabilityReason?: string;
  dashboardUrl?: string;
  discovery?: {
    installations: string;
    repositories: string;
    properties: string;
    domainProofs: string;
    projects: string;
  };
}

const append = (
  lines: string[],
  label: string,
  value: string | number | boolean | null | undefined
): void => {
  if (value !== undefined && value !== null) {
    lines.push(terminalText(`${label}: ${value}`));
  }
};

const rowSummary = (row: ReadRow): string => {
  const name =
    row.clientName ?? row.projectName ?? row.name ?? row.accountLogin ?? "";
  const lines = [terminalText(`${row.id ?? ""}  ${name}`.trim())];
  append(lines, "Repository owner", row.owner);
  append(lines, "Account type", row.accountType);
  append(lines, "Default branch", row.defaultBranch);
  append(lines, "PR scans enabled", row.prScansEnabled);
  append(lines, "User agent", row.userAgent);
  append(lines, "IP address", row.ipAddress);
  append(lines, "Current browser session", row.isCurrent);
  append(lines, "Expires", row.expiresAt);
  append(lines, "Last active", row.lastActiveAt);
  append(lines, "Project", row.projectId);
  append(lines, "Scan mode", row.scanMode);
  append(lines, "Trigger", row.trigger);
  append(lines, "Enabled", row.enabled);
  append(lines, "Cron expression", row.cronExpression);
  append(lines, "Policies path", row.policiesPath);
  append(lines, "Policies next cursor", row.policiesNextCursor);
  append(lines, "Domain", row.domain);
  append(lines, "Property", row.siteUrl);
  append(lines, "Permission", row.permissionLevel);
  append(lines, "Verification method", row.method);
  append(lines, "Verified", row.verifiedAt);
  return lines.join("\n  ");
};

const ledgerRow = (row: ReadRow): string => {
  const lines = [terminalText(row.id ?? "")];
  append(lines, "Credits", row.credits);
  append(lines, "Product", row.product);
  append(lines, "Activity", row.activity);
  append(lines, "Settled", row.settledAt);
  if (row.initiatedBy) {
    append(lines, "Initiated by", row.initiatedBy.label);
    append(lines, "Initiator type", row.initiatedBy.type);
  }
  if (row.attribution) {
    append(lines, "Initiator attribution", row.attribution.initiatorStatus);
    append(lines, "Evidence attribution", row.attribution.evidenceStatus);
  }
  return lines.join("\n  ");
};

const cookieRow = (row: ReadRow): string => {
  const lines = [terminalText(`${row.id ?? ""}  ${row.website ?? ""}`.trim())];
  append(lines, "Project", row.projectId);
  append(lines, "Target", row.targetId);
  append(lines, "Latest scan", row.scanId);
  append(lines, "Cookie records path", row.cookiesPath);
  return lines.join("\n  ");
};

const summaryFields = (data: ReadData, lines: string[]): void => {
  append(lines, "ID", data.id);
  append(lines, "Name", data.name);
  append(lines, "Slug", data.slug);
  append(lines, "Organization", data.organizationId);
  append(lines, "Scan", data.scanId);
  append(lines, "Status", data.status);
  append(lines, "Run status", data.runStatus);
  append(lines, "Credential kind", data.credentialKind);
  append(lines, "Current browser session ID", data.currentSessionId);
  if (data.credentialKind === "oauth" && data.currentSessionId === null) {
    lines.push("This OAuth credential has no current browser session.");
  }
  append(lines, "Visibility", data.visibility);
  append(lines, "Completeness", data.dataCompleteness);
  append(lines, "Search Console available", data.googleSearchConsoleAvailable);
  append(lines, "Search Console linked", data.googleSearchConsoleLinked);
  append(lines, "Can manage repositories", data.canManageRepositories);
  append(lines, "Default branch", data.defaultBranch);
  append(lines, "PR scans enabled", data.prScansEnabled);
  append(lines, "Project links path", data.projectLinksPath);
  if (data.branchFilters) {
    append(lines, "Branch filters", JSON.stringify(data.branchFilters));
  }
  if (data.ignoredPaths) {
    append(lines, "Ignored paths", JSON.stringify(data.ignoredPaths));
  }
};

const quoteFields = (data: ReadData, lines: string[]): void => {
  if (!data.quote) {
    return;
  }
  append(lines, "Quote", data.quote.quoteId);
  append(lines, "Total credits", data.quote.totalCredits);
  append(lines, "Expires", data.quote.expiresAt);
  append(
    lines,
    "Candidate plan checksum",
    data.quote.plan.candidatePlanChecksum
  );
  append(lines, "Planned files", data.quote.plan.plannedFileCount);
  append(lines, "Approval availability", data.approvalAvailability);
  append(lines, "Availability reason", data.availabilityReason);
  append(lines, "Dashboard URL", data.dashboardUrl);
};

export const formatV2ReadSummary = (
  options: CliArguments,
  body: string
): string => {
  // SAFETY: This projection is for human output; JSON and --detail all keep the full response.
  const response = JSON.parse(body) as { success: boolean; data: ReadData };
  if (!response.success || !response.data) {
    throw new Error("Expected a successful read response");
  }
  const { data } = response;
  const lines: string[] = [];
  summaryFields(data, lines);
  quoteFields(data, lines);
  if (data.discovery) {
    append(lines, "Installations path", data.discovery.installations);
    append(lines, "Repositories path", data.discovery.repositories);
    append(lines, "Properties path", data.discovery.properties);
    append(lines, "Domain proofs path", data.discovery.domainProofs);
    append(lines, "Projects path", data.discovery.projects);
  }
  if (data.window) {
    append(lines, "History start", data.window.since ?? "all retained history");
    append(lines, "History end", data.window.until);
    append(lines, "Coverage", data.coverage);
    lines.push("This ledger contains settled consumption.");
  }
  if (data.dataCompleteness === "latest-scan-index") {
    lines.push("Read cookie rows with inth website-audit cookies <scanId>.");
  }
  if (data.items) {
    lines.push(`Items in this page: ${data.items.length}`);
    for (const row of data.items) {
      if (options.command === "billing" && options.argument === "ledger") {
        lines.push(ledgerRow(row));
      } else if (options.argument === "cookie-inventory") {
        lines.push(cookieRow(row));
      } else {
        lines.push(rowSummary(row));
      }
    }
  }
  if (data.nextCursor) {
    lines.push(
      "",
      "Next cursor; repeat this command with --cursor:",
      terminalText(data.nextCursor)
    );
  }
  return lines.join("\n");
};
