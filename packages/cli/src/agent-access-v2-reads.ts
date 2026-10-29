/* eslint-disable prefer-named-capture-group -- Scriptc uses indexed regex captures. */
import type { CliArguments } from "./arguments.ts";
import { CliError } from "./cli-error.ts";
import type {
  ResourceCommand,
  ResourceInputRule,
} from "./resource-commands.ts";

const query = (
  name: string,
  key = name,
  type = "string",
  maximum = 4096,
  values: string[] = [],
  description?: string
): ResourceInputRule => ({
  description,
  key,
  location: "query",
  maximum,
  name,
  required: false,
  type,
  values,
});

const read = (
  command: string,
  action: string,
  path: string,
  description: string,
  scopes: string[],
  scoped = true,
  paginated = false,
  personOnly = true,
  rules: ResourceInputRule[] = []
): ResourceCommand => ({
  action,
  command,
  defaultLimit: 20,
  description,
  fields: rules.map((rule) => rule.name),
  method: "GET",
  paginated,
  path,
  personOnly,
  required: [],
  rules: paginated ? [...rules, query("cursor")] : rules,
  scoped,
  scopes,
});

const integration = (
  action: string,
  suffix: string,
  description: string,
  paginated = false
): ResourceCommand =>
  read(
    "integration",
    action,
    `/v1/integrations${suffix}`,
    description,
    ["integrations.read"],
    true,
    paginated
  );

export const V2_READ_COMMANDS: ResourceCommand[] = [
  read(
    "account",
    "sessions",
    "/v1/account/sessions",
    "List the signed-in person's browser sessions",
    ["account.security.read"],
    true,
    true
  ),
  read(
    "account",
    "devices",
    "/v1/account/connected-devices",
    "List the signed-in person's connected device grants",
    ["account.security.read"],
    true,
    true
  ),
  integration("status", "", "Read integration status and discovery links"),
  integration(
    "github-installations",
    "/github/installations",
    "List connected GitHub installations",
    true
  ),
  integration(
    "github-repositories",
    "/github/repositories",
    "List connected GitHub repositories and their internal IDs",
    true
  ),
  integration(
    "github-repository-get",
    "/github/repositories/:id",
    "Read a connected GitHub repository and its automation settings"
  ),
  integration(
    "github-project-links",
    "/github/repositories/:id/project-links",
    "List projects linked to a connected GitHub repository",
    true
  ),
  integration(
    "github-link-policies",
    "/github/project-links/:id/policies",
    "List every scan policy for one repository project link",
    true
  ),
  integration(
    "search-console-properties",
    "/search-console/properties",
    "List discovered Google Search Console properties",
    true
  ),
  integration(
    "domain-proofs",
    "/domain-proofs",
    "List retained domain verification proofs",
    true
  ),
  read(
    "website-audit",
    "cookie-inventory",
    "/v1/website-audit/cookie-inventory",
    "Discover the latest website scan for each target and its cookie records",
    ["website-audit.read", "projects.read"],
    true,
    true,
    true,
    [query("project", "projectId", "id", 255)]
  ),
  read(
    "billing",
    "ledger",
    "/v1/billing/credit-ledger",
    "Read all retained settled credit usage and its attribution",
    ["billing.read"],
    true,
    true,
    false,
    [
      query("product", "product", "enum", 255, [
        "agent",
        "code-audit",
        "website-audit",
      ]),
      query(
        "since",
        "since",
        "string",
        8192,
        [],
        "ISO 8601 timestamp with timezone; omit for all retained settled usage"
      ),
      query(
        "until",
        "until",
        "string",
        8192,
        [],
        "ISO 8601 timestamp with timezone; omit to use the server's frozen window"
      ),
    ]
  ),
  read(
    "org",
    "settings-get",
    "/v1/organizations/:id/settings",
    "Read organization settings using its exact organization ID",
    ["organizations.read"],
    false
  ),
  read(
    "code-audit",
    "quote",
    "/v1/code-audit/scans/:id/quote",
    "Read a prepared audit quote, credit total, expiry, and approval availability",
    ["code-audit.read"],
    true,
    false,
    false
  ),
];

const usage = (message: string): never => {
  throw new CliError("usage_error", message);
};

const dateTime = (value: string, name: string): number => {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/u.exec(
      value
    );
  if (!match) {
    return usage(`--${name} must be an ISO 8601 timestamp with a timezone.`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const time = Date.parse(value);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > (days[month - 1] ?? 0) ||
    Number(match[4]) > 23 ||
    Number(match[5]) > 59 ||
    Number(match[6]) > 59 ||
    Number(match[7] ?? 0) > 23 ||
    Number(match[8] ?? 0) > 59 ||
    !Number.isFinite(time)
  ) {
    return usage(
      `--${name} must be a valid ISO 8601 timestamp with a timezone.`
    );
  }
  return time;
};

export const validateV2ReadOptions = (options: CliArguments): void => {
  if (options.command !== "billing" || options.argument !== "ledger") {
    return;
  }
  const since = options.values.find((entry) => entry.name === "since")?.value;
  const until = options.values.find((entry) => entry.name === "until")?.value;
  const start = since === undefined ? undefined : dateTime(since, "since");
  const end = until === undefined ? undefined : dateTime(until, "until");
  if (start !== undefined && end !== undefined && start > end) {
    usage("--since must be earlier than or equal to --until.");
  }
};
