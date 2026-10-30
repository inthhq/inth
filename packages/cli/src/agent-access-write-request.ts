import type { CliArguments } from "./arguments.ts";
import { CliError } from "./cli-error.ts";
import { HttpError } from "./http-error.ts";
import { terminalText } from "./organizations.ts";
import { optionValue, resourceCommand } from "./resource-commands.ts";
import type { ResourceRequest } from "./resource-commands.ts";
import {
  inputObject,
  inputString,
  parseInput,
  writeUsage,
} from "./write-input.ts";

export const resolveWriteRequest = async (
  options: CliArguments,
  request: ResourceRequest,
  resolve: (organization?: string) => Promise<string | undefined>
): Promise<{ request: ResourceRequest; organization: string | undefined }> => {
  const spec = resourceCommand(options);
  if (!spec?.organizationBody) {
    return {
      organization: request.scoped
        ? await resolve(options.organization)
        : undefined,
      request,
    };
  }
  const body = inputObject(parseInput(request.body ?? "{}"));
  const asserted =
    body.organizationId === undefined
      ? undefined
      : inputString(body.organizationId, "organizationId");
  if (asserted && options.organization && asserted !== options.organization) {
    writeUsage("The JSON organizationId conflicts with --organization.");
  }
  const organization = await resolve(options.organization ?? asserted);
  if (asserted && organization && asserted !== organization) {
    writeUsage(
      "The selected organization conflicts with the reviewed organizationId."
    );
  }
  if (!organization) {
    return writeUsage(
      "Select an organization with --organization, inth switch or inth link before a financial or prepared audit action."
    );
  }
  body.organizationId = organization;
  return {
    organization: undefined,
    request: { ...request, body: JSON.stringify(body), scoped: false },
  };
};
export const writeApprovalMessage = (
  options: CliArguments,
  request: ResourceRequest,
  organization?: string
): string => {
  const spec = resourceCommand(options);
  if (!spec?.approval) {
    return "";
  }
  const body = inputObject(parseInput(request.body ?? "{}"));
  const target = [
    options.id,
    optionValue(options, "project"),
    organization,
    body.organizationId === undefined
      ? undefined
      : inputString(body.organizationId, "organizationId"),
  ]
    .filter(Boolean)
    .join(" / ");
  const detail = JSON.stringify(body);
  return terminalText(
    `${spec.approval}: ${target || "signed-in account"}. Exact input: ${detail}. Proceed?`
  );
};
export const writeRetryDiagnostic = (
  options: CliArguments,
  request: ResourceRequest
): string => {
  const spec = resourceCommand(options);
  if (!spec?.writeSchema) {
    return "";
  }
  if (spec.image) {
    return "";
  }
  const body = inputObject(parseInput(request.body ?? "{}"));
  const input = body.input === undefined ? body : inputObject(body.input);
  const identity =
    input.requestId ??
    input.checkoutAttemptId ??
    body.clientMessageId ??
    body.mutationId;
  return identity === undefined
    ? ""
    : terminalText(
        `Mutation retry ID: ${inputString(identity, "Mutation identity")}. After an unknown outcome, reuse the exact organization, input and identity; check the current state before another action.`
      );
};
// eslint-disable-next-line anti-slop/no-unknown-parameters -- Inspect known errors at the mutation transport boundary without exposing their raw contents.
export const writeOutcomeError = (error: unknown): Error => {
  let status: number | null = null;
  if (error instanceof HttpError) {
    ({ status } = error);
  } else if (error instanceof CliError) {
    status = error.httpStatus;
  }
  const requestId =
    error instanceof HttpError || error instanceof CliError
      ? error.requestId
      : null;
  if (
    status !== null &&
    status >= 400 &&
    status < 500 &&
    ![408, 429].includes(status) &&
    error instanceof Error
  ) {
    return error;
  }
  return new CliError(
    "mutation_outcome_unknown",
    "The mutation outcome is unknown. No automatic retry was made. Check the resource state and reuse the identical request identity and reviewed input when the server supports recovery.",
    status,
    requestId
  );
};
export const writeResultExitCode = (
  options: CliArguments,
  source: string
): number => {
  if (!resourceCommand(options)?.writeSchema) {
    return 0;
  }
  const quoteApproval =
    options.command === "code-audit" && options.argument === "quote-approve";
  const billingMutation =
    options.command === "billing" &&
    [
      "plan-change",
      "credit-purchase",
      "auto-top-up-set",
      "subscription-cancel",
      "subscription-uncancel",
    ].includes(options.argument);
  if (!quoteApproval && !billingMutation) {
    return 0;
  }
  try {
    const envelope = inputObject(parseInput(source), "API response");
    const data = inputObject(envelope.data ?? null, "API response data");
    const completed = quoteApproval
      ? data.status === "started" || data.status === "already_started"
      : data.status === "completed" || data.status === "already_active";
    return completed ? 0 : 2;
  } catch {
    return 2;
  }
};
