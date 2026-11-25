import { defineRule } from "vite-plus/lint/plugins";
import type { ESTree, SourceCode } from "vite-plus/lint/plugins";

import {
  findProperty,
  propertyKeyName,
  resolveValue,
  stringLiteralValue,
  stringPropertyValue,
  unwrapExpression,
} from "../shared/ast.ts";

const SCRIPT_STEP_TYPES = new Set(["loadScript", "loadScriptStep"]);
// Same syntax as the manifest compiler's placeholders.
const PLACEHOLDER_PATTERN = /\{\{(?<name>[A-Za-z0-9_]+)\}\}/gu;
// Stands in for a template expression, which can hold any text.
const EXPRESSION_MARK = "\u0000";
const HOST_PATTERN = /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*(?::\d+)?$/u;

type SourceProblem =
  | { messageId: "notFixed" }
  | { messageId: "hostPlaceholder"; placeholder: string };

/** Text of a string or template literal, with each expression marked. */
const literalText = (
  sourceCode: SourceCode,
  expression: ESTree.Expression
): string | null => {
  const value = resolveValue(sourceCode, expression);
  if (value.type === "TemplateLiteral") {
    return value.quasis
      .map((quasi) => quasi.value.cooked ?? quasi.value.raw)
      .join(EXPRESSION_MARK);
  }
  return stringLiteralValue(value);
};

const checkSource = (
  text: string | null,
  hostnameOptions: ReadonlySet<string>
): SourceProblem | null => {
  if (text === null || !text.startsWith("https://")) {
    return { messageId: "notFixed" };
  }
  const rest = text.slice("https://".length);
  const hostEnd = rest.search(/[/?#]/u);
  const host = hostEnd === -1 ? rest : rest.slice(0, hostEnd);
  if (host.includes(EXPRESSION_MARK)) {
    return { messageId: "notFixed" };
  }
  for (const match of host.matchAll(PLACEHOLDER_PATTERN)) {
    const [placeholder] = match;
    const name = match.groups?.name;
    if (name === undefined || !hostnameOptions.has(name)) {
      return { messageId: "hostPlaceholder", placeholder };
    }
  }
  const literalHost = host.replaceAll(PLACEHOLDER_PATTERN, "host");
  return HOST_PATTERN.test(literalHost) ? null : { messageId: "notFixed" };
};

/** A `loadScript` step, a `loadScriptStep`, or any entry of an `install` list. */
const isScriptStep = (node: ESTree.ObjectExpression): boolean => {
  const type = stringPropertyValue(node, "type");
  if (type !== null && SCRIPT_STEP_TYPES.has(type)) {
    return true;
  }
  const list = node.parent;
  const owner = list?.parent;
  return (
    list?.type === "ArrayExpression" &&
    owner?.type === "Property" &&
    owner.value === list &&
    propertyKeyName(owner) === "install"
  );
};

/** The option name when a property declares `{ kind: 'hostname' }`. */
const hostnameOptionName = (property: ESTree.ObjectProperty): string | null => {
  const value = unwrapExpression(property.value);
  if (value.type !== "ObjectExpression") {
    return null;
  }
  return stringPropertyValue(value, "kind") === "hostname"
    ? propertyKeyName(property)
    : null;
};

/**
 * The script a manifest loads decides whose code runs on the site. Keeping the
 * host literal in the vendor file means no option, and so no dashboard value,
 * can point it somewhere else. A customer-run tracker domain is the one
 * exception, through a validated `hostname` option.
 */
export const fixedScriptHostRule = defineRule({
  create(context) {
    const { sourceCode } = context;
    const hostnameOptions = new Set<string>();
    const sources: ESTree.ObjectProperty[] = [];

    return {
      ObjectExpression(node) {
        if (!isScriptStep(node)) {
          return;
        }
        const src = findProperty(node, "src");
        if (src) {
          sources.push(src);
        }
      },
      "Program:exit"() {
        for (const src of sources) {
          const problem = checkSource(
            literalText(sourceCode, src.value),
            hostnameOptions
          );
          if (problem?.messageId === "hostPlaceholder") {
            context.report({
              data: { placeholder: problem.placeholder },
              messageId: "hostPlaceholder",
              node: src.value,
            });
          } else if (problem) {
            context.report({ messageId: "notFixed", node: src.value });
          }
        }
      },
      Property(node) {
        const name = hostnameOptionName(node);
        if (name !== null) {
          hostnameOptions.add(name);
        }
      },
    };
  },
  meta: {
    docs: {
      description:
        "Require every manifest script `src` to start with `https://` and a literal host.",
    },
    messages: {
      hostPlaceholder:
        "`{{placeholder}}` sets the script host. Write the host literally, or declare this name in the same file as a remote option of kind `hostname`.",
      notFixed:
        "A manifest script `src` must be a string that starts with `https://` and a literal host, so no option can change which host's code runs.",
    },
    type: "problem",
  },
});
