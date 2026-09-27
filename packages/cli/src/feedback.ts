import { randomUUID } from "node:crypto";

import type { CliArguments } from "./arguments.ts";
import { CliError } from "./cli-error.ts";

export const FEEDBACK_CATEGORIES = [
  "bug",
  "friction",
  "docs_mismatch",
  "feature_request",
  "performance",
];
export const FEEDBACK_SURFACES = ["api", "mcp", "cli", "docs", "sdk"];

export const feedbackBody = (options: CliArguments, body: string): string => {
  // SAFETY: Read only the optional ID; preserve the complete raw body for server validation.
  const input = JSON.parse(body) as { clientSubmissionId?: string };
  if (input.clientSubmissionId !== undefined) {
    throw new CliError(
      "usage_error",
      "Submission IDs are generated automatically; omit clientSubmissionId from --data."
    );
  }
  if (!options.feedbackSubmissionId) {
    options.feedbackSubmissionId = randomUUID();
  }
  const contents = body.trim().slice(1, -1).trim();
  return `{"clientSubmissionId":${JSON.stringify(options.feedbackSubmissionId)}${contents ? `,${contents}` : ""}}`;
};

const textFields = [
  { limit: 8000, name: "message" },
  { limit: 2000, name: "expected" },
  { limit: 2000, name: "actual" },
  { limit: 4000, name: "reproduction" },
  { limit: 128, name: "request-id" },
  { limit: 255, name: "operation" },
  { limit: 100, name: "client-name" },
  { limit: 100, name: "client-version" },
];

export const feedbackFieldJson = (name: string, input: string): string => {
  const field = textFields.find((entry) => entry.name === name);
  const value = field ? input.trim() : input;
  if (field && (!value || value.length > field.limit)) {
    throw new CliError(
      "usage_error",
      `--${name} must contain 1 through ${field.limit} characters after trimming.`
    );
  }
  let values: string[] = [];
  if (name === "category") {
    values = FEEDBACK_CATEGORIES;
  } else if (name === "surface") {
    values = FEEDBACK_SURFACES;
  }
  if (values.length && !values.includes(value)) {
    throw new CliError(
      "usage_error",
      `--${name} must be one of: ${values.join(", ")}.`
    );
  }
  const property = name
    .split("-")
    .map((part, index) =>
      index === 0 ? part : part.slice(0, 1).toUpperCase() + part.slice(1)
    )
    .join("");
  return `${JSON.stringify(property)}:${JSON.stringify(value)}`;
};
