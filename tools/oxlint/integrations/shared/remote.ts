import type { ESTree, SourceCode } from "vite-plus/lint/plugins";

import {
  effectiveStringValue,
  lookupProperty,
  resolveValue,
  stringLiteralValue,
} from "./ast.ts";

const DEFINE_REMOTE_NAMES = new Set([
  "defineRemote",
  "defineRemoteIntegration",
]);

const calleeName = (callee: ESTree.Expression): string | null => {
  if (callee.type === "Identifier") {
    return callee.name;
  }
  if (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.property.type === "Identifier"
  ) {
    return callee.property.name;
  }
  return null;
};

export type RemoteOptions =
  | { status: "object"; object: ESTree.ObjectExpression }
  | { status: "unknown"; node: ESTree.Node };

/**
 * The options object of a `defineRemote(key, options, resolve)` call, followed
 * through a `const`. Null when the call is not one of those functions.
 */
export const remoteOptions = (
  sourceCode: SourceCode,
  call: ESTree.CallExpression
): RemoteOptions | null => {
  const name = calleeName(call.callee);
  if (name === null || !DEFINE_REMOTE_NAMES.has(name)) {
    return null;
  }
  const [, argument] = call.arguments;
  if (!argument) {
    return null;
  }
  if (argument.type === "SpreadElement") {
    return { node: argument, status: "unknown" };
  }
  const options = resolveValue(sourceCode, argument);
  return options.type === "ObjectExpression"
    ? { object: options, status: "object" }
    : { node: argument, status: "unknown" };
};

/** Whether an option spec has kind `hostname`, following `const`s and spreads. */
export const isHostnameSpec = (
  sourceCode: SourceCode,
  value: ESTree.Expression
): boolean => {
  const spec = resolveValue(sourceCode, value);
  return (
    spec.type === "ObjectExpression" &&
    effectiveStringValue(sourceCode, spec, "kind") === "hostname"
  );
};

/**
 * The `pattern` of an option spec with kind `id`, when both are plain strings
 * the rule can read through `const`s and spreads. Null otherwise.
 */
export const idSpecPattern = (
  sourceCode: SourceCode,
  value: ESTree.Expression
): string | null => {
  const spec = resolveValue(sourceCode, value);
  if (
    spec.type !== "ObjectExpression" ||
    effectiveStringValue(sourceCode, spec, "kind") !== "id"
  ) {
    return null;
  }
  const pattern = lookupProperty(sourceCode, spec, "pattern");
  return pattern.status === "found"
    ? stringLiteralValue(resolveValue(sourceCode, pattern.value))
    : null;
};
