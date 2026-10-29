import { V2_READ_COMMANDS } from "./agent-access-v2-reads.ts";
import { V2_WRITE_COMMANDS } from "./agent-access-v2-writes.ts";
/* eslint-disable anti-slop/no-runtime-typeof -- Check user JSON in Node as well as Scriptc's checked JSON boundary. */
import type { CliArguments } from "./arguments.ts";
import { CliError } from "./cli-error.ts";
import { terminalText } from "./organizations.ts";
import type {
  ResourceCommand,
  ResourceInputRule,
} from "./resource-commands.ts";
import { UPLOAD_COMMANDS } from "./upload-commands.ts";

const option = (options: CliArguments, name: string): string | undefined =>
  options.values.find((entry) => entry.name === name)?.value;
const input = (
  name: string,
  key: string,
  type: string,
  location: string,
  required = false,
  values: string[] = []
): ResourceInputRule => ({ key, location, name, required, type, values });
const project = (): ResourceInputRule =>
  input("project", "projectId", "id", "path", true);
const queryProject = (): ResourceInputRule =>
  input("project", "projectId", "id", "query");
const cursor = (maximum = 4096, type = "string"): ResourceInputRule => ({
  ...input("cursor", "cursor", type, "query"),
  maximum,
});
const page = (maximum: number): ResourceInputRule => ({
  ...input("page", "page", "integer", "query"),
  defaultValue: "1",
  maximum,
  minimum: 1,
});
const range = (): ResourceInputRule => ({
  ...input("range", "from", "enum", "query", false, [
    "24h",
    "3d",
    "7d",
    "30d",
    "90d",
    "1y",
  ]),
  defaultValue: "7d",
});
const access = (
  group: string,
  action: string,
  method: string,
  path: string,
  description: string,
  scopes: string[],
  rules: ResourceInputRule[] = [],
  scoped = false,
  paginated = false
): ResourceCommand => ({
  action,
  command: group,
  description,
  fields: rules.map((rule) => rule.name),
  method,
  paginated,
  path,
  personOnly: true,
  required: rules.filter((rule) => rule.required).map((rule) => rule.name),
  rules,
  scoped,
  scopes,
});
const consentRead = (
  action: string,
  suffix: string,
  description: string,
  rules: ResourceInputRule[] = []
): ResourceCommand =>
  access(
    "consent",
    action,
    "GET",
    `/v1/projects/:project/consent${suffix}`,
    description,
    ["consent.read", "projects.read"],
    [project(), ...rules]
  );
const billingRead = (
  action: string,
  suffix: string,
  description: string,
  detailed = true,
  rules: ResourceInputRule[] = []
): ResourceCommand =>
  access(
    "billing",
    action,
    "GET",
    `/v1/billing/${suffix}`,
    description,
    [detailed ? "billing.details.read" : "billing.read"],
    rules,
    true
  );
const websiteRead = (
  group: string,
  action: string,
  path: string,
  description: string,
  rules: ResourceInputRule[] = [],
  scoped = false,
  paginated = false
): ResourceCommand =>
  access(
    group,
    action,
    "GET",
    `/v1/website-audit/${path}`,
    description,
    ["website-audit.read", "projects.read"],
    rules,
    scoped,
    paginated
  );

