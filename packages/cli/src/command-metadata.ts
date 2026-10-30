import { boilerplateFrameworks } from "../vendor/c15t/generate/index.ts";
import { requiresAgentConnection } from "./auth-types.ts";
import { C15T_CODEMODS_USAGE } from "./c15t-codemods.ts";
import { C15T_USAGE, CODING_AGENTS } from "./c15t.ts";
import { FEEDBACK_CATEGORIES, FEEDBACK_SURFACES } from "./feedback.ts";
import { MCP_CLIENTS } from "./mcp-clients.ts";
import { RESOURCE_COMMANDS, acceptsData } from "./resource-commands.ts";
import type { ResourceCommand } from "./resource-commands.ts";

export interface OptionMetadata {
  name: string;
  type: string;
  description: string;
  required: boolean;
  values: string[];
  defaultValue: string | null;
}
export interface CommandMetadata {
  command: string;
  action: string;
  usage: string;
  description: string;
  authentication: string;
  scopes: string[];
  effects: string[];
  options: OptionMetadata[];
  examples: string[];
  paginated: boolean;
}
const option = (
  name: string,
  type: string,
  description: string,
  values: string[] = [],
  defaultValue: string | null = null
): OptionMetadata => ({
  defaultValue,
  description,
  name,
  required: false,
  type,
  values,
});
export const OPTION_METADATA: OptionMetadata[] = [
  option(
    "expected-instance-id",
    "string",
    "Exact instance ID from consent lifecycle-get"
  ),
  option(
    "expected-backend-version",
    "string",
    "Exact backend version from consent lifecycle-get"
  ),
  option(
    "overlap-seconds",
    "integer",
    "Required rotation overlap 0..86400; 0 immediately revokes the old secret"
  ),
  option("plan", "string", "Plan"),
  option("billing-interval", "string", "Billing interval"),
  option("promotion-code", "string", "Promotion code"),
  option("checkout-attempt-id", "string", "Checkout attempt id"),
  option(
    "save-approval",
    "string",
    "Save a new private approval JSON file with exact organization, input and full quote"
  ),
  option("catalog-version", "integer", "Catalog version"),
  option("credits", "integer", "Credits"),
  option("enabled", "string", "Explicit true or false; never inferred"),
  option(
    "monthly-purchase-limit",
    "integer",
    "Maximum automatic credit purchases per month"
  ),
  option("quantity-credits", "integer", "Quantity credits"),
  option("threshold-credits", "integer", "Threshold credits"),
  option("confirm-cancellation", "string", "Confirm cancellation"),
  option("payment-method-id", "string", "Payment method id"),
  option("confirm-payment-method-id", "string", "Confirm payment method id"),
  option("hide-pii", "string", "Hide pii"),
  option(
    "confirmation",
    "string",
    "Exact server-required email, slug or session revocation phrase; --yes does not replace it"
  ),
  option("family", "string", "Family"),
  option("mode", "string", "Mode"),
  option("configured", "string", "Configured"),
  option(
    "user-ids",
    "json",
    "JSON array of current organization member user IDs"
  ),
  option("new-slug", "string", "New slug"),
  option("expected-slug", "string", "Expected slug"),
  option("mutation-id", "string", "Mutation id"),
  option("expected-version", "integer", "Exact current retention version"),
  option("provider-retention", "string", "Provider retention"),
  option("branch-filters", "json", "Branch filters"),
  option("ignored-paths", "json", "Ignored paths"),
  option("quote-id", "string", "Quote id"),
  option("candidate-plan-checksum", "string", "Candidate plan checksum"),
  option(
    "max-credits",
    "integer",
    "Maximum credits for prepared quote approval only"
  ),

  option(
    "json",
    "boolean",
    "Emit one JSON result; disable prompts and browser login"
  ),
  option("non-interactive", "boolean", "Disable prompts and browser login"),
  option("help", "boolean", "Show help for this command"),
  option("version", "boolean", "Show the CLI version"),
  option("complete", "boolean", "Check browser approval and finish signing in"),
  option(
    "wait",
    "boolean",
    "Wait for browser approval and finish sign-in automatically"
  ),
  option(
    "timeout",
    "integer",
    "Maximum approval wait in seconds, 1 through 3600",
    [],
    "600"
  ),
  option(
    "auth",
    "string",
    "Override the selected saved connection",
    ["browser", "agent"],
    null
  ),
  option(
    "scopes",
    "string",
    "Comma-separated account permissions",
    [],
    "organizations.read"
  ),
  option(
    "yes",
    "boolean",
    "Approve this command's stated action for its explicit target"
  ),
  option("token", "string", "Organization API key; overrides INTH_TOKEN"),
  option("organization", "string", "Organization ID or local default override"),
  option("no-browser", "boolean", "Print the approval URL without opening it"),
  option("name", "string", "Resource name"),
  option("slug", "string", "Organization slug"),
  option("limit", "integer", "Page size, 1 through 100", [], "50"),
  option(
    "cursor",
    "string",
    "Opaque pagination.nextCursor from the previous page"
  ),
  option("region", "string", "Project region ID from inth region list"),
  option("project", "string", "Project ID"),
  option("product", "string", "Filter settled credit usage by product", [
    "agent",
    "code-audit",
    "website-audit",
  ]),
  option("since", "string", "Inclusive usage start timestamp with timezone"),
  option("until", "string", "Inclusive usage end timestamp with timezone"),
  option("description", "string", "Project description"),
  option("branding", "string", "Consent branding", ["inth", "c15t", "none"]),
  option(
    "trusted-origins",
    "json-array",
    "Consent origins as a JSON array of strings"
  ),
  option("email", "string", "Sign-in or invitation email address"),
  option("role", "string", "Organization role", ["owner", "admin", "member"]),
  option("repository", "string", "Repository ID"),
  option("status", "string", "Filter or update the resource status"),
  option("state", "string", "Vendor state", [
    "active",
    "not_seen_recently",
    "ignored",
    "approved",
    "blocked",
  ]),
  option("request-id", "string", "Idempotency key for scan start retries"),
  option("category", "string", "Feedback category", FEEDBACK_CATEGORIES),
  option(
    "surface",
    "string",
    "Inth interface the report concerns",
    FEEDBACK_SURFACES
  ),
  option("message", "string", "Feedback summary, up to 8000 characters"),
  option(
    "message-file",
    "string",
    "Read the message from a UTF-8 file, or - for stdin"
  ),
  option(
    "client-message-id",
    "string",
    "UUID v4 to reuse when retrying the same chat message"
  ),
  option(
    "file",
    "string",
    "One local regular byte file; stdin is not accepted"
  ),
  option(
    "file-name",
    "string",
    "Display basename, 1 through 255 characters; no trimming or renaming"
  ),
  option(
    "media-type",
    "string",
    "Supported MIME type without parameters; inferred from the display filename"
  ),
  option(
    "client-attachment-id",
    "string",
    "UUID to reuse for identical pending Support intent metadata"
  ),
  option(
    "attachment-ids",
    "json-array",
    "Ordered JSON array of up to 10 unique aga_ draft IDs"
  ),
  option(
    "receipt",
    "string",
    "Private new recovery file; contains IDs and metadata, never signed URLs"
  ),
  option("inbox-item", "string", "Inbox item ID the new chat concerns"),
  option("expected", "string", "Expected behavior, up to 2000 characters"),
  option("actual", "string", "Actual behavior, up to 2000 characters"),
  option("reproduction", "string", "Steps to reproduce, up to 4000 characters"),
  option("operation", "string", "Affected operation, up to 255 characters"),
  option(
    "client-name",
    "string",
    "Reporting client name, up to 100 characters"
  ),
  option(
    "client-version",
    "string",
    "Reporting client version, up to 100 characters"
  ),
  option(
    "item-version",
    "string",
    "Version from the last read of this Inbox item"
  ),
  option(
    "method",
    "string",
    "HTTP request method",
    ["GET", "POST", "PUT", "PATCH", "DELETE"],
    "GET"
  ),
  option(
    "data",
    "json-object",
    "JSON body; replaces individual body options, including required fields"
  ),
  option(
    "data-file",
    "string",
    "Read a JSON body from a UTF-8 file, or - for stdin"
  ),
  option(
    "detail",
    "string",
    "Human output detail; JSON always retains the complete response",
    ["summary", "all"],
    "summary"
  ),
  option(
    "page",
    "integer",
    "Numbered page; does not auto-fetch later pages",
    [],
    "1"
  ),
  option("query", "string", "Consent-record search text, up to 256 characters"),
  option(
    "range",
    "string",
    "Requested analytics range; the response reports plan limits",
    ["24h", "3d", "7d", "30d", "90d", "1y"],
    "7d"
  ),
  option(
    "session-duration-minutes",
    "integer",
    "Consent session duration in minutes"
  ),
  option(
    "vendor-ids",
    "json-array",
    "IAB vendor IDs as a JSON integer array; [] clears the list"
  ),
  option(
    "additional-consent-provider-ids",
    "json-array",
    "Google ATP IDs as a JSON positive-integer array; [] clears the list"
  ),
  option("website", "string", "Website Audit target ID"),
  option("finding", "string", "Evidence ID from the Website Audit report"),
  option("decision", "string", "Evidence review action", [
    "dismiss",
    "mark_as_ours",
    "report_vendor",
  ]),
  option(
    "urls",
    "json-array",
    "Policy URLs as a JSON string array; [] clears the list"
  ),
  option("visibility", "string", "Chat audience after sharing", [
    "organization",
  ]),
  option("assignee", "string", "Current organization member's user ID"),
  option(
    "unassign",
    "boolean",
    "Clear the Inbox assignee while preserving omitted status"
  ),
  option("audit", "string", "Website Audit scan ID"),
  option(
    "output",
    "string",
    "Write binary data to a new file; never overwrite an existing path"
  ),
  option("agent", "string", "MCP client to configure", MCP_CLIENTS),
  option("scope", "string", "MCP configuration location", [
    "project",
    "global",
  ]),
  option(
    "dry-run",
    "boolean",
    "Preview configuration changes without writing files"
  ),
  option(
    "check",
    "boolean",
    "Report whether an update is available without installing it"
  ),
];
const baseOptions = ["json", "non-interactive", "help", "version"];
const optionDescription = (item: OptionMetadata, group: string): string => {
  if (item.name === "request-id" && group === "feedback") {
    return "Request ID from the failed operation, up to 128 characters";
  }
  if (item.name === "message" && group === "chat") {
    return "Chat message, up to 50000 characters; may be empty with attachments";
  }
  return item.description;
};
export const commandOptions = (
  names: string[],
  required: string[] = [],
  group = ""
): OptionMetadata[] =>
  OPTION_METADATA.filter((item) =>
    [...baseOptions, ...names].includes(item.name)
  ).map((item) => ({
    defaultValue: item.defaultValue,
    description: optionDescription(item, group),
    name: item.name,
    required: required.includes(item.name),
    type: item.type,
    values:
      item.name === "status" && group === "inbox"
        ? ["open", "accepted", "dismissed", "resolved"]
        : item.values,
  }));
