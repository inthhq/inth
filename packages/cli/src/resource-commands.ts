import {
  AGENT_ACCESS_COMMANDS,
  accessBody,
  validateAccessOptions,
  validateInboxUpdate,
} from "./agent-access-commands.ts";
import { validateV2ReadOptions } from "./agent-access-v2-reads.ts";
import { v2WriteBody } from "./agent-access-write-input.ts";
import type { CliArguments } from "./arguments.ts";
import { chatBody, validateChatOptions } from "./chat.ts";
import { CliError } from "./cli-error.ts";
import { feedbackFieldJson } from "./feedback.ts";
import { validateAttachmentOptions } from "./upload-commands.ts";

export interface ResourceCommand {
  command: string;
  action: string;
  method: string;
  path: string;
  scoped: boolean;
  paginated: boolean;
  fields: string[];
  required: string[];
  // Fixed JSON body. Commands with one have no body options or --data.
  body?: string;
  personOnly?: boolean;
  scopes?: string[];
  rules?: ResourceInputRule[];
  defaultLimit?: number;
  cursorOnly?: boolean;
  numberedPageMax?: number;
  approval?: string;
  accept?: string;
  download?: string;
  upload?: boolean;
  image?: boolean;
  writeSchema?: string;
  organizationBody?: boolean;
  description?: string;
}

export interface ResourceInputRule {
  name: string;
  key: string;
  type: string;
  location: string;
  required: boolean;
  values?: string[];
  minimum?: number;
  maximum?: number;
  maxItems?: number;
  defaultValue?: string;
  description?: string;
}

const command = (
  group: string,
  action: string,
  method: string,
  path: string,
  scoped = false,
  paginated = false,
  fields: string[] = [],
  required: string[] = [],
  body?: string
): ResourceCommand => ({
  action,
  body,
  command: group,
  fields,
  method,
  paginated,
  path,
  required,
  scoped,
});

// Public REST contract at monorepo PR #1756, commit 4e1d272f71971f7470bcbe25ce261472d7f0af16.
export const RESOURCE_COMMANDS: ResourceCommand[] = [
  command(
    "feedback",
    "",
    "POST",
    "/v1/feedback",
    false,
    false,
    [
      "category",
      "surface",
      "message",
      "expected",
      "actual",
      "reproduction",
      "request-id",
      "operation",
      "client-name",
      "client-version",
    ],
    ["category", "message"]
  ),
  command("org", "list", "GET", "/v1/organizations", false, true),
  command("org", "get", "GET", "/v1/organizations/:id"),
  command(
    "org",
    "create",
    "POST",
    "/v1/organizations",
    false,
    false,
    ["name", "slug"],
    ["name", "slug"]
  ),
  command("region", "list", "GET", "/v1/regions"),
  command("project", "list", "GET", "/v1/projects", true, true),
  command("project", "get", "GET", "/v1/projects/:id"),
  command(
    "project",
    "create",
    "POST",
    "/v1/projects",
    true,
    false,
    ["name", "region", "branding", "trusted-origins"],
    ["name", "region"]
  ),
  command("project", "update", "PATCH", "/v1/projects/:id", false, false, [
    "name",
    "description",
    "branding",
    "trusted-origins",
  ]),
  command("project", "delete", "DELETE", "/v1/projects/:id"),
  command("member", "list", "GET", "/v1/members", true, true),
  command(
    "member",
    "update",
    "PATCH",
    "/v1/members/:id",
    false,
    false,
    ["role"],
    ["role"]
  ),
  command("member", "remove", "DELETE", "/v1/members/:id"),
  command("invitation", "list", "GET", "/v1/invitations", true, true),
  command(
    "invitation",
    "create",
    "POST",
    "/v1/invitations",
    true,
    false,
    ["email", "role"],
    ["email", "role"]
  ),
  command("invitation", "cancel", "DELETE", "/v1/invitations/:id"),
  command("api-key", "list", "GET", "/v1/api-keys", true, true),
  command(
    "api-key",
    "create",
    "POST",
    "/v1/api-keys",
    true,
    false,
    ["name"],
    ["name"]
  ),
  command("api-key", "roll", "POST", "/v1/api-keys/:id/roll"),
  command("api-key", "delete", "DELETE", "/v1/api-keys/:id"),
  command("billing", "", "GET", "/v1/billing", true),
  command(
    "code-audit",
    "repositories",
    "GET",
    "/v1/code-audit/repositories",
    true,
    true
  ),
  command("code-audit", "scans", "GET", "/v1/code-audit/scans", true, true, [
    "repository",
    "status",
  ]),
  command(
    "code-audit",
    "start",
    "POST",
    "/v1/code-audit/scans",
    false,
    false,
    ["repository", "request-id"],
    ["repository"]
  ),
  command(
    "code-audit",
    "request",
    "GET",
    "/v1/code-audit/scan-requests/:id",
    false,
    false,
    ["repository"],
    ["repository"]
  ),
  command("code-audit", "get", "GET", "/v1/code-audit/scans/:id"),
  command("code-audit", "issues", "GET", "/v1/code-audit/scans/:id/issues"),
  command("code-audit", "unlock", "POST", "/v1/code-audit/scans/:id/unlock"),
  command("inbox", "list", "GET", "/v1/inbox", true, true, ["status"]),
  command("inbox", "get", "GET", "/v1/inbox/:id"),
  command(
    "inbox",
    "update",
    "PATCH",
    "/v1/inbox/:id",
    false,
    false,
    ["status", "item-version", "assignee", "unassign"],
    ["item-version"]
  ),
  command("inbox", "github-issue", "POST", "/v1/inbox/:id/github-issue"),
  command("chat", "start", "POST", "/v1/agent-chats", true, false, [
    "message",
    "message-file",
    "inbox-item",
    "client-message-id",
    "attachment-ids",
  ]),
  command("chat", "get", "GET", "/v1/agent-chats/:id"),
  command(
    "chat",
    "send",
    "POST",
    "/v1/agent-chats/:id/messages",
    false,
    false,
    ["message", "message-file", "client-message-id", "attachment-ids"]
  ),
  command(
    "vendor",
    "list",
    "GET",
    "/v1/projects/:project/vendors",
    false,
    true,
    ["project", "state"],
    ["project"]
  ),
  command(
    "vendor",
    "get",
    "GET",
    "/v1/projects/:project/vendors/:id",
    false,
    false,
    ["project"],
    ["project"]
  ),
  command(
    "vendor",
    "approve",
    "POST",
    "/v1/projects/:project/vendors/:id/decision",
    false,
    false,
    ["project"],
    ["project"],
    '{"decision":"approve"}'
  ),
  command(
    "vendor",
    "ignore",
    "POST",
    "/v1/projects/:project/vendors/:id/decision",
    false,
    false,
    ["project"],
    ["project"],
    '{"decision":"ignore"}'
  ),
  ...AGENT_ACCESS_COMMANDS,
];

