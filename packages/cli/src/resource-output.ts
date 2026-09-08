import type { CliArguments } from "./arguments.ts";
import { padText, style, textWidth, wrapText } from "./display.ts";
import type { DisplayOptions } from "./display.ts";
import { terminalText } from "./organizations.ts";
import { resourceCommand } from "./resource-commands.ts";
import type {
  ResourceItem,
  ResourcePage,
  ScanDetails,
} from "./resource-output-types.ts";

interface Field {
  label: string;
  value: string;
}
const field = (
  label: string,
  value: string | number | null | undefined
): Field => ({
  label,
  value:
    value === null || value === undefined ? "Not available" : String(value),
});
const add = (
  fields: Field[],
  label: string,
  value: string | number | null | undefined
): void => {
  if (value !== undefined && value !== null) {
    fields.push(field(label, value));
  }
};
const titleCase = (value: string): string =>
  value
    ? value.slice(0, 1).toUpperCase() + value.slice(1).split("-").join(" ")
    : "";
const width = (display: DisplayOptions): number =>
  Math.max(12, display.columns - 1);
const line = (value: string, display: DisplayOptions): string =>
  wrapText(value, width(display));
const heading = (value: string, display: DisplayOptions): string =>
  style(line(value, display), "1", display.color);

export const resourceIsList = (options: CliArguments): boolean =>
  Boolean(resourceCommand(options)?.paginated) || options.command === "region";

const labels = (options: CliArguments): string => {
  switch (options.command) {
    case "org": {
      return "Organizations";
    }
    case "project": {
      return "Projects";
    }
    case "member": {
      return "Members";
    }
    case "invitation": {
      return "Pending invitations";
    }
    case "api-key": {
      return "API keys";
    }
    case "region": {
      return "Regions";
    }
    case "inbox": {
      return "Inbox";
    }
    default: {
      return options.argument === "repositories" ? "Repositories" : "Scans";
    }
  }
};
const listFields = (options: CliArguments, item: ResourceItem): Field[] => {
  switch (options.command) {
    case "org": {
      return [
        field("Name", item.name),
        field("Slug", item.slug),
        field("Role", item.role),
        field("ID", item.id),
      ];
    }
    case "project": {
      return [
        field("Name", item.name),
        field("Slug", item.slug),
        field("ID", item.id),
      ];
    }
    case "member": {
      return [
        field("Name", item.user?.name),
        field("Email", item.user?.email),
        field("Role", item.role),
        field("ID", item.id),
      ];
    }
    case "invitation": {
      return [
        field("Email", item.email),
        field("Role", item.role),
        field("Expires", item.expiresAt),
        field("ID", item.id),
      ];
    }
    case "api-key": {
      return [
        field("Name", item.name),
        field("Prefix", item.prefix),
        field("ID", item.id),
      ];
    }
    case "region": {
      return [field("Region", item.label), field("ID", item.id)];
    }
    case "inbox": {
      return [
        field("Finding", item.title),
        field("Priority", item.priority),
        field("Status", item.status),
        field("ID", item.id),
      ];
    }
    default: {
      return options.argument === "repositories"
        ? [
            field("Repository", `${item.owner ?? ""}/${item.name ?? ""}`),
            field("Branch", item.defaultBranch),
            field("Visibility", item.visibility),
            field("ID", item.id),
          ]
        : [
            field("Repository", item.repositoryName),
            field("Status", item.status),
            field("Access", item.access),
            field("ID", item.id),
          ];
    }
  }
};
const detailLines = (fields: Field[], display: DisplayOptions): string[] => {
  const size = Math.max(
    0,
    Math.max(...fields.map((entry) => textWidth(entry.label)))
  );
  return fields.map((entry) => {
    const value = terminalText(entry.value);
    const label = terminalText(entry.label);
    const prefix = `  ${padText(label, size)}  `;
    if (textWidth(prefix) + 12 > width(display)) {
      return `${line(`  ${label}`, display)}\n    ${wrapText(value, Math.max(2, width(display) - 4), "    ")}`;
    }
    return `${style(prefix, "2", display.color)}${wrapText(value, width(display) - textWidth(prefix), " ".repeat(textWidth(prefix)))}`;
  });
};
const tableLines = (rows: Field[][], display: DisplayOptions): string[] => {
  const [first] = rows;
  if (!first) {
    return [];
  }
  const sizes = first.map((entry, index) =>
    Math.max(
      textWidth(entry.label),
      Math.max(
        ...rows.map((row) => textWidth(terminalText(row[index]?.value ?? "")))
      )
    )
  );
  const total =
    sizes.reduce((sum, size) => sum + size, 2) +
    Math.max(0, sizes.length - 1) * 2;
  if (total > width(display)) {
    const lines: string[] = [];
    for (const row of rows) {
      if (lines.length) {
        lines.push("");
      }
      lines.push(...detailLines(row, display));
    }
    return lines;
  }
  const format = (values: string[]): string =>
    `  ${values
      .map((value, index) => padText(terminalText(value), sizes[index] ?? 0))
      .join("  ")
      .trimEnd()}`;
  return [
    style(format(first.map((entry) => entry.label)), "2", display.color),
    ...rows.map((row) => format(row.map((entry) => entry.value))),
  ];
};