const descriptions = [
  ["feedback", "Send feedback about Inth to the Inth team"],
  ["org list", "List organizations"],
  ["org get", "Read an organization"],
  ["org create", "Create an organization"],
  ["region list", "List available project regions"],
  ["project list", "List projects"],
  ["project get", "Read a project and its consent settings"],
  ["project create", "Create a project"],
  ["project update", "Update a project"],
  ["project delete", "Delete a project"],
  ["member list", "List organization members"],
  ["member update", "Change a member's role"],
  ["member remove", "Remove a member"],
  ["invitation list", "List pending invitations"],
  ["invitation create", "Send an invitation"],
  ["invitation cancel", "Cancel an invitation"],
  ["api-key list", "List organization API keys"],
  ["api-key create", "Create an API key; its secret is shown once"],
  ["api-key roll", "Rotate an API key; its secret is shown once"],
  ["api-key delete", "Revoke an API key"],
  ["billing", "Read the plan and credit balance"],
  ["code-audit repositories", "List connected repositories"],
  ["code-audit scans", "List scans"],
  ["code-audit start", "Start a scan of the production branch"],
  ["code-audit request", "Check a pending scan request"],
  ["code-audit get", "Read a scan and its progress"],
  ["code-audit issues", "Read scan findings"],
  ["code-audit unlock", "Spend credits to unlock a report"],
  ["inbox list", "List Inbox findings"],
  ["inbox get", "Read a finding"],
  ["inbox update", "Change a finding's status or assignee"],
  ["inbox github-issue", "Create a GitHub issue for a finding"],
  ["chat start", "Start a private Inth Agent chat"],
  ["chat get", "Read a chat and its latest reply"],
  ["chat send", "Send a follow-up message to a chat"],
  ["vendor list", "List vendors seen on a project"],
  ["vendor get", "Read a vendor, where it was seen, and how it loaded"],
  ["vendor approve", "Approve a vendor seen on a project"],
  ["vendor ignore", "Ignore a vendor seen on a project"],
];
const attachmentEffects = (spec: ResourceCommand): string[] => {
  const effects: string[] = [];
  if (spec.upload) {
    effects.push(
      "Reads one bounded local regular file before authentication. --file - and JSON body flags are rejected. Uploading does not send a message.",
      spec.command === "chat"
        ? "Up to 20 MiB per file, 10 drafts and 40 MiB total. The server checks content, ownership and readiness. A lost response is not retried; use chat attachment-list, which remains available while processing is paused."
        : "Images up to 10 MiB or recordings up to 100 MiB. One signed storage PUT with no API credentials or redirects, then finalization. A lost PUT response triggers finalization without another PUT. Record recovery IDs or use --receipt for crash recovery."
    );
  }
  if (spec.command === "chat" && spec.action === "attachment-list") {
    effects.push(
      "Returns all pending ready or uploading drafts, at most 10, without pagination. Sent attachments are in the chat transcript. Discovery and downloads stay accessible while processing is paused."
    );
  }
  return effects;
};
const discoveryEffects = (spec: ResourceCommand): string[] => {
  const effects: string[] = [];
  if (spec.command === "billing" && spec.action === "ledger") {
    effects.push(
      "Requires organization owner access. Covers all retained settled consumption with attribution, not grants, balances or pending holds.",
      "Returns data.items and data.nextCursor. Omitted dates and product inherit the cursor's frozen window; do not add new defaults on continuation."
    );
  }
  if (spec.command === "website-audit" && spec.action === "cookie-inventory") {
    effects.push(
      "Returns a latest-scan index with cookiesPath pointers. Read cookie rows with website-audit cookies <scanId>."
    );
  }
  if (spec.command === "code-audit" && spec.action === "quote") {
    effects.push(
      "Reads the pinned credit quote without approving or spending. approvalAvailability reports API, Dashboard or unavailable continuation. Existing API-key capabilities do not include code-audit.read."
    );
  }
  if (
    spec.command === "integration" &&
    spec.action === "github-project-links"
  ) {
    effects.push(
      "Embedded policy previews have their own policiesNextCursor. Use integration github-link-policies <linkId> to read every policy."
    );
  }
  return effects;
};
const writeEffects = (spec: ResourceCommand): string[] => {
  if (!spec.writeSchema) {
    return [];
  }
  const effects: string[] = [
    "New writes require explicit approved write scopes and remain subject to server rollout and operational controls.",
    "Mutations are sent once. Only one authentication refresh after a 401 may resend the identical input. A lost response is an unknown outcome.",
  ];
  if (spec.organizationBody) {
    effects.push(
      "Organization selection is resolved once and sent in the JSON body, with no organization query fields."
    );
  }
  if (spec.image) {
    effects.push(
      "Sends original validated PNG, JPEG, WebP or GIF bytes up to 1 MiB to the trusted API. URLs, stdin, JSON and redirects are rejected."
    );
  }
  if (spec.command === "support" && ["start", "send"].includes(spec.action)) {
    effects.push(
      "Requires nonempty text, a caller-stable client message UUID and at most five ordered unique ready attachment IDs. Upload files separately; uploading does not send them."
    );
  }
  if (
    spec.command === "billing" &&
    [
      "plan-preview",
      "plan-change",
      "credit-preview",
      "credit-purchase",
    ].includes(spec.action)
  ) {
    effects.push(
      "Preview and execution are separate. Save with --save-approval and execute the reviewed file with --data-file. Keep exact input, full quote and checkout UUID. Recurring terms are in nextCycle. Hosted actions require a person; no provider tokens or card details are accepted."
    );
  }
  if (spec.command === "code-audit") {
    effects.push(
      "Only this prepared quote approval has a maxCredits cap. Preserve quoteId, candidatePlanChecksum and UUIDv4 requestId. pending, expired, requires_dashboard, insufficient_credits and error return exit code 2, with the full response. Report unlock and chat replies have no cap."
    );
  }
  if (spec.command === "account" && spec.action === "sessions-revoke") {
    effects.push(
      "OAuth has no current browser session. mode others may require the Dashboard. mode all requires the exact revoke-all-browser-sessions confirmation even with --yes."
    );
  }
  return effects;
};
const resourceEffects = (spec: ResourceCommand): string[] => {
  if (spec.command === "feedback") {
    return [
      "Sends the supplied report immediately. Follow the user's permission to send feedback.",
      "Report unexpected failures, misleading docs, missing capabilities, or workarounds. Do not report routine validation errors.",
      "Do not include credentials, personal data, customer payloads, or full transcripts.",
      "Submit once per distinct issue. Continue the original task if reporting fails.",
      "Requires authentication, with no product scope or organization role. No credits charged. Ten new reports per caller per UTC clock hour. Identical reports from the same caller within a UTC day return the existing reference without consuming that quota.",
    ];
  }
  const effects =
    spec.method === "GET" ? [] : ["Writes take effect immediately."];
  if (spec.command === "chat") {
    effects.push(
      "Requires a person's approved sign-in. Organization API keys cannot access chats.",
      "Chat writes need agents.write. Reading the title and transcript also needs agents.read."
    );
    if (["start", "send"].includes(spec.action)) {
      effects.push(
        "Asks the Inth Agent and can spend organization credits. Returns acceptance; use chat get to read the reply.",
        "Use --message, --message-file, --data or --data-file, or omit text with nonempty --attachment-ids. Reuse --client-message-id with the same text and ordered attachment IDs when retrying."
      );
    }
  }
  effects.push(
    ...attachmentEffects(spec),
    ...discoveryEffects(spec),
    ...writeEffects(spec)
  );
  if (spec.approval) {
    effects.push(
      "Requires one confirmation for the explicit target, or --yes."
    );
  }
  if (spec.command === "chat" && spec.action === "share") {
    effects.push("Sharing with the organization cannot be undone.");
  }
  if (spec.personOnly) {
    effects.push(
      requiresAgentConnection(spec.scopes ?? [])
        ? "Requires a person's explicitly scoped agent connection. Organization API keys and ordinary browser sign-ins cannot use this command."
        : "Requires a person's approved browser or agent connection. Organization API keys cannot use this command."
    );
  }
  if (spec.download) {
    effects.push(
      "Saves at most 128 MiB to an explicit new --output file. Existing files are never overwritten. API credentials are never forwarded to storage hosts."
    );
  }
  if (
    spec.command === "code-audit" &&
    ["start", "unlock"].includes(spec.action)
  ) {
    effects.push("Can spend organization credits.");
  }
  if (spec.command === "api-key" && ["create", "roll"].includes(spec.action)) {
    effects.push("Returns a secret once. Store it securely.");
  }
  if (spec.action === "github-issue") {
    effects.push("Creates an issue on GitHub.");
  }
  if (spec.command === "vendor" && spec.method !== "GET") {
    effects.push(
      spec.action === "approve"
        ? "Accepts the vendor's data sharing on the project."
        : "Ignores the vendor on the project.",
      "Closes the vendor's runtime Inbox finding, if one exists. Later scans keep the decision. Repeating a decision changes nothing.",
      "Take the vendor ID from inth vendor list, or both IDs from runtimeVendor in inth inbox get. Requires an admin or owner role."
    );
  }
  return effects;
};
const resourceFamily = (spec: ResourceCommand): string => {
  const names = [
    ["org", "organizations"],
    ["project", "projects"],
    ["member", "members"],
    ["invitation", "members"],
    ["api-key", "api-keys"],
    ["chat", "agents"],
  ];
  // Vendors are read with the project; decisions have their own scope.
  if (spec.command === "vendor") {
    return spec.method === "GET" ? "projects" : "vendors";
  }
  return names.find((entry) => entry[0] === spec.command)?.[1] ?? spec.command;
};
const discoveryExamples = (spec: ResourceCommand): string[] => {
  const examples = [
    [
      "account sessions",
      "inth account sessions --organization org_123 --limit 20 --json",
    ],
    [
      "account devices",
      "inth account devices --organization org_123 --limit 20 --json",
    ],
    [
      "integration status",
      "inth integration status --organization org_123 --json",
    ],
    [
      "integration github-installations",
      "inth integration github-installations --organization org_123 --json",
    ],
    [
      "integration github-repositories",
      "inth integration github-repositories --organization org_123 --json",
    ],
    [
      "integration github-repository-get",
      "inth integration github-repository-get repo_123 --organization org_123 --json",
    ],
    [
      "integration github-project-links",
      "inth integration github-project-links repo_123 --organization org_123 --json",
    ],
    [
      "integration github-link-policies",
      "inth integration github-link-policies link_123 --organization org_123 --json",
    ],
    [
      "integration search-console-properties",
      "inth integration search-console-properties --organization org_123 --json",
    ],
    [
      "integration domain-proofs",
      "inth integration domain-proofs --organization org_123 --json",
    ],
    [
      "website-audit cookie-inventory",
      "inth website-audit cookie-inventory --organization org_123 --project prj_123 --json",
    ],
    [
      "billing ledger",
      "inth billing ledger --organization org_123 --product code-audit --since 2026-01-01T00:00:00Z --json",
    ],
    ["org settings-get", "inth org settings-get org_123 --json"],
    [
      "code-audit quote",
      "inth code-audit quote scan_123 --organization org_123 --json",
    ],
  ];
  const example = examples.find(
    (entry) => entry[0] === `${spec.command} ${spec.action}`
  )?.[1];
  return example ? [example] : [];
};
const writeExamples = (spec: ResourceCommand): string[] => {
  let target = "";
  if (spec.path.includes(":id")) {
    target = spec.command === "support" ? " spc_1" : " resource_123";
  }
  const project = spec.path.includes(":project") ? " --project prj_123" : "";
  const confirm = spec.approval ? " --yes" : "";
  if (spec.image) {
    return [
      `inth ${spec.command} ${spec.action}${target} --file image.png --json`,
    ];
  }
  if (acceptsData(spec)) {
    return [
      `inth ${spec.command} ${spec.action}${target}${project} --data-file input.json${confirm} --json`,
    ];
  }
  if (spec.action === "share") {
    return [`inth support share spc_1 --visibility organization --yes --json`];
  }
  return [
    `inth ${spec.command} ${spec.action}${target}${project}${confirm} --json`,
  ];
};
const resourceExamples = (
  spec: ResourceCommand,
  invocation: string,
  usage: string
): string[] => {
  if (spec.writeSchema) {
    return writeExamples(spec);
  }
  const discovery = discoveryExamples(spec);
  if (discovery.length) {
    return discovery;
  }
  if (spec.command === "chat" && spec.action === "attachment-discard") {
    return [
      "inth chat attachment-discard aga_first --organization org_123 --json",
    ];
  }
  if (
    spec.command === "support" &&
    ["attachment-finalize", "attachment-discard"].includes(spec.action)
  ) {
    return [
      `inth support ${spec.action} sat_123 --organization org_123 --json`,
    ];
  }
  if (spec.upload) {
    return [
      spec.command === "chat"
        ? "inth chat attachment-upload --file policy.pdf --organization org_123 --json"
        : "inth support attachment-upload --file recording.webm --client-attachment-id b8dde372-1324-4d2e-a15a-fd3761964299 --receipt ./upload-receipt.json --organization org_123 --json",
    ];
  }
  if (spec.command === "chat" && ["start", "send"].includes(spec.action)) {
    return [
      `${invocation} --message "Explain this finding"`,
      `${invocation} --message-file question.txt --json`,
      `${invocation} --message-file - --json`,
      `${invocation} --attachment-ids '["aga_first"]' --json`,
    ];
  }
  const writes = [
    [
      "consent config-update",
      "inth consent config-update --project prj_123 --branding inth",
    ],
    [
      "consent iab-set",
      "inth consent iab-set --project prj_123 --vendor-ids '[42,755]'",
    ],
    ["website remove", "inth website remove target_123 --yes"],
    [
      "website policies-set",
      `inth website policies-set target_123 --urls '["https://example.com/privacy"]'`,
    ],
    [
      "website verification-check",
      "inth website verification-check target_123 --method dns",
    ],
    [
      "website-audit start",
      "inth website-audit start --website target_123 --request-id b8dde372-1324-4d2e-a15a-fd3761964299 --scope free_preview",
    ],
    [
      "website-audit review",
      "inth website-audit review scan_123 --finding finding_123 --decision dismiss",
    ],
    ["chat share", "inth chat share chat_123 --visibility organization --yes"],
    ["chat delete", "inth chat delete chat_123 --yes"],
    [
      "inbox update",
      "inth inbox update inbox_123 --item-version 3 --assignee user_123",
    ],
  ];
  const example = writes.find(
    (entry) => entry[0] === `${spec.command} ${spec.action}`
  )?.[1];
  if (example) {
    return [example, `${example} --json`];
  }
  if (spec.download) {
    let target = "resource_123";
    if (spec.command === "support") {
      target = "sat_1";
    }
    if (spec.command === "chat") {
      target = "aga_first";
    }
    const extension = spec.command === "billing" ? "pdf" : "bin";
    const audit = spec.command === "website-audit" ? " --audit scan_123" : "";
    return [
      `inth ${spec.command} ${spec.action} ${target}${audit} --output download.${extension} --json`,
    ];
  }
  if (spec.command === "support" && spec.action === "get") {
    return ["inth support get spc_1 --json"];
  }
  return [usage, `${usage} --json`];
};
const resourceOptions = (spec: ResourceCommand): OptionMetadata[] => {
  const names = ["token", "auth", ...spec.fields];
  if (spec.method === "GET" && !spec.download) {
    names.push("detail");
  }
  if (spec.scoped) {
    names.push("organization");
  }
  if (spec.paginated) {
    names.push("cursor", ...(spec.cursorOnly ? [] : ["limit"]));
  }
  if (acceptsData(spec)) {
    names.push("data", "data-file");
  }
  return commandOptions(names, spec.required, spec.command).map((item) => {
    const rule = spec.rules?.find((entry) => entry.name === item.name);
    let defaultValue =
      item.name === "limit" && spec.defaultLimit
        ? String(spec.defaultLimit)
        : item.defaultValue;
    if (rule) {
      defaultValue = rule.defaultValue ?? null;
    }
    return {
      ...item,
      defaultValue,
      description: rule?.description ?? item.description,
      values: rule ? (rule.values ?? []) : item.values,
    };
  });
};
const resourceMetadata = (spec: ResourceCommand): CommandMetadata => {
  const key = `${spec.command} ${spec.action}`.trim();
  const write = spec.method !== "GET";
  const family = resourceFamily(spec);
  const scopes =
    spec.scopes ??
    (["region", "feedback"].includes(spec.command)
      ? []
      : [`${family}.${write ? "write" : "read"}`]);
  const keyAllowed =
    !spec.personOnly &&
    (["feedback", "region"].includes(spec.command) ||
      spec.command === "project" ||
      (!write &&
        ["org", "api-key", "inbox", "billing", "vendor"].includes(
          spec.command
        )));
  const invocation = `inth ${key}${spec.path.includes(":id") ? " <id>" : ""}`;
  const chatWrite =
    spec.command === "chat" && ["start", "send"].includes(spec.action);
  const usage = chatWrite
    ? `${invocation} [--message <text> | --message-file <path|-> | --data <json> | --data-file <path|->] [--attachment-ids <json-array>]`
    : `${invocation}${spec.required.map((name) => ` --${name} <${name}>`).join("")}`;
  let authentication = keyAllowed
    ? "browser-or-agent-or-api-key"
    : "browser-or-agent";
  if (requiresAgentConnection(scopes)) {
    authentication = "agent";
  }
  return {
    action: spec.action,
    authentication,
    command: spec.command,
    description:
      spec.description ??
      descriptions.find((entry) => entry[0] === key)?.[1] ??
      key,
    effects: resourceEffects(spec),
    examples: resourceExamples(spec, invocation, usage),
    options: resourceOptions(spec),
    paginated: spec.paginated,
    scopes,
    usage,
  };
};
const localExamples = (
  command: string,
  action: string,
  positional: string
): string[] => {
  if (command === "login") {
    return [
      "inth login",
      "inth login --email <email> --json",
      "inth login --email <email> --scopes organizations.read,organizations.write,projects.read,projects.write --json",
      "inth login --complete --wait --json",
    ];
  }
  if (command === "update") {
    return ["inth update", "inth update --check", "inth update --check --json"];
  }
  if (command === "api") {
    return [
      "inth api /v1/me --json",
      "inth api GET /v1/agent-chat-attachments/aga_first/content --output ./attachment.bin --json",
    ];
  }
  if (command === "mcp") {
    return [
      `inth mcp ${action} --agent codex --scope project`,
      `inth mcp ${action} --agent cursor --scope global --json`,
    ];
  }
  return [`inth ${command}${action ? ` ${action}` : ""}${positional}`];
};
const localCommand = (
  command: string,
  action: string,
  description: string,
  names: string[],
  authentication: string,
  effects: string[],
  positional = ""
): CommandMetadata => ({
  action,
  authentication,
  command,
  description,
  effects,
  examples: localExamples(command, action, positional),
  options: commandOptions(names),
  paginated: false,
  scopes: [],
  usage: `inth ${command}${action ? ` ${action}` : ""}${positional}`,
});
export const COMMAND_METADATA: CommandMetadata[] = [
  {
    action: "",
    authentication: "browser-or-agent-or-api-key",
    command: "c15t",
    description: "Set up c15t v3 consent management in this app",
    effects: [
      "Selects an Inth project or creates one with c15t branding. New projects require a region.",
      "Agent setup is recommended to adapt the integration to this app and verify consent in a browser. The picker defaults to an installed agent, or a prompt for another agent.",
      "Prompt prints public setup inputs. Agent flags start the chosen coding agent in this directory.",
      "Scaffold writes framework quickstart files and installs c15t on the stable v3 release line. Existing files are preserved; conflicting generated files stop setup.",
      "Scaffold and prompt support --json. Agent sessions require a terminal.",
    ],
    examples: [
      "inth c15t",
      "inth c15t --codex --project Website",
      "inth c15t prompt --project Website --json",
      "inth c15t scaffold --project Website --dry-run --json",
      "inth c15t scaffold --name Website --region eu --organization <id> --yes",
    ],
    options: [
      option(
        "project",
        "string",
        "Existing project ID, name, or organization/name"
      ),
      option("name", "string", "Create a project with this name"),
      option(
        "region",
        "string",
        "Region for a new project; see inth region list"
      ),
      option("framework", "string", "Framework for generated files", [
        ...boilerplateFrameworks,
      ]),
      option(
        "organization",
        "string",
        "Organization to list or create projects in"
      ),
      option("token", "string", "Organization API key; overrides INTH_TOKEN"),
      option("yes", "boolean", "Write files without confirming"),
      option(
        "dry-run",
        "boolean",
        "Preview scaffold files without creating a project or writing files"
      ),
      option(
        "skip-install",
        "boolean",
        "Write files without installing packages"
      ),
      option(
        "resume",
        "boolean",
        "Undo an interrupted scaffold, then write again"
      ),
      ...CODING_AGENTS.map((agent) =>
        option(
          agent.id,
          "boolean",
          `Start ${agent.name} with the c15t setup prompt`
        )
      ),
      option("json", "boolean", "Print scaffold, prompt, or help as JSON"),
      option("non-interactive", "boolean", "Disable prompts and browser login"),
      option("help", "boolean", "Show help for this command"),
    ],
    paginated: false,
    scopes: ["organizations.read", "projects.read", "projects.write"],
    usage: C15T_USAGE.slice(7),
  },
  {
    action: "codemods",
    authentication: "none",
    command: "c15t",
    description: "Rewrite c15t v2 source files for c15t v3",
    effects: [
      "Rewrites source files under the nearest package.json for a hosted app. Offline and custom modes are left unchanged with a TODO(c15t v3) comment.",
      "Needs no sign-in or Inth project, and never prompts.",
      "Codemods run in --list order. --dry-run reports changes without writing files.",
      "With --json, the result goes to stdout and progress to stderr.",
    ],
    examples: [
      "inth c15t codemods --list --json",
      "inth c15t codemods packages-to-c15t consent-provider-options --dry-run --json",
      "inth c15t codemods packages-to-c15t",
    ],
    options: [
      option("list", "boolean", "List the codemods"),
      option("dry-run", "boolean", "Report changes without writing files"),
      option("json", "boolean", "Print the result as JSON"),
      option("non-interactive", "boolean", "Accepted; codemods never prompt"),
      option("help", "boolean", "Show help for this command"),
    ],
    paginated: false,
    scopes: [],
    usage: C15T_CODEMODS_USAGE.slice(7),
  },
  {
    action: "",
    authentication: "none",
    command: "skills",
    description: "Browse and install Inth agent skills",
    effects: [
      "Opens a native picker when no source or skill is specified. The bundled catalog works offline.",
      "Installation requires Node.js and npm. An explicit source bypasses the picker.",
      "Runs npx skills@1.5.25 add and forwards installer options. Installs files in your project or home directory.",
      "Installer output is text. --json is supported with --list or --help.",
    ],
    examples: [
      "inth skills",
      "inth skills c15t/skills --skill c15t",
      "inth skills owner/repo --agent claude-code --global --yes",
      "inth skills --list",
      "inth skills --list --json",
    ],
    options: [
      option("help", "boolean", "Show help for this command"),
      option("non-interactive", "boolean", "Require --yes, --all, or --list"),
      option("skill", "string[]", "Skill names to install"),
      option("agent", "string[]", "Agents supported by the skills installer"),
      option("global", "boolean", "Install in your home directory"),
      option("yes", "boolean", "Skip installer confirmation prompts"),
      option(
        "list",
        "boolean",
        "List Inth skills offline, or inspect an explicit repository"
      ),
      option("copy", "boolean", "Copy files instead of creating symlinks"),
      option(
        "all",
        "boolean",
        "Install all skills to all agents without prompts"
      ),
    ],
    paginated: false,
    scopes: [],
    usage: "inth skills [owner/repo]",
  },
  localCommand(
    "login",
    "",
    "Sign in or create an account",
    [
      "token",
      "organization",
      "no-browser",
      "email",
      "scopes",
      "complete",
      "wait",
      "timeout",
      "yes",
    ],
    "none",
    [
      "With --email, sends the email and requested permissions to Inth and returns an approval URL and code. The person signs in or creates their account in the browser.",
      "Show the approval link, then run inth login --complete --wait --json in the background. Successful sign-in selects this connection for subsequent commands.",
      "Without --email, opens interactive browser sign-in and saves a default organization.",
    ]
  ),
  localCommand(
    "signup",
    "",
    "Create an account through browser approval",
    ["email", "scopes", "complete", "wait", "timeout", "yes"],
    "none",
    [
      "Sends the email and requested permissions to Inth. The person creates and verifies their account in the browser, then approves access.",
      "Show the approval link, then run inth login --complete --wait --json in the background. Existing accounts can sign in on the same page.",
    ],
    " --email <email> --json"
  ),
  localCommand(
    "logout",
    "",
    "Revoke the selected CLI session and remove saved credentials",
    ["token", "auth"],
    "browser-or-agent",
    ["Revokes the selected saved session."]
  ),
  localCommand(
    "whoami",
    "",
    "Read identity, organizations, and capabilities",
    ["token", "auth", "organization"],
    "browser-or-agent-or-api-key",
    []
  ),
  localCommand(
    "auth",
    "status",
    "Show local credential status without checking validity",
    ["token", "auth", "organization"],
    "none",
    []
  ),
  localCommand(
    "auth",
    "refresh",
    "Refresh the selected saved sign-in",
    ["token", "auth"],
    "browser-or-agent",
    ["Replaces saved credentials."]
  ),
  localCommand(
    "auth",
    "start",
    "Start resumable auth.md approval",
    ["email", "scopes", "yes"],
    "none",
    [
      "Sends the email and requested scopes to Inth. Saves the pending claim in the OS credential store.",
    ],
    " --email <email> --yes"
  ),
  localCommand(
    "auth",
    "complete",
    "Finish approval and select the connection; add --wait to wait automatically",
    ["wait", "timeout"],
    "agent",
    ["Consumes the single-use claim after human approval."]
  ),
  localCommand(
    "auth",
    "retry",
    "Replace the pending approval code",
    [],
    "agent",
    ["Invalidates the previous approval code."]
  ),
  localCommand(
    "auth",
    "organizations",
    "List organizations through the auth.md discovery API",
    [],
    "agent",
    []
  ),
  ...RESOURCE_COMMANDS.map(resourceMetadata),
  localCommand(
    "api",
    "",
    "Make a raw API request",
    ["token", "auth", "organization", "method", "data", "data-file", "output"],
    "browser-or-agent-or-api-key",
    [
      "POST, PUT, PATCH, and DELETE can change data immediately. Required scopes depend on the endpoint.",
      "GET with --output saves at most 128 MiB to a new file without text decoding. Existing files are never overwritten. API paths and redirects remain restricted to the trusted API boundary.",
    ],
    " [GET] <path> [--output <new-file>]"
  ),
  localCommand(
    "switch",
    "",
    "Set your default organization",
    ["token", "auth", "organization"],
    "browser-or-agent-or-api-key",
    ["Changes the saved default organization."],
    " [organization-id-or-slug]"
  ),
  localCommand(
    "link",
    "",
    "Save an organization default for this directory",
    ["token", "auth", "organization"],
    "browser-or-agent-or-api-key",
    ["Writes .inth/project.json."],
    " [organization-id-or-slug]"
  ),
  localCommand(
    "mcp",
    "setup",
    "Configure Inth MCP in a coding client",
    ["agent", "scope", "dry-run"],
    "client-oauth",
    ["Writes client configuration. Sign in through the client after setup."]
  ),
  localCommand(
    "mcp",
    "list",
    "Show Inth MCP configuration",
    ["agent", "scope"],
    "none",
    []
  ),
  localCommand(
    "mcp",
    "remove",
    "Remove Inth MCP from a coding client",
    ["agent", "scope", "dry-run"],
    "none",
    ["Removes only the Inth server entry."]
  ),
  localCommand("telemetry", "enable", "Enable usage telemetry", [], "none", [
    "Saves your telemetry preference and a random installation ID.",
  ]),
  localCommand("telemetry", "disable", "Disable usage telemetry", [], "none", [
    "Disables telemetry and removes the installation ID.",
  ]),
  localCommand(
    "telemetry",
    "status",
    "Show whether CLI telemetry is enabled",
    [],
    "none",
    []
  ),
  localCommand(
    "update",
    "",
    "Update the CLI to the latest release",
    ["check"],
    "none",
    [
      "Installs the latest release the way this copy was installed: with the install script, or with a global npm, pnpm, bun, or Yarn installation.",
      "Project dependencies, temporary package runners, and Windows installations get the command to run instead.",
      "Reads the latest version from registry.npmjs.org or INTH_NPM_REGISTRY. Update output is text. --json is supported with --check.",
    ]
  ),
];
