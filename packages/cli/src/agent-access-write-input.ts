import {
  WRITE_SCHEMAS,
  WRITE_SCHEMA_NAMES,
} from "./agent-access-write-schemas.ts";
/* eslint-disable anti-slop/no-runtime-typeof -- Validate CLI JSON and option values at the input boundary. */
import type { CliArguments } from "./arguments.ts";
import { optionValue as option } from "./option-value.ts";
import type { ResourceCommand } from "./resource-commands.ts";
import {
  inputArray,
  inputError,
  inputObject,
  inputString,
  parseInput,
  writeUsage,
} from "./write-input.ts";
import type { InputObject, InputValue } from "./write-input.ts";

export const validateWriteSchema = (name: string, value: InputValue): void => {
  const schema = WRITE_SCHEMA_NAMES.find((entry) => entry.name === name);
  if (!schema) {
    throw new Error("Missing write input contract.");
  }
  const error = inputError(value, schema.schema, WRITE_SCHEMAS, "body");
  if (error) {
    writeUsage(error);
  }
};
const unique = (values: InputValue[], label: string): void => {
  if (
    new Set(values.map((value) => JSON.stringify(value))).size !== values.length
  ) {
    writeUsage(`${label} must contain unique IDs in the intended order.`);
  }
};
const supportInput = (body: Record<string, InputValue>): void => {
  const text = inputString(body.text, "Support text").trim();
  if (!text || text.length > 64_000) {
    writeUsage("Support requires nonempty text up to 64000 characters.");
  }
  body.text = text;
  const ids =
    body.attachmentIds === undefined
      ? []
      : inputArray(body.attachmentIds, "attachmentIds");
  if (ids.length > 5) {
    writeUsage("Support accepts at most five attachment IDs.");
  }
  unique(ids, "attachmentIds");
  body.attachmentIds = ids;
};
const identityConfirmations = (
  options: CliArguments,
  body: InputObject
): void => {
  if (options.command === "account" && options.argument === "delete") {
    const email = inputString(body.confirmation, "confirmation");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
      writeUsage(
        "Account deletion requires the exact current email in --confirmation."
      );
    }
  }
  if (
    options.command === "org" &&
    options.argument === "delete" &&
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(
      inputString(body.confirmation, "confirmation")
    )
  ) {
    writeUsage(
      "Organization deletion requires its exact current slug in --confirmation."
    );
  }
};
const refineBody = (
  options: CliArguments,
  body: Record<string, InputValue>
): void => {
  if (
    options.command === "support" &&
    ["start", "send"].includes(options.argument)
  ) {
    supportInput(body);
  }
  if (
    options.command === "notification" &&
    options.argument === "routing-set"
  ) {
    const ids = inputArray(body.userIds, "userIds");
    unique(ids, "userIds");
    if (body.configured === false && ids.length) {
      writeUsage("Unconfigured routing requires an empty userIds array.");
    }
  }
  if (options.command === "account" && options.argument === "sessions-revoke") {
    if (
      body.mode === "all" &&
      body.confirmation !== "revoke-all-browser-sessions"
    ) {
      writeUsage(
        "Revoking all browser sessions requires --confirmation revoke-all-browser-sessions, including with --yes."
      );
    }
    if (body.mode === "others" && body.confirmation !== undefined) {
      writeUsage(
        "Use confirmation only with mode all. OAuth has no current browser session; others may require the Dashboard."
      );
    }
  }
  if (
    options.command === "billing" &&
    options.argument === "payment-remove" &&
    body.paymentMethodId !== body.confirmPaymentMethodId
  ) {
    writeUsage("confirmPaymentMethodId must exactly match paymentMethodId.");
  }
  identityConfirmations(options, body);
};
const sourceOptions = (options: CliArguments): void => {
  if (
    options.command !== "support" ||
    !["start", "send"].includes(options.argument)
  ) {
    return;
  }
  const sources = ["message", "message-file", "data", "data-file"].filter(
    (name) => option(options, name) !== undefined
  );
  if (sources.length !== 1) {
    writeUsage(
      "Use exactly one of --message, --message-file <path|->, --data or --data-file for Support text."
    );
  }
};
const optionJson = (value: string, type: string, label: string): InputValue => {
  if (type === "integer") {
    if (!/^\d+$/u.test(value)) {
      return writeUsage(`--${label} must be a decimal integer.`);
    }
    return Number(value);
  }
  if (type === "boolean") {
    if (value !== "true" && value !== "false") {
      return writeUsage(`--${label} must be true or false.`);
    }
    return value === "true";
  }
  return type === "json" ? parseInput(value) : value;
};
const flatBody = (
  options: CliArguments,
  spec: ResourceCommand
): InputObject => {
  const body: Record<string, InputValue> = {};
  for (const rule of spec.rules ?? []) {
    const value = option(options, rule.name);
    if (
      rule.location !== "body" ||
      value === undefined ||
      rule.name === "message-file"
    ) {
      continue;
    }
    const segments = rule.key.split(".");
    const leaf = segments.at(-1) ?? "";
    let target = body;
    if (segments.length === 2) {
      const parent = segments[0] ?? "";
      if (body[parent] === undefined) {
        body[parent] = {};
      }
      target = inputObject(body[parent] ?? null);
    }
    target[leaf] = optionJson(value, rule.type, rule.name);
  }
  return body;
};
export const v2WriteBody = (
  options: CliArguments,
  spec: ResourceCommand
): string | undefined => {
  sourceOptions(options);
  if (
    options.command === "consent" &&
    ["runtime-key-revoke", "runtime-key-rotate"].includes(options.argument) &&
    !/^[A-Za-z0-9_-]+$/u.test(options.id)
  ) {
    writeUsage("Use the exact runtime key ID from consent runtime-keys.");
  }
  if (
    options.command === "integration" &&
    options.id &&
    (/^\d+$/u.test(options.id) || options.id.includes("/"))
  ) {
    writeUsage(
      "Use the internal installation, repository or project-link ID from integration discovery. GitHub numeric IDs and owner/name are not accepted."
    );
  }
  if (spec.image || spec.writeSchema === "none") {
    return spec.body;
  }
  if (
    option(options, "data-file") !== undefined ||
    option(options, "message-file") !== undefined
  ) {
    return undefined;
  }
  const data = option(options, "data");
  const body =
    data === undefined
      ? flatBody(options, spec)
      : inputObject(parseInput(data));
  if (
    body.organizationId !== undefined &&
    options.organization !== undefined &&
    body.organizationId !== options.organization
  ) {
    writeUsage("The JSON organizationId conflicts with --organization.");
  }
  validateWriteSchema(spec.writeSchema ?? "", body);
  refineBody(options, body);
  return JSON.stringify(body);
};
