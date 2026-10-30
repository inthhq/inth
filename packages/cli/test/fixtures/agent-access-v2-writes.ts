/* eslint-disable anti-slop/no-known-value-widening -- Scriptc requires a common JSON record shape for nested fixture arrays and spreads. */
import type { InputValue } from "../../src/write-input.ts";

type FixtureBody = Record<string, InputValue>;
const updated = { updated: true };
const completed = { status: "completed" };
export interface WriteCase {
  args: string[];
  method: string;
  path: string;
  body?: string;
  scoped: boolean;
  response: string;
  image?: boolean;
}
export const writeUuid = "b8dde372-1324-4d2e-a15a-fd3761964299";
const quoteLineItem: FixtureBody = {
  amount: 1200,
  description: "Credits",
  label: "100 credits",
};
export const billingQuote: FixtureBody = {
  currency: "usd",
  discount: null,
  lineItems: [quoteLineItem],
  nextCycle: null,
  subtotal: 1200,
  total: 1200,
};
export const websiteInput = {
  crawlMode: "mixed",
  maxDepth: 2,
  maxPages: 25,
  monitoringEnabled: false,
  origin: "https://example.com",
  policyUrls: [],
  projectId: "prj_123",
  scheduleCadence: "weekly",
};
const lifecycle = {
  expectedBackendVersion: "1.0.0",
  expectedInstanceId: "ins_123",
};
const consentPolicy: FixtureBody = {
  actions: ["accept", "reject"],
  id: "eu",
  match: { country: ["DE", "FR"] },
  model: "opt-in",
};
const plan = { checkoutAttemptId: writeUuid, plan: "starter", product: "inth" };
const credits = {
  catalogVersion: 1,
  checkoutAttemptId: writeUuid,
  credits: 100,
};
const data = (value: FixtureBody): string[] => [
  "--data",
  JSON.stringify(value),
];
const item = (
  args: string[],
  method: string,
  path: string,
  body: FixtureBody | undefined = undefined,
  scoped = false,
  response: FixtureBody = updated
): WriteCase => ({
  args,
  body: body === undefined ? undefined : JSON.stringify(body),
  method,
  path,
  response: JSON.stringify({ data: response, success: true }),
  scoped,
});
const billing = (
  action: string,
  method: string,
  path: string,
  body: FixtureBody,
  response: FixtureBody = completed
): WriteCase =>
  item(
    [
      "billing",
      action,
      ...data(body),
      ...(["plan-preview", "credit-preview", "profile-set", "portal"].includes(
        action
      )
        ? []
        : ["--yes"]),
    ],
    method,
    `/v1/billing/${path}`,
    { ...body, organizationId: "org_123" },
    false,
    response
  );
