import { z } from "zod";

import type { CliArguments } from "../../src/arguments.ts";
import { CliError } from "../../src/cli-error.ts";
import type { DisplayOptions } from "../../src/display.ts";
import { resourceSummary, resourceIsList } from "../../src/resource-output.ts";

const scanSchema = z.object({
  access: z.string().optional(),
  branch: z.string().nullable().optional(),
  createdAt: z.string().nullable().optional(),
  findingCount: z.number().nullable().optional(),
  id: z.string().optional(),
  issueCount: z.number().nullable().optional(),
  progress: z
    .object({
      completedStages: z.number().nullable(),
      stage: z.string(),
      totalStages: z.number().nullable(),
    })
    .nullable()
    .optional(),
  repositoryId: z.string().optional(),
  repositoryName: z.string().nullable().optional(),
  status: z.string().optional(),
  unlockCredits: z.number().nullable().optional(),
});
const personSchema = z.object({ email: z.string(), name: z.string() });
const itemSchema = scanSchema.extend({
  autoTopUp: z
    .object({
      enabled: z.boolean(),
      quantityCredits: z.number().nullable(),
      thresholdCredits: z.number().nullable(),
    })
    .nullable()
    .optional(),
  codeEvidence: z
    .object({
      filePath: z.string(),
      lineNumbers: z.array(z.number()),
      recommendation: z.string().nullable(),
    })
    .nullable()
    .optional(),
  consent: z
    .object({
      backendUrl: z.string().nullable(),
      branding: z.string(),
      trustedOrigins: z.array(z.string()),
    })
    .nullable()
    .optional(),
  credits: z
    .object({ remaining: z.number(), unlimited: z.boolean() })
    .nullable()
    .optional(),
  dashboardUrl: z.string().optional(),
  defaultBranch: z.string().nullable().optional(),
  deleted: z.boolean().optional(),
  description: z.string().nullable().optional(),
  email: z.string().optional(),
  expiresAt: z.string().optional(),
  githubIssue: z
    .object({ number: z.number(), url: z.string() })
    .nullable()
    .optional(),
  htmlUrl: z.string().optional(),
  invitedBy: personSchema.optional(),
  issues: z
    .array(
      z.object({
        description: z.string().nullable().optional(),
        files: z.array(z.string()).optional(),
        id: z.string(),
        priority: z.string().nullable().optional(),
        recommendation: z.string().nullable().optional(),
        title: z.string(),
      })
    )
    .optional(),
  key: z.string().optional(),
  label: z.string().optional(),
  lockedCount: z.number().optional(),
  message: z.string().optional(),
  name: z.string().optional(),
  organizationId: z.string().optional(),
  owner: z.string().optional(),
  plan: z
    .object({
      billingInterval: z.string().nullable(),
      name: z.string(),
      pastDue: z.boolean(),
    })
    .nullable()
    .optional(),
  prefix: z.string().nullable().optional(),
  preparationId: z.string().optional(),
  priority: z.string().nullable().optional(),
  role: z.string().optional(),
  scan: scanSchema.optional(),
  scanId: z.string().optional(),
  slug: z.string().optional(),
  source: z.string().optional(),
  summary: z.string().nullable().optional(),
  tier: z.string().optional(),
  title: z.string().optional(),
  totalCount: z.number().optional(),
  updated: z.boolean().optional(),
  user: personSchema.optional(),
  version: z.string().optional(),
  visibility: z.string().optional(),
});
export const formatResource = (
  options: CliArguments,
  body: string,
  display: DisplayOptions
): string => {
  if (options.json || options.command === "api") {
    return body;
  }
  try {
    if (!body) {
      return resourceSummary(options, { data: [], success: true }, display);
    }
    if (resourceIsList(options)) {
      const page = z
        .object({
          data: z.array(itemSchema),
          pagination: z
            .object({ hasMore: z.boolean(), nextCursor: z.string().nullable() })
            .optional(),
          success: z.literal(true),
        })
        .parse(JSON.parse(body));
      return resourceSummary(options, page, display);
    }
    const result = z
      .object({ data: itemSchema, success: z.literal(true) })
      .parse(JSON.parse(body));
    return resourceSummary(
      options,
      { data: [result.data], success: true },
      display
    );
  } catch {
    throw new CliError(
      "invalid_response",
      "Cannot format the API response. Run the command with --json to inspect it."
    );
  }
};
