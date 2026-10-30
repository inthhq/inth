export interface AccessRequestCase {
  args: string[];
  method: string;
  path: string;
  body?: string;
  accept?: string;
}
const read = (args: string[], path: string): AccessRequestCase => ({
  args,
  method: "GET",
  path,
});
export const accessRequestCases: AccessRequestCase[] = [
  read(
    ["consent", "config-get", "--project", "prj_123"],
    "/v1/projects/prj_123/consent"
  ),
  read(
    ["consent", "translations-get", "--project", "prj_123"],
    "/v1/projects/prj_123/consent/configuration/i18n"
  ),
  read(
    ["consent", "iab-get", "--project", "prj_123"],
    "/v1/projects/prj_123/consent/configuration/iab"
  ),
  read(
    ["consent", "policies-get", "--project", "prj_123"],
    "/v1/projects/prj_123/consent/configuration/policies"
  ),
  read(
    ["consent", "overview", "--project", "prj_123", "--range", "30d"],
    "/v1/projects/prj_123/consent/overview?from=30d"
  ),
  read(
    ["consent", "analytics", "--project", "prj_123"],
    "/v1/projects/prj_123/consent/analytics"
  ),
  read(
    ["consent", "records", "--project", "prj_123"],
    "/v1/projects/prj_123/consent/records?page=1"
  ),
  read(
    [
      "consent",
      "records",
      "--project",
      "prj_123",
      "--query",
      "  cookie  ",
      "--page",
      "2",
    ],
    "/v1/projects/prj_123/consent/records?page=2&q=cookie"
  ),
  read(
    ["consent", "lifecycle-get", "--project", "prj_123"],
    "/v1/projects/prj_123/consent/lifecycle"
  ),
  read(
    ["consent", "runtime-keys", "--project", "prj_123", "--cursor", "next+/="],
    "/v1/projects/prj_123/consent/runtime-keys?limit=50&cursor=next%2B%2F%3D"
  ),
  {
    args: [
      "consent",
      "config-update",
      "--project",
      "prj_123",
      "--session-duration-minutes",
      "60",
    ],
    body: '{"sessionDurationMinutes":60}',
    method: "PATCH",
    path: "/v1/projects/prj_123/consent",
  },
  {
    args: [
      "consent",
      "iab-set",
      "--project",
      "prj_123",
      "--vendor-ids",
      "[]",
      "--additional-consent-provider-ids",
      "[1,2]",
    ],
    body: '{"vendorIds":[],"additionalConsentProviders":[1,2]}',
    method: "PUT",
    path: "/v1/projects/prj_123/consent/configuration/iab",
  },
  read(["billing", "entitlements"], "/v1/billing/entitlements"),
  read(["billing", "configuration"], "/v1/billing/configuration"),
  read(["billing", "usage", "--page", "3"], "/v1/billing/credit-usage?page=3"),
  read(
    ["billing", "invoices", "--cursor", "next+/="],
    "/v1/billing/invoices?cursor=next%2B%2F%3D"
  ),
  read(["billing", "invoice-get", "inv/123"], "/v1/billing/invoices/inv%2F123"),
  read(["billing", "profile-get"], "/v1/billing/profile"),
  read(["billing", "payment-methods"], "/v1/billing/payment-methods?limit=20"),
  read(["account", "get"], "/v1/account"),
  read(["notification", "get"], "/v1/notifications/preferences"),
  read(
    ["org", "retention-get", "org_123"],
    "/v1/organizations/org_123/data-controls"
  ),
  read(
    ["support", "list", "--cursor", "next_1"],
    "/v1/support/conversations?cursor=next_1"
  ),
  read(
    ["support", "get", "spc_1", "--cursor", "checkpoint_1"],
    "/v1/support/conversations/spc_1?cursor=checkpoint_1"
  ),
  read(
    ["website", "list", "--project", "prj_123"],
    "/v1/website-audit/targets?limit=25&projectId=prj_123"
  ),
  read(
    ["website", "get", "target_123"],
    "/v1/website-audit/targets/target_123"
  ),
  read(
    ["website", "verification-get", "target_123"],
    "/v1/website-audit/targets/target_123/verification"
  ),
  {
    args: ["website", "remove", "target_123", "--yes"],
    method: "DELETE",
    path: "/v1/website-audit/targets/target_123",
  },
  {
    args: [
      "website",
      "policies-set",
      "target_123",
      "--urls",
      '["https://example.com/privacy"]',
    ],
    body: '{"policyUrls":["https://example.com/privacy"]}',
    method: "PUT",
    path: "/v1/website-audit/targets/target_123/policy-pages",
  },
  {
    args: ["website", "verification-check", "target_123", "--method", "dns"],
    body: '{"method":"dns"}',
    method: "POST",
    path: "/v1/website-audit/targets/target_123/verification",
  },
  read(
    [
      "website-audit",
      "list",
      "--website",
      "target_123",
      "--status",
      "completed",
    ],
    "/v1/website-audit/scans?limit=25&targetId=target_123&status=completed"
  ),
  {
    args: [
      "website-audit",
      "start",
      "--website",
      "target_123",
      "--request-id",
      "b8dde372-1324-4d2e-a15a-fd3761964299",
      "--scope",
      "free_preview",
    ],
    body: '{"requestId":"b8dde372-1324-4d2e-a15a-fd3761964299","scope":"free_preview"}',
    method: "POST",
    path: "/v1/website-audit/targets/target_123/scans",
  },
  read(
    ["website-audit", "get", "scan_123"],
    "/v1/website-audit/scans/scan_123"
  ),
  read(
    ["website-audit", "results", "scan_123"],
    "/v1/website-audit/scans/scan_123/results"
  ),
  {
    ...read(
      ["website-audit", "report", "scan_123"],
      "/v1/website-audit/scans/scan_123/report"
    ),
    accept: "application/vnd.inth.web-audit+json;version=2",
  },
  read(
    ["website-audit", "cookies", "scan_123", "--limit", "100"],
    "/v1/website-audit/scans/scan_123/cookies?limit=100"
  ),
  {
    args: [
      "website-audit",
      "review",
      "scan_123",
      "--finding",
      "finding_123",
      "--decision",
      "dismiss",
    ],
    body: '{"evidenceId":"finding_123","action":"dismiss"}',
    method: "POST",
    path: "/v1/website-audit/scans/scan_123/review",
  },
  read(["chat", "list"], "/v1/agent-chats?limit=50"),
  {
    args: [
      "chat",
      "share",
      "chat_123",
      "--visibility",
      "organization",
      "--yes",
    ],
    body: "{}",
    method: "POST",
    path: "/v1/agent-chats/chat_123/share",
  },
  {
    args: ["chat", "delete", "chat_123", "--yes"],
    method: "DELETE",
    path: "/v1/agent-chats/chat_123",
  },
];
export const invalidAccessRequests: string[][] = [
  ["consent", "config-get"],
  ["consent", "records", "--project", "prj_123", "--page", "1e1"],
  ["consent", "records", "--project", "prj_123", "--page", "0"],
  ["consent", "records", "--project", "prj_123", "--page", "1000001"],
  ["consent", "records", "--project", "prj_123", "--cursor", "next"],
  ["consent", "records", "--project", "prj_123", "--limit", "50"],
  ["consent", "config-update", "--project", "prj_123", "--data", "null"],
  [
    "consent",
    "config-update",
    "--project",
    "prj_123",
    "--data",
    '{"branding":null}',
  ],
  [
    "consent",
    "config-update",
    "--project",
    "prj_123",
    "--data",
    '{"unknown":true}',
  ],
  [
    "consent",
    "config-update",
    "--project",
    "prj_123",
    "--data",
    '{"sessionDurationMinutes":"60"}',
  ],
  [
    "consent",
    "config-update",
    "--project",
    "prj_123",
    "--session-duration-minutes",
    "61",
  ],
  [
    "consent",
    "config-update",
    "--project",
    "prj_123",
    "--trusted-origins",
    "[null]",
  ],
  ["consent", "iab-set", "--project", "prj_123", "--vendor-ids", '["1"]'],
  ["consent", "iab-set", "--project", "prj_123", "--vendor-ids", "[1.5]"],
  [
    "consent",
    "iab-set",
    "--project",
    "prj_123",
    "--vendor-ids",
    "[1]",
    "--additional-consent-provider-ids",
    "[0]",
  ],
  ["consent", "iab-set", "--project", "prj_123", "--data", "{}"],
  ["consent", "iab-set", "--data", '{"vendorIds":[]}'],
  ["billing", "invoices", "--limit", "20"],
  ["billing", "usage", "--page", "1001"],
  ["support", "list", "--limit", "50"],
  ["support", "get", "spc_1", "--cursor", "not+a+cursor"],
  ["support", "get", "sat_1"],
  ["website", "policies-set", "target_123", "--urls", "[true]"],
  ["website", "verification-check", "target_123", "--method", "GET"],
  ["website-audit", "list", "--status", "unknown"],
  [
    "website-audit",
    "start",
    "--website",
    "target_123",
    "--request-id",
    "b8dde372-1324-4d2e-a15a-fd3761964299",
  ],
  [
    "website-audit",
    "start",
    "--website",
    "target_123",
    "--data",
    '{"requestId":"b8dde372-1324-4d2e-a15a-fd3761964299"}',
  ],
  [
    "website-audit",
    "start",
    "--website",
    "target_123",
    "--request-id",
    "bad",
    "--scope",
    "free_preview",
  ],
  [
    "website-audit",
    "review",
    "scan_123",
    "--finding",
    "finding_123",
    "--decision",
    "allow",
  ],
  ["chat", "list", "--visibility", "personal"],
  ["chat", "share", "chat_123", "--visibility", "personal"],
  ["chat", "delete", "chat_123", "--data", "{}"],
  ["inbox", "update", "item_123", "--item-version", "0", "--unassign"],
  [
    "inbox",
    "update",
    "item_123",
    "--item-version",
    "9007199254740993",
    "--unassign",
  ],
  ["inbox", "update", "item_123", "--item-version", "3"],
  [
    "inbox",
    "update",
    "item_123",
    "--item-version",
    "3",
    "--assignee",
    "user_123",
    "--unassign",
  ],
  ["inbox", "update", "item_123", "--data", '{"version":3,"status":"open"}'],
  [
    "inbox",
    "update",
    "item_123",
    "--data",
    '{"version":"3","assignedToUserId":false}',
  ],
];