export const AGENT_ACCESS_COMMANDS: ResourceCommand[] = [
  ...UPLOAD_COMMANDS,
  ...V2_READ_COMMANDS,
  ...V2_WRITE_COMMANDS,
  consentRead(
    "config-get",
    "",
    "Read consent settings and configuration links"
  ),
  consentRead(
    "translations-get",
    "/configuration/i18n",
    "Read complete consent translations"
  ),
  consentRead(
    "iab-get",
    "/configuration/iab",
    "Read complete IAB configuration"
  ),
  consentRead(
    "policies-get",
    "/configuration/policies",
    "Read complete consent policies"
  ),
  consentRead("overview", "/overview", "Read the consent analytics summary", [
    range(),
  ]),
  consentRead("analytics", "/analytics", "Read all grouped consent analytics", [
    range(),
  ]),
  {
    ...consentRead(
      "records",
      "/records",
      "Read one numbered page of consent records",
      [
        page(1_000_000),
        { ...input("query", "q", "string", "query"), maximum: 256 },
      ]
    ),
    numberedPageMax: 1_000_000,
  },
  consentRead(
    "lifecycle-get",
    "/lifecycle",
    "Read consent versions and available lifecycle actions"
  ),
  {
    ...access(
      "consent",
      "runtime-keys",
      "GET",
      "/v1/projects/:project/consent/runtime-keys",
      "List runtime key metadata without secret values",
      ["consent.keys.read", "projects.read"],
      [project(), cursor(8192)],
      false,
      true
    ),
    defaultLimit: 50,
  },
  access(
    "consent",
    "config-update",
    "PATCH",
    "/v1/projects/:project/consent",
    "Update consent settings; omitted fields retain their values",
    ["consent.write", "projects.read", "projects.write"],
    [
      project(),
      input("branding", "branding", "enum", "body", false, [
        "inth",
        "c15t",
        "none",
      ]),
      input(
        "session-duration-minutes",
        "sessionDurationMinutes",
        "integer",
        "body",
        false,
        ["5", "15", "30", "60", "180", "360", "720", "1440"]
      ),
      {
        ...input("trusted-origins", "trustedOrigins", "string-array", "body"),
        maxItems: 100,
        maximum: 2048,
        minimum: 1,
      },
    ]
  ),
  access(
    "consent",
    "iab-set",
    "PUT",
    "/v1/projects/:project/consent/configuration/iab",
    "Replace selected IAB vendors; empty arrays clear a list",
    ["consent.write", "projects.read", "projects.write"],
    [
      project(),
      {
        ...input("vendor-ids", "vendorIds", "integer-array", "body", true),
        maxItems: 2000,
        minimum: 0,
      },
      {
        ...input(
          "additional-consent-provider-ids",
          "additionalConsentProviders",
          "integer-array",
          "body"
        ),
        maxItems: 1000,
        minimum: 1,
      },
    ]
  ),
  billingRead(
    "entitlements",
    "entitlements",
    "Read plan entitlements and usage limits",
    false
  ),
  billingRead(
    "configuration",
    "configuration",
    "Read subscriptions, catalog prices, and top-up configuration"
  ),
  {
    ...billingRead(
      "usage",
      "credit-usage",
      "Read one page of credit usage from the last 30 days",
      false,
      [page(1000)]
    ),
    numberedPageMax: 1000,
  },
  {
    ...billingRead(
      "invoices",
      "invoices",
      "List one provider page of invoices",
      true,
      [cursor()]
    ),
    cursorOnly: true,
    paginated: true,
  },
  billingRead(
    "invoice-get",
    "invoices/:id",
    "Read an invoice by its public invoice ID"
  ),
  {
    ...billingRead(
      "invoice-pdf",
      "invoices/:id/pdf",
      "Download an invoice PDF",
      true,
      [input("output", "output", "file", "control", true)]
    ),
    download: "application/pdf",
  },
  billingRead(
    "profile-get",
    "profile",
    "Read the billing profile and tax details"
  ),
  {
    ...billingRead(
      "payment-methods",
      "payment-methods",
      "List payment method summaries without card secrets",
      true,
      [cursor()]
    ),
    defaultLimit: 20,
    paginated: true,
  },
  access(
    "account",
    "get",
    "GET",
    "/v1/account",
    "Read the signed-in person's account settings",
    ["account.read"],
    [],
    true
  ),
  access(
    "notification",
    "get",
    "GET",
    "/v1/notifications/preferences",
    "Read notification preferences and routing",
    ["notifications.read"],
    [],
    true
  ),
  access(
    "org",
    "retention-get",
    "GET",
    "/v1/organizations/:id/data-controls",
    "Read organization data retention controls",
    ["organization-retention.read"]
  ),
  {
    ...access(
      "support",
      "list",
      "GET",
      "/v1/support/conversations",
      "List one page of your support conversations",
      ["support.read"],
      [cursor(4096, "base64url")],
      true,
      true
    ),
    cursorOnly: true,
  },
  access(
    "support",
    "get",
    "GET",
    "/v1/support/conversations/:id",
    "Read one page of support history; retain checkpoint for polling",
    ["support.read"],
    [cursor(4096, "base64url")]
  ),
  {
    ...access(
      "support",
      "attachment-get",
      "GET",
      "/v1/support/attachments/:id/content",
      "Download a support attachment",
      ["support.read"],
      [input("output", "output", "file", "control", true)]
    ),
    download: "*/*",
  },
  {
    ...websiteRead(
      "website",
      "list",
      "targets",
      "List Website Audit targets",
      [queryProject(), cursor()],
      true,
      true
    ),
    defaultLimit: 25,
  },
  websiteRead(
    "website",
    "get",
    "targets/:id",
    "Read a target and its policy and monitoring configuration"
  ),
  websiteRead(
    "website",
    "verification-get",
    "targets/:id/verification",
    "Read website verification status"
  ),
  {
    ...access(
      "website",
      "remove",
      "DELETE",
      "/v1/website-audit/targets/:id",
      "Delete a Website Audit target",
      ["website-audit.write", "projects.read"],
      [input("yes", "yes", "boolean", "control")]
    ),
    approval: "Delete Website Audit target",
  },
  access(
    "website",
    "policies-set",
    "PUT",
    "/v1/website-audit/targets/:id/policy-pages",
    "Replace the target's policy URLs",
    ["website-audit.write", "projects.read"],
    [
      {
        ...input("urls", "policyUrls", "string-array", "body", true),
        maxItems: 20,
        maximum: 2048,
      },
    ]
  ),
  access(
    "website",
    "verification-check",
    "POST",
    "/v1/website-audit/targets/:id/verification",
    "Check website verification using the selected method",
    ["website-audit.write", "projects.read"],
    [
      {
        ...input("method", "method", "enum", "body", false, [
          "dns",
          "http",
          "email",
          "search_console",
        ]),
        description:
          "Verification method; omit to let the server select available methods",
      },
    ]
  ),
  {
    ...websiteRead(
      "website-audit",
      "list",
      "scans",
      "List Website Audit scans",
      [
        queryProject(),
        input("website", "targetId", "id", "query"),
        input("status", "status", "enum", "query", false, [
          "pending",
          "running",
          "completed",
          "failed",
          "cancelled",
        ]),
        cursor(),
      ],
      true,
      true
    ),
    defaultLimit: 25,
  },
  access(
    "website-audit",
    "start",
    "POST",
    "/v1/website-audit/targets/:website/scans",
    "Start a Website Audit; full_audit can spend credits",
    ["website-audit.write", "projects.read"],
    [
      input("website", "targetId", "id", "path", true),
      input("request-id", "requestId", "uuid", "body", true),
      {
        ...input("scope", "scope", "enum", "body", true, [
          "free_preview",
          "full_audit",
        ]),
        description: "Audit scope; full_audit can spend organization credits",
      },
    ]
  ),
  websiteRead(
    "website-audit",
    "get",
    "scans/:id",
    "Read Website Audit status and progress"
  ),
  websiteRead(
    "website-audit",
    "results",
    "scans/:id/results",
    "Read Website Audit results and evidence"
  ),
  {
    ...websiteRead(
      "website-audit",
      "report",
      "scans/:id/report",
      "Read the complete Website Audit V2 report"
    ),
    accept: "application/vnd.inth.web-audit+json;version=2",
  },
  {
    ...websiteRead(
      "website-audit",
      "cookies",
      "scans/:id/cookies",
      "Read one page of observed cookies",
      [cursor()],
      false,
      true
    ),
    defaultLimit: 25,
  },
  access(
    "website-audit",
    "review",
    "POST",
    "/v1/website-audit/scans/:id/review",
    "Review a finding without changing unrelated evidence",
    ["website-audit.write", "projects.read"],
    [
      input("finding", "evidenceId", "id", "body", true),
      input("decision", "action", "enum", "body", true, [
        "dismiss",
        "mark_as_ours",
        "report_vendor",
      ]),
    ]
  ),
  {
    ...websiteRead(
      "website-audit",
      "screenshot-get",
      "scans/:audit/screenshots/:id",
      "Download a Website Audit screenshot",
      [
        input("audit", "scanId", "id", "path", true),
        input("output", "output", "file", "control", true),
      ]
    ),
    download: "image/*",
  },
  {
    ...access(
      "chat",
      "list",
      "GET",
      "/v1/agent-chats",
      "List personal and shared chats in an organization",
      ["agents.read"],
      [cursor()],
      true,
      true
    ),
    defaultLimit: 50,
  },
  {
    ...access(
      "chat",
      "share",
      "POST",
      "/v1/agent-chats/:id/share",
      "Share a personal chat with its organization irreversibly",
      ["agents.write"],
      [
        input("visibility", "visibility", "enum", "control", true, [
          "organization",
        ]),
        input("yes", "yes", "boolean", "control"),
      ]
    ),
    approval: "Share chat with everyone in its organization",
    body: "{}",
  },
  {
    ...access(
      "chat",
      "delete",
      "DELETE",
      "/v1/agent-chats/:id",
      "Delete a personal chat",
      ["agents.write"],
      [input("yes", "yes", "boolean", "control")]
    ),
    approval: "Delete chat",
  },
];