export const optionValue = (
  options: CliArguments,
  name: string
): string | undefined =>
  options.values.find((entry) => entry.name === name)?.value;

export const resourceCommand = (
  options: CliArguments
): ResourceCommand | undefined =>
  RESOURCE_COMMANDS.find(
    (entry) =>
      entry.command === options.command && entry.action === options.argument
  );

export const jsonObject = (body: string): string => {
  if (new TextEncoder().encode(body).byteLength > 1_048_576) {
    throw new CliError(
      "usage_error",
      "JSON input exceeds the 1048576 byte input limit."
    );
  }
  try {
    JSON.parse(body);
    if (!body.trim().startsWith("{")) {
      throw new Error("Expected an object");
    }
    return body;
  } catch {
    throw new CliError("usage_error", "--data must be a JSON object.");
  }
};

const fieldName = (name: string): string => {
  if (name === "repository") {
    return "repositoryId";
  }
  if (name === "request-id") {
    return "requestId";
  }
  if (name === "item-version") {
    return "version";
  }
  return name;
};

// Whether --data can replace the body options.
export const acceptsData = (spec: ResourceCommand): boolean => {
  if (spec.writeSchema) {
    return (
      !spec.image && spec.writeSchema !== "none" && spec.body === undefined
    );
  }
  return (
    !spec.upload &&
    spec.method !== "GET" &&
    spec.fields.length > 0 &&
    (!spec.rules || spec.rules.some((rule) => rule.location === "body")) &&
    spec.body === undefined &&
    spec.command !== "org"
  );
};

// Options that fill a path segment, such as --project in /v1/projects/:project.
const pathFields = (spec: ResourceCommand): string[] =>
  spec.fields.filter(
    (name) =>
      spec.path.includes(`/:${name}/`) || spec.path.endsWith(`/:${name}`)
  );

