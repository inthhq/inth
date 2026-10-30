/* eslint-disable anti-slop/no-runtime-typeof -- Validate untrusted JSON in Node and the native runtime. */
import { CliError } from "./cli-error.ts";
import { terminalText } from "./organizations.ts";
import { parseTimestamp } from "./resource-validation.ts";

export type InputValue =
  | null
  | boolean
  | number
  | string
  | InputValue[]
  | { [key: string]: InputValue };
export type InputObject = Record<string, InputValue>;
export interface InputSchema {
  type?: string;
  never?: boolean;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  minProperties?: number;
  pattern?: string;
  format?: string;
  trim?: boolean;
  keyMax?: number;
  enumJson?: string[];
  choices?: number[];
  properties?: { key: string; schema: number }[];
  required?: string[];
  additional?: number;
  items?: number;
}
export const writeUsage = (message: string): never => {
  throw new CliError("usage_error", message);
};
export const parseInput = (source: string): InputValue => {
  if (new TextEncoder().encode(source).byteLength > 1_048_576) {
    writeUsage("JSON input exceeds the 1048576 byte input limit.");
  }
  try {
    // SAFETY: JSON is checked recursively against the command's schema before use.
    return JSON.parse(source) as InputValue;
  } catch {
    return writeUsage("Provide valid UTF-8 JSON input.");
  }
};
export const inputObject = (
  value: InputValue,
  label = "JSON body"
): Record<string, InputValue> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return writeUsage(`${label} must be a JSON object.`);
  }
  return value;
};
export const inputString = (
  value: InputValue | undefined,
  label: string
): string => {
  if (typeof value !== "string") {
    return writeUsage(`${label} must be a string.`);
  }
  return value;
};
export const inputArray = (
  value: InputValue | undefined,
  label: string
): InputValue[] => {
  if (!Array.isArray(value)) {
    return writeUsage(`${label} must be an array.`);
  }
  return value;
};
const invalid = (label: string): string =>
  `${label} does not match the declared input contract.`;
const websiteOriginValid = (value: string): boolean => {
  const trimmed = value.trim();
  const candidate =
    /^[a-z][a-z0-9+.-]*:\/\//iu.test(trimmed) || trimmed.startsWith("/")
      ? trimmed
      : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.hostname.includes("%")
    );
  } catch {
    return false;
  }
};
const stringError = (
  value: string,
  schema: InputSchema,
  label: string
): string => {
  if (schema.trim && value !== value.trim()) {
    return `${label} must have no surrounding whitespace.`;
  }
  if (
    value.length < (schema.minLength ?? 0) ||
    value.length > (schema.maxLength ?? 1_048_576)
  ) {
    return invalid(label);
  }
  if (schema.pattern && !new RegExp(schema.pattern, "u").test(value)) {
    return invalid(label);
  }
  if (
    schema.format === "date-time" &&
    !Number.isFinite(parseTimestamp(value))
  ) {
    return `${label} must be a valid timestamp with timezone.`;
  }
  if (schema.format === "website-origin" && !websiteOriginValid(value)) {
    return `${label} must be a valid website domain or HTTP(S) URL.`;
  }
  return "";
};
const objectError = (
  value: Record<string, InputValue>,
  schema: InputSchema,
  nodes: InputSchema[],
  label: string,
  depth: number
): string => {
  const keys = Object.keys(value);
  if (keys.length < (schema.minProperties ?? 0)) {
    return `${label} requires at least one field.`;
  }
  for (const key of schema.required ?? []) {
    if (value[key] === undefined) {
      return `${label}.${key} is required.`;
    }
  }
  for (const key of keys) {
    if (schema.keyMax !== undefined && key.length > schema.keyMax) {
      return `${label} contains an overlong key.`;
    }
    const property = schema.properties?.find((entry) => entry.key === key);
    const child = property?.schema ?? schema.additional ?? 0;
    if (child === 1) {
      return `Unknown JSON field ${terminalText(key)} in ${label}.`;
    }
    // eslint-disable-next-line no-use-before-define -- Object members recurse through the same schema validator.
    const error = inputError(
      value[key] ?? null,
      child,
      nodes,
      `${label}.${terminalText(key)}`,
      depth + 1
    );
    if (error) {
      return error;
    }
  }
  return "";
};
const numberError = (
  value: InputValue,
  schema: InputSchema,
  label: string
): string => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    (schema.type === "integer" && !Number.isSafeInteger(value))
  ) {
    return invalid(label);
  }
  if (
    value < (schema.minimum ?? Number.NEGATIVE_INFINITY) ||
    value > (schema.maximum ?? Number.POSITIVE_INFINITY)
  ) {
    return invalid(label);
  }
  if (
    schema.exclusiveMinimum !== undefined &&
    value <= schema.exclusiveMinimum
  ) {
    return invalid(label);
  }
  if (
    schema.exclusiveMaximum !== undefined &&
    value >= schema.exclusiveMaximum
  ) {
    return invalid(label);
  }
  return "";
};
const arrayError = (
  value: InputValue,
  schema: InputSchema,
  nodes: InputSchema[],
  label: string,
  depth: number
): string => {
  if (
    !Array.isArray(value) ||
    value.length < (schema.minItems ?? 0) ||
    value.length > (schema.maxItems ?? 1_048_576)
  ) {
    return invalid(label);
  }
  for (let i = 0; i < value.length; i += 1) {
    // eslint-disable-next-line no-use-before-define -- Array members recurse through the same schema validator.
    const error = inputError(
      value[i] ?? null,
      schema.items ?? 0,
      nodes,
      `${label}[${i}]`,
      depth + 1
    );
    if (error) {
      return error;
    }
  }
  return "";
};
const objectValueError = (
  value: InputValue,
  schema: InputSchema,
  nodes: InputSchema[],
  label: string,
  depth: number
): string => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return invalid(label);
  }
  return objectError(value, schema, nodes, label, depth);
};
export const inputError = (
  value: InputValue,
  index: number,
  nodes: InputSchema[],
  label: string,
  depth = 0
): string => {
  if (depth > 64) {
    return `${label} exceeds the supported document depth.`;
  }
  const schema = nodes[index];
  if (!schema || schema.never) {
    return invalid(label);
  }
  const { choices } = schema;
  if (choices) {
    for (const choice of choices) {
      if (!inputError(value, choice, nodes, label, depth + 1)) {
        return "";
      }
    }
    return invalid(label);
  }
  if (schema.enumJson && !schema.enumJson.includes(JSON.stringify(value))) {
    return invalid(label);
  }
  switch (schema.type) {
    case "null": {
      return value === null ? "" : invalid(label);
    }
    case "string": {
      return typeof value === "string"
        ? stringError(value, schema, label)
        : invalid(label);
    }
    case "boolean": {
      return typeof value === "boolean" ? "" : invalid(label);
    }
    case "integer":
    case "number": {
      return numberError(value, schema, label);
    }
    case "array": {
      return arrayError(value, schema, nodes, label, depth);
    }
    case "object": {
      return objectValueError(value, schema, nodes, label, depth);
    }
    default: {
      return "";
    }
  }
};