const usage = (message: string): never => {
  throw new CliError("usage_error", message);
};
export const accessId = (value: string, label: string): void => {
  if (
    !value ||
    value.length > 255 ||
    value === "." ||
    value === ".." ||
    value !== terminalText(value) ||
    /\s/u.test(value)
  ) {
    usage(
      `${label} must be a resource ID without whitespace or terminal controls.`
    );
  }
};
const parsedString = (source: string): string => {
  // SAFETY: Scriptc checks JSON types; Node checks the value explicitly below.
  const value = JSON.parse(source) as string;
  if (typeof value !== "string") {
    usage("Expected a string.");
  }
  return value;
};
const stringArray = (rule: ResourceInputRule, source: string): string => {
  // SAFETY: Both runtimes verify the array and each value at this input boundary.
  const values = JSON.parse(source) as string[];
  if (
    !Array.isArray(values) ||
    values.length < (rule.minimum ?? 0) ||
    values.length > (rule.maxItems ?? 100)
  ) {
    usage(`--${rule.name} must be a JSON array in the documented size range.`);
  }
  if (
    !values.every(
      (value) =>
        typeof value === "string" &&
        value.trim().length > 0 &&
        value.length <= (rule.maximum ?? 2048)
    )
  ) {
    usage(`--${rule.name} must contain bounded, nonempty strings.`);
  }
  return JSON.stringify(values);
};
const integerArray = (rule: ResourceInputRule, source: string): string => {
  // SAFETY: Both runtimes verify integer arrays at this input boundary.
  const values = JSON.parse(source) as number[];
  if (!Array.isArray(values) || values.length > (rule.maxItems ?? 100)) {
    usage(`--${rule.name} must be a JSON array in the documented size range.`);
  }
  if (
    !values.every(
      (value) =>
        typeof value === "number" &&
        Number.isSafeInteger(value) &&
        value >= (rule.minimum ?? 0)
    )
  ) {
    usage(`--${rule.name} must contain integers in the documented range.`);
  }
  return JSON.stringify(values);
};
const integerField = (rule: ResourceInputRule, source: string): string => {
  // SAFETY: Both runtimes check the numeric JSON value.
  const value = JSON.parse(source) as number;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < (rule.minimum ?? 0) ||
    value > (rule.maximum ?? Number.MAX_SAFE_INTEGER)
  ) {
    usage(`--${rule.name} must be an integer in the documented range.`);
  }
  if (rule.values?.length && !rule.values.includes(String(value))) {
    usage(`--${rule.name} must be one of: ${rule.values.join(", ")}.`);
  }
  return String(value);
};
const stringField = (rule: ResourceInputRule, source: string): string => {
  const value = parsedString(source);
  if (rule.type === "enum" && !rule.values?.includes(value)) {
    usage(`--${rule.name} must be one of: ${rule.values?.join(", ")}.`);
  }
  if (rule.type === "id") {
    accessId(value, `--${rule.name}`);
  }
  if (
    rule.type === "uuid" &&
    !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/iu.test(
      value
    )
  ) {
    usage(`--${rule.name} must be a UUID v4.`);
  }
  if (value.length > (rule.maximum ?? 8192)) {
    usage(`--${rule.name} exceeds its character limit.`);
  }
  if (rule.type === "base64url" && !/^[A-Za-z0-9_-]+$/u.test(value)) {
    usage(
      "--cursor must be the continuation or checkpoint returned by Support."
    );
  }
  if (rule.name === "cursor" && !value.length) {
    usage("--cursor must be an opaque continuation from the same operation.");
  }
  return JSON.stringify(value);
};
const fieldJson = (rule: ResourceInputRule, source: string): string => {
  if (rule.type === "string-array") {
    return stringArray(rule, source);
  }
  if (rule.type === "integer-array") {
    return integerArray(rule, source);
  }
  if (rule.type === "integer") {
    return integerField(rule, source);
  }
  if (rule.type === "boolean") {
    if (source !== "true" && source !== "false") {
      usage(`--${rule.name} must be true or false.`);
    }
    return source;
  }
  return stringField(rule, source);
};

