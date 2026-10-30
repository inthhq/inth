export interface V2ReadCase {
  args: string[];
  path: string;
  body: string;
  expected: string[];
}

export const v2ReadCases: V2ReadCase[] = [
  {
    args: ["account", "sessions"],
    body: JSON.stringify({
      data: {
        credentialKind: "oauth",
        currentSessionId: null,
        items: [{ id: "session_123", isCurrent: false, userAgent: "Firefox" }],
        nextCursor: "sessions-next",
        pageSize: 20,
      },
      success: true,
    }),
    expected: ["session_123", "Firefox", "sessions-next", "OAuth"],
    path: "/v1/account/sessions?limit=20",
  },
  {
    args: ["account", "devices", "--limit", "100", "--cursor", "opaque+/="],
    body: JSON.stringify({
      data: {
        items: [
          {
            clientName: "Inth CLI",
            id: "grant_123",
            lastActiveAt: "2026-10-29T00:00:00Z",
          },
        ],
        nextCursor: null,
        pageSize: 100,
      },
      success: true,
    }),
    expected: ["grant_123", "Inth CLI", "2026-10-29T00:00:00Z"],
    path: "/v1/account/connected-devices?limit=100&cursor=opaque%2B%2F%3D",
  },
  {
    args: ["integration", "status"],
    body: JSON.stringify({
      data: {
        canManageRepositories: true,
        discovery: {
          domainProofs: "/v1/integrations/domain-proofs",
          installations: "/v1/integrations/github/installations",
          projects: "/v1/projects",
          properties: "/v1/integrations/search-console/properties",
          repositories: "/v1/integrations/github/repositories",
        },
        googleSearchConsoleAvailable: true,
        googleSearchConsoleLinked: false,
        organizationId: "org_123",
      },
      success: true,
    }),
    expected: [
      "org_123",
      "Search Console linked: false",
      "/v1/integrations/github/repositories",
    ],
    path: "/v1/integrations",
  },
  {
    args: ["integration", "github-installations"],
    body: JSON.stringify({
      data: {
        items: [
          {
            accountLogin: "acme",
            accountType: "Organization",
            id: "installation_123",
          },
        ],
        nextCursor: null,
        pageSize: 20,
      },
      success: true,
    }),
    expected: ["installation_123", "acme"],
    path: "/v1/integrations/github/installations?limit=20",
  },
  {
    args: ["integration", "github-repositories"],
    body: JSON.stringify({
      data: {
        items: [
          {
            defaultBranch: "main",
            id: "repo_123",
            name: "web",
            owner: "acme",
            prScansEnabled: false,
          },
        ],
        nextCursor: null,
        pageSize: 20,
      },
      success: true,
    }),
    expected: ["repo_123", "web", "acme", "main", "PR scans enabled: false"],
    path: "/v1/integrations/github/repositories?limit=20",
  },
  {
    args: ["integration", "github-repository-get", "repo/123"],
    body: JSON.stringify({
      data: {
        branchFilters: ["main"],
        defaultBranch: "main",
        id: "repo/123",
        ignoredPaths: [],
        name: "web",
        projectLinksPath:
          "/v1/integrations/github/repositories/repo%2F123/project-links",
      },
      success: true,
    }),
    expected: ["repo/123", "web", "main", "Ignored paths: []", "project-links"],
    path: "/v1/integrations/github/repositories/repo%2F123",
  },
  {
    args: ["integration", "github-project-links", "repo_123"],
    body: JSON.stringify({
      data: {
        items: [
          {
            id: "link_123",
            policiesNextCursor: "policy-next",
            policiesPath:
              "/v1/integrations/github/project-links/link_123/policies",
            projectName: "Web",
            scanMode: "weekly",
          },
        ],
        nextCursor: null,
        pageSize: 20,
      },
      success: true,
    }),
    expected: [
      "link_123",
      "Web",
      "weekly",
      "policy-next",
      "/v1/integrations/github/project-links/link_123/policies",
    ],
    path: "/v1/integrations/github/repositories/repo_123/project-links?limit=20",
  },
  {
    args: ["integration", "github-link-policies", "link_123"],
    body: JSON.stringify({
      data: {
        items: [
          {
            cronExpression: "0 9 * * 1",
            enabled: false,
            id: "policy_123",
            trigger: "weekly",
          },
        ],
        nextCursor: null,
        pageSize: 20,
      },
      success: true,
    }),
    expected: ["policy_123", "weekly", "Enabled: false", "0 9 * * 1"],
    path: "/v1/integrations/github/project-links/link_123/policies?limit=20",
  },
  {
    args: ["integration", "search-console-properties"],
    body: JSON.stringify({
      data: {
        items: [
          {
            id: "property_123",
            permissionLevel: "siteOwner",
            siteUrl: "sc-domain:example.com",
          },
        ],
        nextCursor: null,
        pageSize: 20,
        visibility: "own-account",
      },
      success: true,
    }),
    expected: [
      "property_123",
      "siteOwner",
      "sc-domain:example.com",
      "own-account",
    ],
    path: "/v1/integrations/search-console/properties?limit=20",
  },
  {
    args: ["integration", "domain-proofs"],
    body: JSON.stringify({
      data: {
        items: [
          {
            domain: "example.com",
            id: "proof_123",
            method: "dns",
            verifiedAt: "2026-10-29T00:00:00Z",
          },
        ],
        nextCursor: null,
        pageSize: 20,
      },
      success: true,
    }),
    expected: ["proof_123", "example.com", "dns", "2026-10-29T00:00:00Z"],
    path: "/v1/integrations/domain-proofs?limit=20",
  },
  {
    args: ["website-audit", "cookie-inventory", "--project", "prj_123"],
    body: JSON.stringify({
      data: {
        dataCompleteness: "latest-scan-index",
        items: [
          {
            cookiesPath: "/v1/website-audit/scans/scan_123/cookies",
            id: "target_123",
            projectId: "prj_123",
            scanId: "scan_123",
            targetId: "target_123",
            website: "https://example.com",
          },
        ],
        nextCursor: null,
        pageSize: 20,
      },
      success: true,
    }),
    expected: [
      "latest-scan-index",
      "scan_123",
      "prj_123",
      "/v1/website-audit/scans/scan_123/cookies",
      "website-audit cookies",
    ],
    path: "/v1/website-audit/cookie-inventory?limit=20&projectId=prj_123",
  },
  {
    args: [
      "billing",
      "ledger",
      "--product",
      "code-audit",
      "--until",
      "2026-10-29T00:00:00Z",
    ],
    body: JSON.stringify({
      data: {
        coverage: "retained-settled-consumption",
        items: [
          {
            activity: "Full audit",
            attribution: {
              evidenceStatus: "missing",
              initiatorStatus: "unknown",
            },
            credits: 12,
            id: "receipt_123",
            initiatedBy: null,
            product: "code-audit",
            settledAt: "2020-01-01T00:00:00Z",
          },
        ],
        nextCursor: "ledger-next",
        pageSize: 20,
        window: { since: null, until: "2026-10-29T00:00:00Z" },
      },
      success: true,
    }),
    expected: [
      "receipt_123",
      "12",
      "2020-01-01T00:00:00Z",
      "all retained history",
      "2026-10-29T00:00:00Z",
      "unknown",
      "missing",
      "ledger-next",
    ],
    path: "/v1/billing/credit-ledger?limit=20&product=code-audit&until=2026-10-29T00%3A00%3A00Z",
  },
  {
    args: ["org", "settings-get", "org_123"],
    body: JSON.stringify({
      data: { id: "org_123", name: "Acme", slug: "acme" },
      success: true,
    }),
    expected: ["org_123", "Acme", "acme"],
    path: "/v1/organizations/org_123/settings",
  },
  {
    args: ["code-audit", "quote", "scan_123"],
    body: JSON.stringify({
      data: {
        approvalAvailability: "dashboard",
        availabilityReason: "legacy_dashboard_workflow",
        dashboardUrl: "https://app.inth.com/acme/code-audit/scan_123",
        organizationId: "org_123",
        quote: {
          expiresAt: "2026-10-30T00:00:00Z",
          plan: { candidatePlanChecksum: "sha256:123", plannedFileCount: 5 },
          quoteId: "quote_123",
          totalCredits: 12,
        },
        runStatus: "awaiting_approval",
        scanId: "scan_123",
        status: "awaiting",
      },
      success: true,
    }),
    expected: [
      "quote_123",
      "Total credits: 12",
      "2026-10-30T00:00:00Z",
      "sha256:123",
      "dashboard",
      "legacy_dashboard_workflow",
      "https://app.inth.com/acme/code-audit/scan_123",
    ],
    path: "/v1/code-audit/scans/scan_123/quote",
  },
];