const billingFields = (item: ResourceItem): Field[] => {
  const interval = item.plan?.billingInterval;
  let cadence = "Not specified";
  if (interval === "month") {
    cadence = "Monthly";
  } else if (interval === "year") {
    cadence = "Yearly";
  } else if (interval) {
    cadence = titleCase(interval);
  }
  const fields = [
    field("Plan", item.plan?.name ?? "No active plan"),
    field("Tier", titleCase(item.tier ?? "Unknown")),
    field("Billing cycle", cadence),
  ];
  if (item.plan) {
    fields.push(
      field("Payment status", item.plan.pastDue ? "Past due" : "Current")
    );
  }
  let credits = "Not available";
  if (item.credits) {
    credits = item.credits.unlimited
      ? "Unlimited"
      : String(item.credits.remaining);
  }
  fields.push(field("Credits", credits));
  let topUp = "Not configured";
  if (item.autoTopUp) {
    topUp = item.autoTopUp.enabled ? "Enabled" : "Disabled";
  }
  fields.push(field("Auto top-up", topUp));
  if (item.autoTopUp?.enabled) {
    add(fields, "Top-up threshold", item.autoTopUp.thresholdCredits);
    add(fields, "Top-up credits", item.autoTopUp.quantityCredits);
  }
  add(fields, "Organization", item.organizationId);
  return fields;
};
const scanFields = (item: ScanDetails): Field[] => {
  const fields: Field[] = [];
  add(fields, "Scan", item.id);
  add(fields, "Repository", item.repositoryName ?? item.repositoryId);
  add(fields, "Branch", item.branch);
  add(fields, "Status", item.status);
  add(fields, "Report access", item.access);
  add(fields, "Findings", item.findingCount);
  add(fields, "Issues", item.issueCount);
  add(fields, "Unlock credits", item.unlockCredits);
  if (item.progress) {
    add(fields, "Stage", item.progress.stage);
    if (
      item.progress.completedStages !== null &&
      item.progress.totalStages !== null
    ) {
      add(
        fields,
        "Progress",
        `${item.progress.completedStages} / ${item.progress.totalStages} stages`
      );
    }
  }
  add(fields, "Created", item.createdAt);
  return fields;
};
const projectFields = (item: ResourceItem): Field[] => {
  const fields = [field("Name", item.name), field("ID", item.id)];
  add(fields, "Slug", item.slug);
  add(fields, "Description", item.description);
  add(fields, "Organization", item.organizationId);
  add(fields, "Dashboard", item.dashboardUrl);
  if (item.consent) {
    add(fields, "Consent branding", item.consent.branding);
    add(
      fields,
      "Trusted origins",
      item.consent.trustedOrigins.join(", ") || "None"
    );
    add(fields, "Consent backend", item.consent.backendUrl);
  } else if (item.consent === null) {
    add(fields, "Consent", "Not configured");
  }
  return fields;
};
const inboxFields = (item: ResourceItem): Field[] => {
  const fields = [field("Finding", item.title), field("ID", item.id)];
  add(fields, "Status", item.status);
  add(fields, "Priority", item.priority);
  add(fields, "Summary", item.summary);
  add(fields, "Source", item.source);
  add(fields, "Repository", item.repositoryName);
  add(fields, "Version", item.version);
  add(fields, "GitHub issue", item.githubIssue?.url);
  if (item.codeEvidence) {
    add(fields, "File", item.codeEvidence.filePath);
    add(fields, "Lines", item.codeEvidence.lineNumbers.join(", "));
    add(fields, "Recommendation", item.codeEvidence.recommendation);
  }
  return fields;
};
const resourceFields = (options: CliArguments, item: ResourceItem): Field[] => {
  switch (options.command) {
    case "billing": {
      return billingFields(item);
    }
    case "project": {
      return projectFields(item);
    }
    case "inbox": {
      return inboxFields(item);
    }
    case "code-audit": {
      return scanFields(item.scan ?? item);
    }
    case "invitation": {
      const fields = listFields(options, item);
      add(fields, "Invited by", item.invitedBy?.email);
      return fields;
    }
    case "api-key": {
      return item.key ? [field("ID", item.id)] : listFields(options, item);
    }
    default: {
      return listFields(options, item);
    }
  }
};
const resultHeading = (options: CliArguments): string => {
  let noun = titleCase(options.command);
  if (options.command === "api-key") {
    noun = "API key";
  }
  if (options.command === "org") {
    noun = "Organization";
  }
  switch (options.argument) {
    case "create": {
      return options.command === "invitation"
        ? "Invitation sent"
        : `${noun} created`;
    }
    case "update": {
      return `${noun} updated`;
    }
    case "delete": {
      return `${noun} deleted`;
    }
    case "remove": {
      return `${noun} removed`;
    }
    case "cancel": {
      return "Invitation cancelled";
    }
    case "roll": {
      return "API key rotated";
    }
    case "github-issue": {
      return "GitHub issue";
    }
    default: {
      return noun;
    }
  }
};
const scanSummary = (
  options: CliArguments,
  item: ResourceItem,
  display: DisplayOptions
): string[] => {
  if (options.argument === "issues") {
    const fields = [
      field("Scan", item.scanId),
      field("Access", item.access),
      field("Total findings", item.totalCount),
      field("Locked findings", item.lockedCount),
    ];
    add(fields, "Unlock credits", item.unlockCredits);
    const lines = [
      heading("Scan report", display),
      "",
      ...detailLines(fields, display),
    ];
    for (const issue of item.issues ?? []) {
      lines.push(
        "",
        heading(`${issue.priority ?? ""} ${issue.title}`.trim(), display)
      );
      const details = [field("ID", issue.id)];
      add(details, "Description", issue.description);
      add(details, "Recommendation", issue.recommendation);
      if (issue.files?.length) {
        add(details, "Files", issue.files.join(", "));
      }
      lines.push(...detailLines(details, display));
    }
    if (!item.issues?.length) {
      lines.push(
        "",
        line(
          item.lockedCount
            ? "Findings are locked. Unlock the report to read them."
            : "No findings in this report.",
          display
        )
      );
    }
    return lines;
  }
  if (options.argument === "unlock") {
    return [
      heading(
        item.status === "already-unlocked"
          ? "Report already unlocked"
          : "Report unlocked",
        display
      ),
    ];
  }
  if (item.status === "starting") {
    return [
      heading("Scan is starting", display),
      "",
      ...detailLines(
        [
          field("Request", item.preparationId),
          field("Repository", item.repositoryId),
        ],
        display
      ),
      "",
      line(
        `Check progress with inth code-audit request ${item.preparationId ?? "<request-id>"} --repository ${item.repositoryId ?? "<repository-id>"}`,
        display
      ),
    ];
  }
  if (item.status === "failed" && options.argument === "request") {
    return [
      heading("Scan failed", display),
      "",
      line(
        item.message ?? "Read the scan details for more information.",
        display
      ),
    ];
  }
  return [
    heading(item.scan ? "Scan started" : "Scan", display),
    "",
    ...detailLines(resourceFields(options, item), display),
  ];
};
const emptyNoun = (options: CliArguments): string => {
  if (options.command === "api-key") {
    return "API keys";
  }
  if (options.command === "inbox") {
    return "Inbox findings";
  }
  return labels(options).toLowerCase();
};
const listSummary = (
  options: CliArguments,
  page: ResourcePage,
  display: DisplayOptions
): string[] => {
  const lines = [heading(labels(options), display), ""];
  if (page.data.length) {
    lines.push(
      ...tableLines(
        page.data.map((item) => listFields(options, item)),
        display
      )
    );
  } else {
    lines.push(line(`No ${emptyNoun(options)} on this page.`, display));
  }
  if (page.pagination) {
    const more = page.pagination.hasMore
      ? "More results available."
      : "End of results.";
    lines.push("", line(`${page.data.length} shown. ${more}`, display));
    if (page.pagination.hasMore && page.pagination.nextCursor) {
      lines.push(
        line("Next cursor, pass with --cursor:", display),
        terminalText(page.pagination.nextCursor)
      );
    }
  }
  return lines;
};
export const resourceSummary = (
  options: CliArguments,
  page: ResourcePage,
  display: DisplayOptions
): string => {
  if (resourceIsList(options)) {
    return listSummary(options, page, display).join("\n");
  }
  const [item] = page.data;
  if (!item || item.deleted === true || item.updated === true) {
    const lines = [heading(resultHeading(options), display)];
    if (options.id) {
      lines.push(...detailLines([field("ID", options.id)], display));
    }
    return lines.join("\n");
  }
  if (options.command === "code-audit") {
    return scanSummary(options, item, display).join("\n");
  }
  const lines = [
    heading(resultHeading(options), display),
    "",
    ...detailLines(resourceFields(options, item), display),
  ];
  if (item.key) {
    lines.push(
      "",
      line("Save this key now. It will not be shown again.", display),
      terminalText(item.key)
    );
  }
  return lines.join("\n");
};