type BodyValue = string | number | boolean | null | string[] | number[];
const checkedBody = (spec: ResourceCommand, source: string): string => {
  try {
    // SAFETY: Scriptc validates the JSON union; both runtimes validate every field against its declared rule.
    const body = JSON.parse(source) as Record<string, BodyValue>;
    if (!source.trim().startsWith("{")) {
      usage("--data must be a JSON object.");
    }
    const fields: string[] = [];
    for (const key of Object.keys(body)) {
      const rule = spec.rules?.find(
        (entry) => entry.key === key && entry.location === "body"
      );
      if (!rule) {
        return usage(
          `Unknown JSON field ${terminalText(key)} for ${spec.command} ${spec.action}.`
        );
      }
      const value = body[key];
      if (value === undefined) {
        return usage(`Missing value for ${terminalText(key)}.`);
      }
      fields.push(
        `${JSON.stringify(key)}:${fieldJson(rule, JSON.stringify(value))}`
      );
    }
    for (const rule of spec.rules ?? []) {
      if (
        rule.location === "body" &&
        rule.required &&
        body[rule.key] === undefined
      ) {
        usage(`Provide ${rule.key} in the JSON body.`);
      }
    }
    if (!fields.length && spec.method === "PATCH") {
      usage("Provide at least one field to update.");
    }
    return `{${fields.join(",")}}`;
  } catch (error) {
    if (error instanceof CliError) {
      throw error;
    }
    return usage(
      "The JSON body does not match this command's declared inputs."
    );
  }
};

