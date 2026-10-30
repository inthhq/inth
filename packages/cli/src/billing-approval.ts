import { fsyncSync } from "node:fs";

import { validateWriteSchema } from "./agent-access-write-input.ts";
import type { CliArguments } from "./arguments.ts";
import { CliError } from "./cli-error.ts";
import { terminalText } from "./organizations.ts";
import { PrivateOutputFile, writeAllSync } from "./private-output-file.ts";
import { optionValue } from "./resource-commands.ts";
import type { ResourceRequest } from "./resource-commands.ts";
import { inputObject, parseInput } from "./write-input.ts";

export const saveBillingApproval = (
  options: CliArguments,
  request: ResourceRequest,
  response: string
): void => {
  const path = optionValue(options, "save-approval");
  if (path === undefined) {
    return;
  }
  const body = inputObject(parseInput(request.body ?? "{}"));
  if (!body.organizationId) {
    throw new CliError(
      "usage_error",
      "Select an explicit organization before saving a financial approval."
    );
  }
  const quote =
    inputObject(parseInput(response), "Preview response").data ?? null;
  try {
    validateWriteSchema("BillingQuote", quote);
  } catch {
    throw new CliError(
      "invalid_response",
      "The API returned an invalid billing quote. No approval was saved."
    );
  }
  const approval = {
    approvedQuote: quote,
    input: body.input ?? null,
    organizationId: body.organizationId,
  };
  validateWriteSchema(
    options.argument === "plan-preview"
      ? "BillingPlanChangeInput"
      : "BillingCreditPurchaseInput",
    approval
  );
  try {
    const output = new PrivateOutputFile(path);
    try {
      const bytes = new TextEncoder().encode(
        `${JSON.stringify(approval, null, 2)}\n`
      );
      writeAllSync(output.descriptor, bytes);
      fsyncSync(output.descriptor);
      output.finish();
    } finally {
      output.dispose();
    }
  } catch {
    throw new CliError(
      "approval_save_failed",
      "Could not save the billing approval. Use --save-approval with a new writable file path; existing files are never overwritten."
    );
  }
  console.error(
    `Saved full quote and matching input to ${terminalText(path)}. Review it, then run inth billing ${options.argument === "plan-preview" ? "plan-change" : "credit-purchase"} --data-file <that-file> --yes. Prices are minor currency units; nextCycle includes the recurring amount and renewal date. A changed quote requires a new explicit review.`
  );
};
