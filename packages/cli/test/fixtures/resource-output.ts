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
// A runtime finding as GET /v1/inbox/:id returns it, with every runtimeVendor field.
export const runtimeFindingBody = JSON.stringify({
  data: {
    codeEvidence: null,
    id: "inbox_456",
    priority: "P2",
    runtimeVendor: {
      consentCategory: "measurement",
      evidence: [
        {
          kind: "request",
          loadedBy: {
            initiator: "script",
            scriptUrl: "https://www.googletagmanager.com/gtm.js?id=GTM-ABC123",
            tagManagerContainerId: "GTM-ABC123",
            viaGoogleTagManager: true,
          },
          observedAt: "2026-10-01T12:00:00.000Z",
          pageUrl: "https://example.com/",
          source: "scan",
          value: "https://www.google-analytics.com/g/collect",
        },
        {
          kind: "cookie",
          loadedBy: {
            initiator: "script",
            scriptUrl: "https://cdn.example.com/loader.js",
            tagManagerContainerId: null,
            viaGoogleTagManager: false,
          },
          observedAt: "2026-10-01T12:00:00.000Z",
          pageUrl: null,
          source: "scan",
          value: "_ga",
        },
        {
          kind: "cookie",
          loadedBy: null,
          observedAt: "2026-10-01T12:00:00.000Z",
          pageUrl: null,
          source: "scan",
          value: "_gid",
        },
      ],
      firstSeenAt: "2026-09-01T12:00:00.000Z",
      hosts: ["www.google-analytics.com"],
      lastSeenAt: "2026-10-01T12:00:00.000Z",
      name: "Google Analytics",
      privacyPolicyUrl: "https://policies.google.com/privacy",
      projectId: "prj_123",
      projectSlug: "website",
      reviewState: "needs_review",
      sources: ["scan"],
      state: "active",
      vendorId: "google-analytics",
    },
    source: "runtime",
    status: "open",
    title: "New vendor: Google Analytics",
    version: "1",
  },
  success: true,
});
// A decision for a vendor with no runtime Inbox finding.
// GET /v1/projects/:projectId/vendors/:vendorId for a vendor whose load source is unknown.
export const vendorDetailBody = JSON.stringify({
  data: {
    consentCategory: null,
    evidence: [
      {
        kind: "request",
        loadedBy: null,
        observedAt: "2026-10-01T12:00:00.000Z",
        pageUrl: "https://example.com/",
        source: "scan",
        value: "https://pixel.example.net/collect",
      },
    ],
    firstSeenAt: "2026-10-01T12:00:00.000Z",
    hosts: ["pixel.example.net"],
    id: "example-pixel",
    inboxItemId: null,
    lastSeenAt: "2026-10-02T12:00:00.000Z",
    name: "Example Pixel",
    privacyPolicyUrl: null,
    projectId: "prj_123",
    projectSlug: "website",
    reviewState: "needs_review",
    sources: ["web_scan"],
    state: "active",
  },
  success: true,
});
export const vendorIgnoredBody =
  '{"success":true,"data":{"inboxItemId":null,"name":"Google Analytics","projectId":"prj_123","reviewState":"needs_review","state":"ignored","vendorId":"google-analytics"}}';
export interface OutputCase {
  args: string[];
  body: string;
  expected: string[];
}
export const outputCases: OutputCase[] = [
  {
    args: ["chat", "start", "--message", "Question"],
    body: '{"success":true,"data":{"id":"chat_123","status":"running","title":"Question","organizationId":"org_123","dashboardUrl":"https://inth.com/dashboard/chats/chat_123"}}',
    expected: [
      "Message accepted",
      "running",
      "chat_123",
      "inth chat get chat_123",
    ],
  },
  {
    args: ["chat", "get", "chat_123"],
    body: JSON.stringify({
      data: {
        id: "chat_123",
        messages: [
          { failed: false, id: "user_123", role: "user", text: "Question" },
          {
            failed: false,
            id: "assistant_123",
            role: "assistant",
            text: 'Run these separately:\n\n  echo first\n  echo second\n  echo "two  spaces"\n\nThen check the result.',
          },
        ],
        status: "idle",
        title: "Question",
      },
      success: true,
    }),
    expected: [
      "Inth Agent chat",
      "idle",
      "User",
      "Assistant",
      'Run these separately:\n\n  echo first\n  echo second\n  echo "two  spaces"\n\nThen check the result.',
      "inth chat get chat_123 --json",
    ],
  },
  {
    args: ["chat", "get", "chat_123"],
    body: '{"success":true,"data":{"id":"chat_123","status":"idle","messages":[{"id":"assistant_123","role":"assistant","text":"","failed":true}]}}',
    expected: ["This reply ended without an answer."],
  },
  {
    args: ["chat", "get", "chat_123"],
    body: '{"success":true,"data":{"id":"chat_123","status":"idle","messages":[{"id":"user_123","role":"user","text":"Question","failed":false}]}}',
    expected: ["No assistant reply is available yet."],
  },
  {
    args: [
      "feedback",
      "--category",
      "bug",
      "--surface",
      "cli",
      "--message",
      "Command failed",
    ],
    body: '{"success": true, "data": {"reference": "FDB-123", "alreadySubmitted": false}}',
    expected: ["Feedback submitted", "Reference", "FDB-123"],
  },
  {
    args: [
      "feedback",
      "--category",
      "bug",
      "--surface",
      "cli",
      "--message",
      "Command failed",
    ],
    body: '{"success": true, "data": {"reference": "FDB-123", "alreadySubmitted": true}}',
    expected: ["Feedback already submitted", "Reference", "FDB-123"],
  },
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
  {
    args: ["inbox", "get", "inbox_456"],
    body: runtimeFindingBody,
    expected: [
      "Google Analytics",
      "google-analytics",
      "prj_123",
      "active",
      "Google Tag Manager (GTM-ABC123)",
      "https://cdn.example.com/loader.js",
    ],
  },
  {
    args: ["vendor", "list", "--project", "prj_123"],
    body: '{"success":true,"data":[{"id":"google-analytics","name":"Google Analytics","consentCategory":"measurement","state":"active","reviewState":"needs_review","projectId":"prj_123"}],"pagination":{"hasMore":false,"nextCursor":null}}',
    expected: [
      "Vendors",
      "Google Analytics",
      "measurement",
      "active",
      "needs_review",
      "google-analytics",
    ],
  },
  {
    args: ["vendor", "get", "example-pixel", "--project", "prj_123"],
    body: vendorDetailBody,
    expected: [
      "Example Pixel",
      "example-pixel",
      "prj_123",
      "pixel.example.net",
      "2026-10-02T12:00:00.000Z",
    ],
  },
  {
    args: ["vendor", "approve", "google-analytics", "--project", "prj_123"],
    body: '{"success":true,"data":{"inboxItemId":"inbox_456","name":"Google Analytics","projectId":"prj_123","reviewState":"accepted","state":"approved","vendorId":"google-analytics"}}',
    expected: [
      "Vendor approved",
      "Google Analytics",
      "google-analytics",
      "prj_123",
      "approved",
      "accepted",
      "inbox_456 (resolved)",
    ],
  },
  {
    args: ["vendor", "ignore", "google-analytics", "--project", "prj_123"],
    body: vendorIgnoredBody,
    expected: ["Vendor ignored", "google-analytics", "ignored", "None"],
  },
];