export const v2WriteCases: WriteCase[] = [
  item(
    ["website", "create", ...data(websiteInput), "--yes"],
    "POST",
    "/v1/website-audit/targets",
    websiteInput,
    true
  ),
  item(
    [
      "website",
      "update",
      "target_123",
      ...data({ ...websiteInput, approvedAuditPolicy: null, enabled: true }),
      "--yes",
    ],
    "PUT",
    "/v1/website-audit/targets/target_123",
    { ...websiteInput, approvedAuditPolicy: null, enabled: true }
  ),
  item(
    ["website", "search-console-sync"],
    "POST",
    "/v1/website-audit/search-console/sync",
    {},
    true
  ),
  item(
    [
      "consent",
      "translations-set",
      "--project",
      "prj_123",
      ...data({
        i18n: {
          defaultProfile: "public",
          messages: {
            public: {
              fallbackLanguage: "en",
              translations: { en: { banner: { title: "Your choice" } } },
            },
          },
        },
      }),
      "--yes",
    ],
    "PUT",
    "/v1/projects/prj_123/consent/configuration/i18n",
    {
      i18n: {
        defaultProfile: "public",
        messages: {
          public: {
            fallbackLanguage: "en",
            translations: { en: { banner: { title: "Your choice" } } },
          },
        },
      },
    }
  ),
  item(
    [
      "consent",
      "policies-set",
      "--project",
      "prj_123",
      ...data({ policies: [consentPolicy] }),
      "--yes",
    ],
    "PUT",
    "/v1/projects/prj_123/consent/configuration/policies",
    {
      policies: [consentPolicy],
    }
  ),
  ...["update", "upgrade"].map((action) =>
    item(
      [
        "consent",
        `lifecycle-${action}`,
        "--project",
        "prj_123",
        "--expected-instance-id",
        "ins_123",
        "--expected-backend-version",
        "1.0.0",
        "--yes",
      ],
      "POST",
      `/v1/projects/prj_123/consent/lifecycle/${action}`,
      lifecycle
    )
  ),
  item(
    [
      "consent",
      "runtime-delete",
      "--project",
      "prj_123",
      ...data(lifecycle),
      "--yes",
    ],
    "DELETE",
    "/v1/projects/prj_123/consent/runtime",
    lifecycle
  ),
  item(
    [
      "consent",
      "runtime-key-create",
      "--project",
      "prj_123",
      "--name",
      "Deployment",
    ],
    "POST",
    "/v1/projects/prj_123/consent/runtime-keys",
    { name: "Deployment" },
    false,
    { id: "key_123", key: "one-time-runtime-secret", secretAvailableOnce: true }
  ),
  item(
    [
      "consent",
      "runtime-key-revoke",
      "key_123",
      "--project",
      "prj_123",
      "--yes",
    ],
    "DELETE",
    "/v1/projects/prj_123/consent/runtime-keys/key_123"
  ),
  item(
    [
      "consent",
      "runtime-key-rotate",
      "key_123",
      "--project",
      "prj_123",
      "--overlap-seconds",
      "0",
      "--yes",
    ],
    "POST",
    "/v1/projects/prj_123/consent/runtime-keys/key_123/rotate",
    { overlapSeconds: 0 },
    false,
    {
      id: "key_456",
      key: "one-time-rotated-secret",
      overlapSeconds: 0,
      secretAvailableOnce: true,
    }
  ),
  billing(
    "plan-preview",
    "POST",
    "plans/preview",
    { input: plan },
    billingQuote
  ),
  billing("plan-change", "POST", "plans/change", {
    approvedQuote: {
      ...billingQuote,
      nextCycle: { startsAt: "2026-11-29T15:45:00Z", total: 1200 },
    },
    input: plan,
  }),
  billing(
    "credit-preview",
    "POST",
    "credits/preview",
    { input: credits },
    billingQuote
  ),
  billing("credit-purchase", "POST", "credits/purchase", {
    approvedQuote: billingQuote,
    input: credits,
  }),
  billing("auto-top-up-set", "PUT", "credit-auto-top-up", {
    input: {
      catalogVersion: 1,
      enabled: true,
      monthlyPurchaseLimit: 3,
      quantityCredits: 100,
      requestId: writeUuid,
      thresholdCredits: 20,
    },
  }),
  billing("profile-set", "PUT", "profile", {
    input: {
      address: {
        city: "London",
        country: "GB",
        line1: "1 High Street",
        line2: null,
        postalCode: "SW1A 1AA",
        state: null,
      },
      businessName: "Example",
    },
  }),
  billing("subscription-cancel", "POST", "subscriptions/cancel", {
    confirmCancellation: true,
    input: { product: "inth", requestId: writeUuid },
  }),
  billing("subscription-uncancel", "POST", "subscriptions/uncancel", {
    input: { product: "consent", requestId: writeUuid },
  }),
  billing("payment-default", "PUT", "payment-methods/default", {
    paymentMethodId: "pm_123",
  }),
  billing("payment-remove", "POST", "payment-methods/remove", {
    confirmPaymentMethodId: "pm_123",
    paymentMethodId: "pm_123",
  }),
  item(
    ["billing", "portal"],
    "POST",
    "/v1/billing/portal",
    { organizationId: "org_123" },
    false,
    { url: "https://billing.example.test/person" }
  ),
  item(
    [
      "support",
      "start",
      "--message",
      "Please help",
      "--client-message-id",
      writeUuid,
      "--attachment-ids",
      '["sat_123","sat_456"]',
    ],
    "POST",
    "/v1/support/conversations",
    {
      attachmentIds: ["sat_123", "sat_456"],
      clientMessageId: writeUuid,
      text: "Please help",
    },
    true
  ),
  item(
    [
      "support",
      "send",
      "spc_123",
      ...data({
        attachmentIds: [],
        clientMessageId: writeUuid,
        text: "More detail",
      }),
    ],
    "POST",
    "/v1/support/conversations/spc_123/messages",
    { attachmentIds: [], clientMessageId: writeUuid, text: "More detail" }
  ),
  item(
    ["support", "share", "spc_123", "--visibility", "organization", "--yes"],
    "POST",
    "/v1/support/conversations/spc_123/share",
    {}
  ),
  item(
    ["support", "close", "spc_123"],
    "POST",
    "/v1/support/conversations/spc_123/close",
    {}
  ),
  item(
    ["support", "reopen", "spc_123"],
    "POST",
    "/v1/support/conversations/spc_123/reopen",
    {}
  ),
  item(
    ["account", "update", "--name", "Alex", "--hide-pii", "false"],
    "PATCH",
    "/v1/account",
    { hidePII: false, name: "Alex" },
    true
  ),
  {
    ...item(
      ["account", "avatar-set", "--file", "image.png"],
      "PUT",
      "/v1/account/avatar",
      undefined,
      true
    ),
    image: true,
  },
  item(
    ["account", "avatar-remove", "--yes"],
    "DELETE",
    "/v1/account/avatar",
    undefined,
    true
  ),
  item(
    ["account", "delete", "--confirmation", "alex@example.com", "--yes"],
    "DELETE",
    "/v1/account",
    { confirmation: "alex@example.com" },
    true
  ),
  item(
    [
      "notification",
      "update",
      "--scope",
      "organization",
      "--family",
      "banner-recording",
      "--enabled",
      "false",
      "--mode",
      "daily",
    ],
    "PATCH",
    "/v1/notifications/preferences",
    {
      enabled: false,
      family: "banner-recording",
      mode: "daily",
      scope: "organization",
    },
    true
  ),
  item(
    [
      "notification",
      "routing-set",
      ...data({
        configured: true,
        role: "engineering",
        userIds: ["usr_1", "usr_2"],
      }),
      "--yes",
    ],
    "PUT",
    "/v1/notifications/routing",
    { configured: true, role: "engineering", userIds: ["usr_1", "usr_2"] },
    true
  ),
  item(
    ["org", "settings-update", "org_123", ...data({ name: "New name" })],
    "PATCH",
    "/v1/organizations/org_123/settings",
    { name: "New name" }
  ),
  {
    ...item(
      ["org", "logo-set", "org_123", "--file", "image.png"],
      "PUT",
      "/v1/organizations/org_123/logo"
    ),
    image: true,
  },
  item(
    ["org", "logo-remove", "org_123", "--yes"],
    "DELETE",
    "/v1/organizations/org_123/logo"
  ),
  item(
    [
      "org",
      "slug-update",
      "org_123",
      "--new-slug",
      "new-name",
      "--expected-slug",
      "old-name",
      "--yes",
    ],
    "POST",
    "/v1/organizations/org_123/slug",
    { expectedSlug: "old-name", newSlug: "new-name" }
  ),
  item(
    [
      "org",
      "delete",
      "org_123",
      ...data({ confirmation: "old-name" }),
      "--yes",
    ],
    "DELETE",
    "/v1/organizations/org_123",
    { confirmation: "old-name" }
  ),
  item(
    [
      "org",
      "retention-set",
      "org_123",
      "--mutation-id",
      "retention-change-1",
      "--expected-version",
      "0",
      "--provider-retention",
      "strict-zdr",
      "--yes",
    ],
    "PATCH",
    "/v1/organizations/org_123/data-controls",
    {
      expectedVersion: 0,
      mutationId: "retention-change-1",
      providerRetention: "strict-zdr",
    }
  ),
  item(
    ["integration", "github-install"],
    "POST",
    "/v1/integrations/github/install",
    {},
    true,
    { installUrl: "https://github.example.test/person", mode: "hosted-person" }
  ),
  item(
    ["integration", "github-sync"],
    "POST",
    "/v1/integrations/github/sync",
    {},
    true
  ),
  item(
    ["integration", "github-installation-sync", "installation_123"],
    "POST",
    "/v1/integrations/github/installations/installation_123/sync",
    {},
    true
  ),
  item(
    [
      "integration",
      "github-repository-update",
      "repo_123",
      "--branch-filters",
      "[]",
      "--ignored-paths",
      '["vendor/**"]',
    ],
    "PATCH",
    "/v1/integrations/github/repositories/repo_123",
    { branchFilters: [], ignoredPaths: ["vendor/**"] },
    true
  ),
  item(
    [
      "integration",
      "github-pull-request-scans-set",
      "repo_123",
      "--enabled",
      "true",
      "--yes",
    ],
    "PUT",
    "/v1/integrations/github/repositories/repo_123/pull-request-scans",
    { enabled: true },
    true
  ),
  item(
    [
      "integration",
      "github-project-link-set",
      "repo_123",
      "--project",
      "prj_123",
      "--yes",
    ],
    "PUT",
    "/v1/integrations/github/repositories/repo_123/project-link",
    { projectId: "prj_123" },
    true
  ),
  item(
    ["integration", "github-scheduled-policies-cleanup", "--yes"],
    "POST",
    "/v1/integrations/github/scheduled-policies/cleanup",
    {},
    true
  ),
  item(
    ["account", "session-revoke", "session_123", "--yes"],
    "DELETE",
    "/v1/account/sessions/session_123",
    undefined,
    true
  ),
  item(
    [
      "account",
      "sessions-revoke",
      "--mode",
      "all",
      "--confirmation",
      "revoke-all-browser-sessions",
      "--yes",
    ],
    "POST",
    "/v1/account/sessions/revoke",
    { confirmation: "revoke-all-browser-sessions", mode: "all" },
    true
  ),
  item(
    ["account", "device-revoke", "device_123", "--yes"],
    "DELETE",
    "/v1/account/connected-devices/device_123",
    undefined,
    true
  ),
  item(
    [
      "code-audit",
      "quote-approve",
      "scan_123",
      "--quote-id",
      "quote_123",
      "--candidate-plan-checksum",
      "checksum_123",
      "--max-credits",
      "50",
      "--request-id",
      writeUuid,
      "--yes",
    ],
    "POST",
    "/v1/code-audit/scans/scan_123/quote/approve",
    {
      candidatePlanChecksum: "checksum_123",
      maxCredits: 50,
      organizationId: "org_123",
      quoteId: "quote_123",
      requestId: writeUuid,
    },
    false,
    { status: "started" }
  ),
];