const fieldJson = (name: string, value: string): string => {
  if (name === "trusted-origins") {
    try {
      // SAFETY: Scriptc checks the array elements; the explicit checks also run in Node.
      const origins = JSON.parse(value) as string[];
      if (
        !Array.isArray(origins) ||
        // eslint-disable-next-line anti-slop/no-runtime-typeof -- Validate every element at the CLI JSON input boundary in Node as well as Scriptc.
        !origins.every((origin) => typeof origin === "string")
      ) {
        throw new Error("Expected strings");
      }
      return `"trustedOrigins":${JSON.stringify(origins)}`;
    } catch {
      throw new CliError(
        "usage_error",
        "--trusted-origins must be a JSON array of strings."
      );
    }
  }
  return `${JSON.stringify(fieldName(name))}:${JSON.stringify(value)}`;
};

export interface ResourceRequest {
  path: string;
  method: string;
  body?: string;
  scoped: boolean;
}

const validateResourceId = (
  options: CliArguments,
  spec: ResourceCommand
): void => {
  const hasId = spec.path.includes(":id");
  if (hasId !== Boolean(options.id)) {
    throw new CliError(
      "usage_error",
      `Usage: inth ${spec.command} ${spec.action}${hasId ? " <id>" : ""}`
    );
  }
  if (options.id === "." || options.id === "..") {
    throw new CliError("usage_error", "Use a resource ID.");
  }
  for (const name of pathFields(spec)) {
    const value = optionValue(options, name);
    if (value === "." || value === "..") {
      throw new CliError("usage_error", `--${name} must be a resource ID.`);
    }
  }
  if (options.organization !== undefined && !spec.scoped) {
    throw new CliError(
      "usage_error",
      spec.command === "feedback"
        ? "Feedback does not accept --organization; it belongs to the calling credential."
        : "This command does not accept --organization; resource IDs resolve their own organization."
    );
  }
};
const allowedResourceOption = (spec: ResourceCommand, name: string): boolean =>
  spec.fields.includes(name) ||
  (spec.paginated && ["limit", "cursor"].includes(name)) ||
  (name === "detail" && spec.method === "GET" && !spec.download) ||
  (["data", "data-file"].includes(name) && acceptsData(spec));