export const accessBody = (
  options: CliArguments,
  spec: ResourceCommand
): string | undefined => {
  if (spec.method === "GET" || spec.method === "DELETE") {
    return undefined;
  }
  const data = option(options, "data");
  if (data !== undefined) {
    return checkedBody(spec, data);
  }
  if (option(options, "data-file") !== undefined) {
    return undefined;
  }
  const fields: string[] = [];
  for (const rule of spec.rules ?? []) {
    const value = option(options, rule.name);
    if (value === undefined && rule.required && rule.location === "path") {
      usage(`Provide --${rule.name} for this resource.`);
    }
    if (rule.location !== "body" || value === undefined) {
      continue;
    }
    if (rule.type === "integer" && !/^\d+$/u.test(value)) {
      usage(`--${rule.name} must be a decimal integer.`);
    }
    const raw = [
      "integer",
      "boolean",
      "string-array",
      "integer-array",
    ].includes(rule.type)
      ? value
      : JSON.stringify(value);
    try {
      fields.push(`${JSON.stringify(rule.key)}:${fieldJson(rule, raw)}`);
    } catch (error) {
      if (error instanceof CliError) {
        throw error;
      }
      usage(`Invalid --${rule.name}.`);
    }
  }
  if (!fields.length && spec.method === "PATCH") {
    usage("Provide at least one field to update.");
  }
  return `{${fields.join(",")}}`;
};

