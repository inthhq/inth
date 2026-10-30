import { formatV2ReadSummary } from "./agent-access-v2-output.ts";
import { V2_READ_COMMANDS } from "./agent-access-v2-reads.ts";
import type { CliArguments } from "./arguments.ts";
import { CliError } from "./cli-error.ts";
import { terminalText } from "./organizations.ts";
import { optionValue, resourceCommand } from "./resource-commands.ts";

interface AccessRow {
  id?: string;
  title?: string | null;
  name?: string | null;
  subject?: string | null;
  origin?: string;
  status?: string;
  visibility?: string;
  fileName?: string;
  mediaType?: string;
  sizeBytes?: number;
}
interface AccessData extends AccessRow {
  organizationId?: string;
  projectId?: string;
  dataCompleteness?: string;
  providerAvailable?: boolean;
  page?: number;
  pageSize?: number;
  nextPage?: number | null;
  nextCursor?: string | null;
  hasMore?: boolean;
  checkpoint?: string;
  attachments?: AccessRow[];
  items?: AccessRow[];
  messages?: AccessRow[];
  creditUsage?: {
    items: AccessRow[];
    page: number;
    totalPages: number;
    periodDays: number;
  };
}
const sanitizedJson = (body: string): string =>
  JSON.stringify(JSON.parse(body), null, 2)
    .split("\n")
    .map(terminalText)
    .join("\n");
const rowLine = (row: AccessRow): string =>
  terminalText(
    [
      row.id ?? "",
      row.fileName ?? row.name ?? row.title ?? row.subject ?? row.origin ?? "",
      row.status ?? row.visibility ?? "",
      row.mediaType ?? "",
      row.sizeBytes === undefined ? "" : `${row.sizeBytes} bytes`,
    ]
      .filter(Boolean)
      .join("  ")
  );
const shellArgument = (value: string): string =>
  `'${terminalText(value).replaceAll("'", "'\\''")}'`;
const detailCommand = (options: CliArguments): string => {
  const flags = options.values
    .filter((entry) => !["detail", "data", "data-file"].includes(entry.name))
    .map((entry) => ` --${entry.name} ${shellArgument(entry.value)}`)
    .join("");
  return `inth ${options.command}${options.argument ? ` ${options.argument}` : ""}${options.id ? ` ${shellArgument(options.id)}` : ""}${options.organization ? ` --organization ${shellArgument(options.organization)}` : ""}${flags} --detail all`;
};

interface AccessPage {
  rows: AccessRow[];
  next: string | null | undefined;
  nextPage: number | null | undefined;
}
const summarizeData = (data: AccessData, lines: string[]): AccessPage => {
  for (const field of [
    ["ID", data.id],
    ["Organization", data.organizationId],
    ["Project", data.projectId],
    ["Status", data.status],
    ["Completeness", data.dataCompleteness],
  ]) {
    if (field[1] !== undefined) {
      lines.push(terminalText(`${field[0]}: ${field[1]}`));
    }
  }
  if (data.providerAvailable !== undefined) {
    lines.push(`Provider available: ${data.providerAvailable ? "yes" : "no"}`);
  }
  if (data.page !== undefined) {
    lines.push(`Page: ${data.page}`);
  }
  if (data.messages) {
    lines.push(`Messages in this page: ${data.messages.length}`);
  }
  if (data.checkpoint) {
    lines.push("", "Polling checkpoint:", terminalText(data.checkpoint));
  }
  let { nextPage } = data;
  if (data.creditUsage) {
    lines.push(
      `Credit usage page: ${data.creditUsage.page} of ${data.creditUsage.totalPages}`,
      `History window: ${data.creditUsage.periodDays} days`
    );
    if (data.creditUsage.page < data.creditUsage.totalPages) {
      nextPage = data.creditUsage.page + 1;
    }
  }
  return {
    next: data.nextCursor,
    nextPage,
    rows: data.attachments ?? data.items ?? data.creditUsage?.items ?? [],
  };
};
const displayPage = (
  body: string,
  array: boolean,
  lines: string[]
): AccessPage => {
  if (array) {
    // SAFETY: Scriptc checks display fields. Unknown data stays available through --detail and --json.
    const result = JSON.parse(body) as {
      success: boolean;
      data: AccessRow[];
      pagination?: { nextCursor: string | null; hasMore: boolean };
    };
    if (!result.success || !Array.isArray(result.data)) {
      throw new Error("Expected a list");
    }
    return {
      next: result.pagination?.nextCursor,
      nextPage: undefined,
      rows: result.data,
    };
  }
  // SAFETY: This projection is only for human summaries. JSON mode always keeps the complete response.
  const result = JSON.parse(body) as { success: boolean; data: AccessData };
  if (!result.success || !result.data) {
    throw new Error("Expected data");
  }
  return summarizeData(result.data, lines);
};
const v2Summary = (options: CliArguments, body: string): string | undefined => {
  const spec = V2_READ_COMMANDS.find(
    (entry) =>
      entry.command === options.command && entry.action === options.argument
  );
  if (!spec) {
    return undefined;
  }
  try {
    return [
      spec.description ?? `${options.command} ${options.argument}`,
      "",
      formatV2ReadSummary(options, body),
      "",
      "Summary shown. Read every returned field:",
      `  ${detailCommand(options)}`,
      "Use --json for the complete machine-readable response.",
    ].join("\n");
  } catch {
    throw new CliError(
      "invalid_response",
      "Cannot format the API response. Use --json to inspect it."
    );
  }
};
export const formatAccessResource = (
  options: CliArguments,
  body: string
): string | undefined => {
  if (options.json || options.command === "api" || !body) {
    return undefined;
  }
  const spec = resourceCommand(options);
  if (optionValue(options, "detail") === "all") {
    return sanitizedJson(body);
  }
  const discovery = v2Summary(options, body);
  if (discovery !== undefined) {
    return discovery;
  }
  if (!spec?.personOnly || spec.download) {
    return undefined;
  }
  try {
    if (spec.method !== "GET") {
      return sanitizedJson(body);
    }
    const lines = [spec.description ?? `${spec.command} ${spec.action}`, ""];
    const page = displayPage(
      body,
      spec.paginated && spec.command !== "billing",
      lines
    );
    if (spec.paginated || spec.numberedPageMax) {
      lines.push(`Items in this page: ${page.rows.length}`);
    }
    for (const row of page.rows) {
      lines.push(rowLine(row));
    }
    if (page.next) {
      lines.push(
        "",
        "Next cursor; repeat this command with --cursor:",
        terminalText(page.next)
      );
    }
    if (page.nextPage !== undefined && page.nextPage !== null) {
      lines.push("", `Next page: --page ${page.nextPage}`);
    }
    lines.push(
      "",
      "Summary shown. Read every returned field:",
      `  ${detailCommand(options)}`,
      "Use --json for the complete machine-readable response."
    );
    return lines.join("\n");
  } catch {
    throw new CliError(
      "invalid_response",
      "Cannot format the API response. Use --json to inspect it."
    );
  }
};