const validateResourceOptions = (
  options: CliArguments,
  spec: ResourceCommand
): void => {
  const data = optionValue(options, "data");
  const dataFile = optionValue(options, "data-file");
  if (
    data !== undefined &&
    new TextEncoder().encode(data).byteLength > 1_048_576
  ) {
    throw new CliError(
      "usage_error",
      "JSON input exceeds the 1048576 byte input limit."
    );
  }
  if (data !== undefined && dataFile !== undefined) {
    throw new CliError("usage_error", "Use --data or --data-file, not both.");
  }
  for (const entry of options.values) {
    const allowed = allowedResourceOption(spec, entry.name);
    if (!allowed) {
      throw new CliError(
        "usage_error",
        `--${entry.name} is not available with ${spec.command} ${spec.action}.`
      );
    }
    if (
      (data !== undefined || dataFile !== undefined) &&
      spec.fields.includes(entry.name) &&
      !pathFields(spec).includes(entry.name) &&
      !(
        spec.writeSchema &&
        spec.rules?.some(
          (rule) => rule.name === entry.name && rule.location === "control"
        )
      )
    ) {
      throw new CliError(
        "usage_error",
        "Use --data, --data-file, or individual body options, not both."
      );
    }
  }
  if (data === undefined && dataFile === undefined) {
    for (const name of spec.required) {
      if (!optionValue(options, name)?.trim()) {
        throw new CliError(
          "usage_error",
          `Provide --${name} for ${spec.command} ${spec.action}.`
        );
      }
    }
  }
};
const addQueryFields = (
  options: CliArguments,
  spec: ResourceCommand,
  query: URLSearchParams
): void => {
  for (const name of spec.fields) {
    if (pathFields(spec).includes(name)) {
      continue;
    }
    const rule = spec.rules?.find((entry) => entry.name === name);
    if (spec.rules && rule?.location !== "query") {
      continue;
    }
    const value = optionValue(options, name);
    if (value !== undefined) {
      query.set(rule?.key ?? fieldName(name), value);
    }
  }
};
const resourceQuery = (
  options: CliArguments,
  spec: ResourceCommand
): string => {
  const query = new URLSearchParams();
  if (spec.paginated) {
    const limit =
      optionValue(options, "limit") ?? String(spec.defaultLimit ?? 50);
    if (!/^\d+$/u.test(limit) || Number(limit) < 1 || Number(limit) > 100) {
      throw new CliError(
        "usage_error",
        "--limit must be an integer between 1 and 100."
      );
    }
    if (!spec.cursorOnly) {
      query.set("limit", limit);
    }
    const cursor = optionValue(options, "cursor");
    if (cursor) {
      query.set("cursor", cursor);
    }
  }
  if (spec.method === "GET") {
    addQueryFields(options, spec, query);
  }
  if (spec.numberedPageMax && !query.has("page")) {
    query.set("page", "1");
  }
  if (
    options.command === "code-audit" &&
    options.argument === "issues" &&
    (options.json || optionValue(options, "detail") === "all")
  ) {
    query.set("detail", "full");
  }
  return query.toString();
};
const resourceBody = (
  options: CliArguments,
  spec: ResourceCommand
): string | undefined => {
  if (spec.method === "GET" || spec.upload) {
    return undefined;
  }
  if (spec.body !== undefined) {
    return spec.body;
  }
  if (spec.command === "chat" && ["start", "send"].includes(spec.action)) {
    return chatBody(options);
  }
  if (spec.command === "inbox" && spec.action === "update") {
    return validateInboxUpdate(options);
  }
  if (spec.rules) {
    return accessBody(options, spec);
  }
  if (optionValue(options, "data-file") !== undefined) {
    return undefined;
  }
  const data = optionValue(options, "data");
  if (data !== undefined) {
    return jsonObject(data);
  }
  const fields: string[] = [];
  const consent: string[] = [];
  for (const name of spec.fields) {
    const value = optionValue(options, name);
    if (value === undefined) {
      continue;
    }
    if (spec.command === "feedback") {
      fields.push(feedbackFieldJson(name, value));
    } else if (name === "branding" || name === "trusted-origins") {
      consent.push(fieldJson(name, value));
    } else {
      fields.push(fieldJson(name, value));
    }
  }
  if (consent.length) {
    fields.push(`"consent":{${consent.join(",")}}`);
  }
  if (spec.method === "PATCH" && fields.length === 0) {
    throw new CliError("usage_error", "Provide at least one field to update.");
  }
  return fields.length ? `{${fields.join(",")}}` : undefined;
};
export const buildResourceRequest = (
  options: CliArguments
): ResourceRequest => {
  const spec = resourceCommand(options);
  if (!spec) {
    throw new CliError(
      "usage_error",
      "Unknown resource command. Run inth --help."
    );
  }
  validateResourceId(options, spec);
  validateResourceOptions(options, spec);
  if (spec.command === "chat") {
    validateChatOptions(options);
  }
  validateAccessOptions(options, spec);
  validateV2ReadOptions(options);
  validateAttachmentOptions(options);
  if (options.command === "inbox" && options.argument === "update") {
    validateInboxUpdate(options);
  }
  const suffix = resourceQuery(options, spec);
  let path = spec.path.split(":id").join(encodeURIComponent(options.id));
  for (const name of pathFields(spec)) {
    path = path
      .split(`:${name}`)
      .join(encodeURIComponent(optionValue(options, name) ?? ""));
  }
  return {
    body: spec.writeSchema
      ? v2WriteBody(options, spec)
      : resourceBody(options, spec),
    method: spec.method,
    path: path + (suffix ? `?${suffix}` : ""),
    scoped: spec.scoped,
  };
};

export const rawApiRequest = (options: CliArguments): ResourceRequest => {
  const method = (optionValue(options, "method") ?? "GET").toUpperCase();
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    throw new CliError(
      "usage_error",
      "--method must be GET, POST, PUT, PATCH, or DELETE."
    );
  }
  const data = optionValue(options, "data");
  const dataFile = optionValue(options, "data-file");
  if (
    data !== undefined &&
    new TextEncoder().encode(data).byteLength > 1_048_576
  ) {
    throw new CliError(
      "usage_error",
      "JSON input exceeds the 1048576 byte input limit."
    );
  }
  if (data !== undefined && dataFile !== undefined) {
    throw new CliError("usage_error", "Use --data or --data-file, not both.");
  }
  if (method === "GET" && (data !== undefined || dataFile !== undefined)) {
    throw new CliError(
      "usage_error",
      "GET requests do not accept body inputs."
    );
  }
  if (optionValue(options, "output") !== undefined && method !== "GET") {
    throw new CliError(
      "usage_error",
      "--output is only available for GET downloads."
    );
  }
  return {
    body: data === undefined ? undefined : jsonObject(data),
    method,
    path: options.argument,
    scoped: true,
  };
};
