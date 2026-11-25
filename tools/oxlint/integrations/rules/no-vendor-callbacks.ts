import { defineRule } from "vite-plus/lint/plugins";
import type { ESTree, SourceCode } from "vite-plus/lint/plugins";

import {
  memberPropertyName,
  propertyKeyName,
  resolveValue,
} from "../shared/ast.ts";

const CALLBACK_NAMES = new Set([
  "onBeforeLoad",
  "onConsentChange",
  "onDispose",
  "onError",
  "onLoad",
  "serverStart",
  "validate",
]);

const isAdapterFile = (filename: string): boolean =>
  /(?:^|[\\/])adapters[\\/]/u.test(filename);

/**
 * A manifest names some step lists like callbacks (`onConsentChange: [...]`).
 * Those are data the server can send, so only non-array values count.
 */
const isCallbackValue = (
  sourceCode: SourceCode,
  value: ESTree.Expression
): boolean => {
  const resolved = resolveValue(sourceCode, value);
  if (resolved.type === "ArrayExpression") {
    return false;
  }
  if (resolved.type === "Identifier" && resolved.name === "undefined") {
    return false;
  }
  return !(resolved.type === "Literal" && resolved.value === null);
};

const callbackPropertyName = (
  sourceCode: SourceCode,
  property: ESTree.ObjectProperty
): string | null => {
  const name = propertyKeyName(property);
  return name !== null &&
    CALLBACK_NAMES.has(name) &&
    isCallbackValue(sourceCode, property.value)
    ? name
    : null;
};

const callbackAssignmentName = (
  sourceCode: SourceCode,
  assignment: ESTree.AssignmentExpression
): string | null => {
  if (assignment.left.type !== "MemberExpression") {
    return null;
  }
  const name = memberPropertyName(assignment.left);
  return name !== null &&
    CALLBACK_NAMES.has(name) &&
    isCallbackValue(sourceCode, assignment.right)
    ? name
    : null;
};

/**
 * Code inside a callback belongs to the site that defines the callback, such
 * as a `serverStart` that returns `{ ...started, onBeforeLoad }`.
 */
const isInsideCallback = (
  sourceCode: SourceCode,
  node: ESTree.Node
): boolean => {
  let child: ESTree.Node = node;
  let { parent } = node;
  while (parent) {
    if (
      parent.type === "Property" &&
      parent.value === child &&
      callbackPropertyName(sourceCode, parent) !== null
    ) {
      return true;
    }
    if (
      parent.type === "AssignmentExpression" &&
      parent.right === child &&
      callbackAssignmentName(sourceCode, parent) !== null
    ) {
      return true;
    }
    child = parent;
    ({ parent } = parent);
  }
  return false;
};

const enclosingFunctionStart = (node: ESTree.Node): number => {
  let { parent } = node;
  while (parent) {
    if (
      parent.type === "FunctionDeclaration" ||
      parent.type === "FunctionExpression" ||
      parent.type === "ArrowFunctionExpression"
    ) {
      return parent.start;
    }
    ({ parent } = parent);
  }
  return -1;
};

interface AssignmentSite {
  node: ESTree.AssignmentExpression;
  names: string[];
}

const formatNames = (names: Iterable<string>): string =>
  [...new Set(names)].map((name) => `\`${name}\``).join(", ");

/**
 * Vendor files describe scripts as manifests the Inth server can send as
 * JSON. A lifecycle callback is code a manifest cannot carry, so it belongs in
 * an adapter module, or behind a disable comment that gives the reason.
 */
export const noVendorCallbacksRule = defineRule({
  create(context) {
    if (isAdapterFile(context.filename)) {
      return {};
    }
    const { sourceCode } = context;
    // Assignments to one object inside one function form one site, such as a
    // helper that wraps several callbacks of a resolved script.
    const assignmentSites = new Map<string, AssignmentSite>();

    return {
      AssignmentExpression(node) {
        const name = callbackAssignmentName(sourceCode, node);
        if (name === null || isInsideCallback(sourceCode, node)) {
          return;
        }
        if (node.left.type !== "MemberExpression") {
          return;
        }
        const key = `${enclosingFunctionStart(node)}:${sourceCode.getText(node.left.object)}`;
        const site = assignmentSites.get(key);
        if (site) {
          site.names.push(name);
        } else {
          assignmentSites.set(key, { names: [name], node });
        }
      },
      ObjectExpression(node) {
        const names: string[] = [];
        let first: ESTree.ObjectProperty | undefined;
        for (const property of node.properties) {
          if (property.type !== "Property") {
            continue;
          }
          const name = callbackPropertyName(sourceCode, property);
          if (name !== null) {
            names.push(name);
            first ??= property;
          }
        }
        if (!first || isInsideCallback(sourceCode, node)) {
          return;
        }
        context.report({
          data: { names: formatNames(names) },
          messageId: "callback",
          node: first,
        });
      },
      "Program:exit"() {
        for (const site of assignmentSites.values()) {
          context.report({
            data: { names: formatNames(site.names) },
            messageId: "callback",
            node: site.node,
          });
        }
      },
    };
  },
  meta: {
    docs: {
      description:
        "Disallow lifecycle callbacks on vendor scripts outside adapter modules; express the behaviour as manifest steps.",
    },
    messages: {
      callback:
        "{{names}} on a vendor script is code the Inth server cannot send. Express it as manifest steps, or move it to an adapter module under `adapters/`. An npm-only extra needs a disable comment with its reason.",
    },
    type: "problem",
  },
});
