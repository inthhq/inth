export const billingBody = JSON.stringify({
  data: {
    autoTopUp: null,
    credits: { remaining: 0, unlimited: true },
    organizationId: "org_123",
    plan: {
      billingInterval: null,
      family: "enterprise",
      name: "Enterprise",
      pastDue: false,
    },
    tier: "enterprise",
  },
  success: true,
});
export const projectsBody = JSON.stringify({
  data: [
    { id: "prj_123", name: "Website", slug: "website" },
    { id: "prj_456", name: "Dashboard", slug: "dashboard" },
  ],
  pagination: { hasMore: true, nextCursor: "cursor+/=" },
  success: true,
});
export interface OutputCase {
  args: string[];
  body: string;
  expected: string[];
}
export const outputCases: OutputCase[] = [
  {
    args: ["billing"],
    body: billingBody,
    expected: [
      "Billing",
      "Enterprise",
      "Unlimited",
      "Not configured",
      "Current",
      "org_123",
    ],
  },
  {
    args: ["billing"],
    body: '{"success":true,"data":{"tier":"starter","plan":{"name":"Startup","billingInterval":"month","pastDue":true},"credits":{"remaining":0,"unlimited":false},"autoTopUp":{"enabled":true,"quantityCredits":100,"thresholdCredits":50}}}',
    expected: [
      "Startup",
      "Monthly",
      "Past due",
      "Credits",
      "0",
      "Enabled",
      "100",
      "50",
    ],
  },
  {
    args: ["billing"],
    body: '{"success":true,"data":{"tier":"hobby","plan":null,"credits":null,"autoTopUp":null}}',
    expected: ["No active plan", "Not available", "Not configured"],
  },
  {
    args: ["org", "list"],
    body: '{"success":true,"data":[{"id":"org_123","name":"Acme","slug":"acme","role":"owner"}]}',
    expected: ["Organizations", "Acme", "owner", "org_123"],
  },
  {
    args: ["org", "get", "org_123"],
    body: '{"success":true,"data":{"id":"org_123","name":"Acme","slug":"acme","role":"owner"}}',
    expected: ["Organization", "Acme", "owner", "org_123"],
  },
  {
    args: ["project", "list"],
    body: projectsBody,
    expected: [
      "Projects",
      "Website",
      "prj_123",
      "Dashboard",
      "More results available",
      "cursor+/=",
    ],
  },
  {
    args: ["project", "get", "prj_123"],
    body: '{"success":true,"data":{"id":"prj_123","name":"Website","slug":"website","consent":{"branding":"inth","trustedOrigins":["example.com"],"backendUrl":"https://website.inth.app"}}}',
    expected: [
      "Project",
      "Website",
      "Consent branding",
      "inth",
      "example.com",
      "https://website.inth.app",
    ],
  },
  {
    args: ["project", "list"],
    body: '{"success":true,"data":[],"pagination":{"hasMore":false,"nextCursor":null}}',
    expected: ["No projects on this page", "0 shown", "End of results"],
  },
  {
    args: ["member", "list"],
    body: '{"success":true,"data":[{"id":"mem_123","role":"admin","user":{"name":"Kim","email":"kim@example.com"}}]}',
    expected: ["Members", "Kim", "kim@example.com", "admin", "mem_123"],
  },
  {
    args: ["member", "update", "mem_123", "--role", "admin"],
    body: '{"success":true,"data":{"updated":true}}',
    expected: ["Member updated", "mem_123"],
  },
  {
    args: ["member", "remove", "mem_123"],
    body: '{"success":true,"data":{"deleted":true}}',
    expected: ["Member removed", "mem_123"],
  },
  {
    args: [
      "invitation",
      "create",
      "--email",
      "kim@example.com",
      "--role",
      "member",
    ],
    body: '{"success":true,"data":{"id":"inv_123","email":"kim@example.com","role":"member","expiresAt":"2026-09-10","invitedBy":{"name":"Sam","email":"sam@example.com"}}}',
    expected: [
      "Invitation sent",
      "kim@example.com",
      "sam@example.com",
      "2026-09-10",
      "inv_123",
    ],
  },
  {
    args: ["invitation", "cancel", "inv_123"],
    body: '{"success":true,"data":{"deleted":true}}',
    expected: ["Invitation cancelled", "inv_123"],
  },
  {
    args: ["api-key", "list"],
    body: '{"success":true,"data":[{"id":"key_123","name":"CI deploy","prefix":"inth_abcd"}]}',
    expected: ["API keys", "CI deploy", "inth_abcd", "key_123"],
  },
  {
    args: ["api-key", "roll", "key_123"],
    body: '{"success":true,"data":{"id":"key_123","key":"inth_secret_returned_once"}}',
    expected: [
      "API key rotated",
      "Save this key now",
      "inth_secret_returned_once",
    ],
  },
  {
    args: ["region", "list"],
    body: '{"success":true,"data":[{"id":"eu","label":"Europe"}]}',
    expected: ["Regions", "Europe", "eu"],
  },
  {
    args: ["code-audit", "repositories"],
    body: '{"success":true,"data":[{"id":"repo_123","name":"website","owner":"acme","defaultBranch":"main","visibility":"private"}]}',
    expected: ["Repositories", "acme/website", "main", "private", "repo_123"],
  },
  {
    args: ["code-audit", "scans"],
    body: '{"success":true,"data":[{"id":"scan_123","repositoryName":"website","status":"completed","access":"free-preview"}]}',
    expected: ["Scans", "website", "completed", "free-preview", "scan_123"],
  },
  {
    args: ["code-audit", "get", "scan_123"],
    body: '{"success":true,"data":{"id":"scan_123","repositoryName":"website","status":"running","progress":{"stage":"analysis","completedStages":1,"totalStages":4}}}',
    expected: ["Scan", "scan_123", "running", "analysis", "1 / 4 stages"],
  },
  {
    args: ["code-audit", "start", "--repository", "repo_123"],
    body: '{"success":true,"data":{"status":"starting","preparationId":"prep_123","repositoryId":"repo_123"}}',
    expected: [
      "Scan is starting",
      "prep_123",
      "repo_123",
      "inth code-audit request",
    ],
  },
  {
    args: ["code-audit", "request", "prep_123", "--repository", "repo_123"],
    body: '{"success":true,"data":{"status":"started","scan":{"id":"scan_123","repositoryName":"website","status":"queued"}}}',
    expected: ["Scan started", "scan_123", "queued"],
  },
  {
    args: ["code-audit", "request", "prep_123", "--repository", "repo_123"],
    body: '{"success":true,"data":{"status":"failed","message":"Repository is unavailable."}}',
    expected: ["Scan failed", "Repository is unavailable"],
  },
  {
    args: ["code-audit", "unlock", "scan_123"],
    body: '{"success":true,"data":{"status":"already-unlocked"}}',
    expected: ["Report already unlocked"],
  },
  {
    args: ["code-audit", "issues", "scan_123"],
    body: '{"success":true,"data":{"scanId":"scan_123","access":"free-preview","totalCount":2,"lockedCount":1,"unlockCredits":25,"issues":[{"id":"issue_123","title":"Personal data in logs","priority":"P1","recommendation":"Redact email addresses.","files":["src/checkout.ts"]}]}}',
    expected: [
      "Scan report",
      "Locked findings",
      "25",
      "Personal data in logs",
      "Redact email addresses",
      "src/checkout.ts",
    ],
  },
  {
    args: ["code-audit", "issues", "scan_123"],
    body: '{"success":true,"data":{"scanId":"scan_123","access":"locked","totalCount":3,"lockedCount":3,"issues":[]}}',
    expected: ["Findings are locked", "Locked findings"],
  },
  {
    args: ["inbox", "list"],
    body: '{"success":true,"data":[{"id":"inbox_123","title":"Personal data in logs","priority":"P1","status":"open"}]}',
    expected: ["Inbox", "Personal data in logs", "P1", "open", "inbox_123"],
  },
  {
    args: ["inbox", "get", "inbox_123"],
    body: '{"success":true,"data":{"id":"inbox_123","title":"Personal data in logs","status":"open","version":"3","codeEvidence":{"filePath":"src/checkout.ts","lineNumbers":[42],"recommendation":"Redact emails."}}}',
    expected: [
      "Inbox",
      "Version",
      "3",
      "src/checkout.ts",
      "42",
      "Redact emails",
    ],
  },
  {
    args: ["inbox", "github-issue", "inbox_123"],
    body: '{"success":true,"data":{"id":"inbox_123","title":"Personal data in logs","githubIssue":{"number":42,"url":"https://github.com/acme/website/issues/42"}}}',
    expected: ["GitHub issue", "https://github.com/acme/website/issues/42"],
  },
];
