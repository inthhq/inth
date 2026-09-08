import type { CliArguments } from "./arguments.ts";
import { CliError } from "./cli-error.ts";

export interface ResourceCommand {
  command: string;
  action: string;
  method: string;
  path: string;
  scoped: boolean;
  paginated: boolean;
  fields: string[];
  required: string[];
}

const command = (
  group: string,
  action: string,
  method: string,
  path: string,
  scoped = false,
  paginated = false,
  fields: string[] = [],
  required: string[] = []
): ResourceCommand => ({
  action,
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
    ["status", "item-version"],
    ["status", "item-version"]
  ),
  command("inbox", "github-issue", "POST", "/v1/inbox/:id/github-issue"),
];

export const RESOURCE_OPTIONS = [
  "name",
  "slug",
  "limit",
  "cursor",
  "region",
  "description",
  "branding",
  "trusted-origins",
  "role",
  "email",
  "repository",
  "status",
  "request-id",
  "item-version",
  "method",
  "data",
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
  if (options.organization !== undefined && !spec.scoped) {
    throw new CliError(
      "usage_error",
      "This command does not accept --organization; resource IDs resolve their own organization."
    );
  }
};
const validateResourceOptions = (
  options: CliArguments,
  spec: ResourceCommand
): void => {
  const data = optionValue(options, "data");
  for (const entry of options.values) {
    const allowed =
      spec.fields.includes(entry.name) ||
      (spec.paginated && ["limit", "cursor"].includes(entry.name)) ||
      (entry.name === "data" &&
        spec.method !== "GET" &&
        spec.fields.length > 0 &&
        spec.command !== "org");
    if (!allowed) {
      throw new CliError(
        "usage_error",
        `--${entry.name} is not available with ${spec.command} ${spec.action}.`
      );
    }
    if (data !== undefined && spec.fields.includes(entry.name)) {
      throw new CliError(
        "usage_error",
        "Use --data or individual body options, not both."
      );
    }
  }
  if (data === undefined) {
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
const resourceQuery = (
  options: CliArguments,
  spec: ResourceCommand
): string => {
  const query = new URLSearchParams();
  if (spec.paginated) {
    const limit = optionValue(options, "limit") ?? "50";
    if (!/^\d+$/u.test(limit) || Number(limit) < 1 || Number(limit) > 100) {
      throw new CliError(
        "usage_error",
        "--limit must be an integer between 1 and 100."
      );
    }
    query.set("limit", limit);
    const cursor = optionValue(options, "cursor");
    if (cursor) {
      query.set("cursor", cursor);
    }
  }
  if (spec.method === "GET") {
    for (const name of spec.fields) {
      const value = optionValue(options, name);
      if (value !== undefined) {
        query.set(fieldName(name), value);
      }
    }
  }
  return query.toString();
};
const resourceBody = (
  options: CliArguments,
  spec: ResourceCommand
): string | undefined => {
  if (spec.method === "GET") {
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
    if (name === "branding" || name === "trusted-origins") {
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
  const suffix = resourceQuery(options, spec);
  return {
    body: resourceBody(options, spec),
    method: spec.method,
    path:
      spec.path.split(":id").join(encodeURIComponent(options.id)) +
      (suffix ? `?${suffix}` : ""),
    scoped: spec.scoped,
  };
};

export const rawApiRequest = (options: CliArguments): ResourceRequest => {
  const method = (optionValue(options, "method") ?? "GET").toUpperCase();
  if (!["GET", "POST", "PATCH", "DELETE"].includes(method)) {
    throw new CliError(
      "usage_error",
      "--method must be GET, POST, PATCH, or DELETE."
    );
  }
  const data = optionValue(options, "data");
  if (method === "GET" && data !== undefined) {
    throw new CliError("usage_error", "GET requests do not accept --data.");
  }
  return {
    body: data === undefined ? undefined : jsonObject(data),
    method,
    path: options.argument,
    scoped: true,
  };
};