const validateRuleOption = (
  options: CliArguments,
  rule: ResourceInputRule
): void => {
  let value = option(options, rule.name);
  if (value === undefined && rule.required && rule.location === "path") {
    usage(`Provide --${rule.name} for this resource.`);
  }
  if (value === undefined || rule.location === "body") {
    return;
  }
  if (rule.name === "query") {
    value = value.trim();
    const trimmed = value;
    options.values = options.values.map((entry) =>
      entry.name === "query" ? { name: entry.name, value: trimmed } : entry
    );
  }
  if (rule.type === "integer" && !/^\d+$/u.test(value)) {
    usage(`--${rule.name} must be a decimal integer.`);
  }
  try {
    fieldJson(
      rule,
      rule.type === "integer" || rule.type === "boolean"
        ? value
        : JSON.stringify(value)
    );
  } catch (error) {
    if (error instanceof CliError) {
      throw error;
    }
    usage(`Invalid --${rule.name}.`);
  }
};
export const validateAccessOptions = (
  options: CliArguments,
  spec: ResourceCommand
): void => {
  const detail = option(options, "detail");
  if (detail !== undefined && !["summary", "all"].includes(detail)) {
    usage("--detail must be summary or all.");
  }
  if (!spec.rules) {
    return;
  }
  if (options.id) {
    accessId(options.id, "Resource ID");
  }
  if (options.organization !== undefined) {
    accessId(options.organization, "--organization");
  }
  if (spec.cursorOnly && option(options, "limit") !== undefined) {
    usage(
      "This command uses a fixed provider page size and does not accept --limit."
    );
  }
  for (const rule of spec.rules ?? []) {
    validateRuleOption(options, rule);
  }
  if (options.command === "support" && options.id) {
    const prefix = options.argument.startsWith("attachment-") ? "sat_" : "spc_";
    if (
      options.id.length > 64 ||
      !new RegExp(`^${prefix}[1-9a-km-z]+$`, "u").test(options.id)
    ) {
      usage("Use the Support ID returned by the same operation.");
    }
  }
};

export const requireAccessPerson = (
  options: CliArguments,
  key?: string
): void => {
  if (
    key &&
    AGENT_ACCESS_COMMANDS.some(
      (spec) =>
        spec.personOnly === true &&
        spec.command === options.command &&
        spec.action === options.argument
    )
  ) {
    usage(
      "This command requires a person's approved sign-in. Unset INTH_TOKEN and omit --token, then use inth login or --auth agent."
    );
  }
};

interface InboxUpdate {
  version: string;
  status?: string;
  assignedToUserId?: string | null;
}
const inboxBody = (data: string): InboxUpdate => {
  try {
    // SAFETY: Both runtimes validate every field before serialization.
    const body = JSON.parse(data) as InboxUpdate;
    if (
      !data.trim().startsWith("{") ||
      Object.keys(body).some(
        (key) => !["version", "status", "assignedToUserId"].includes(key)
      )
    ) {
      usage("Inbox JSON accepts version, status, and assignedToUserId only.");
    }
    return body;
  } catch (error) {
    if (error instanceof CliError) {
      throw error;
    }
    return usage(
      "Inbox --data must be a JSON object with a decimal version string and an update."
    );
  }
};
const serializeInboxUpdate = (body: InboxUpdate): string => {
  const { version, status, assignedToUserId } = body;
  if (
    typeof version !== "string" ||
    !/^\d+$/u.test(version) ||
    !Number.isSafeInteger(Number(version)) ||
    Number(version) < 1
  ) {
    usage(
      "--item-version must be the positive safe-integer version string returned by inbox get."
    );
  }
  if (
    status !== undefined &&
    !["open", "accepted", "dismissed", "resolved"].includes(status)
  ) {
    usage("Invalid Inbox status.");
  }
  if (assignedToUserId !== undefined && assignedToUserId !== null) {
    if (typeof assignedToUserId !== "string") {
      usage("assignedToUserId must be a member user ID or null.");
    }
    accessId(assignedToUserId, "--assignee");
  }
  if (status === undefined && assignedToUserId === undefined) {
    usage("Provide --status, --assignee, or --unassign.");
  }
  const fields: string[] = [];
  if (status !== undefined) {
    fields.push(`"status":${JSON.stringify(status)}`);
  }
  fields.push(`"version":${JSON.stringify(version)}`);
  if (assignedToUserId !== undefined) {
    fields.push(`"assignedToUserId":${JSON.stringify(assignedToUserId)}`);
  }
  return `{${fields.join(",")}}`;
};
export const validateInboxUpdate = (
  options: CliArguments
): string | undefined => {
  if (option(options, "data-file") !== undefined) {
    return undefined;
  }
  const data = option(options, "data");
  if (data !== undefined) {
    return serializeInboxUpdate(inboxBody(data));
  }
  const assignee = option(options, "assignee");
  const unassign = option(options, "unassign") === "true";
  if (assignee !== undefined && unassign) {
    usage("Use --assignee or --unassign, not both.");
  }
  return serializeInboxUpdate({
    assignedToUserId: unassign ? null : assignee,
    status: option(options, "status"),
    version: option(options, "item-version") ?? "",
  });
};
