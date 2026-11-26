import { defineRule } from "vite-plus/lint/plugins";
import type { ESTree, SourceCode } from "vite-plus/lint/plugins";

import {
  lookupProperty,
  objectEntries,
  propertyKeyName,
  resolveValue,
  stringLiteralValue,
  unwrapExpression,
} from "../shared/ast.ts";
import { isHostnameSpec, remoteOptions } from "../shared/remote.ts";

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
  isHostnameOption: (name: string) => boolean
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
    if (name === undefined || !isHostnameOption(name)) {
      return { messageId: "hostPlaceholder", placeholder };
    }
  }
  const literalHost = host.replaceAll(PLACEHOLDER_PATTERN, "host");
  return HOST_PATTERN.test(literalHost) ? null : { messageId: "notFixed" };
};

const isInstallList = (node: ESTree.Node | undefined): boolean => {
  const owner = node?.parent;
  return (
    node?.type === "ArrayExpression" &&
    owner?.type === "Property" &&
    owner.value === node &&
    propertyKeyName(owner) === "install"
  );
};

/** A `loadScript` step, a `loadScriptStep`, or any entry of an `install` list. */
const isScriptStep = (
  sourceCode: SourceCode,
  node: ESTree.ObjectExpression
): boolean => {
  // The last `type` the rule can see, so a spread it cannot follow after the
  // type does not hide the step.
  const typeEntry = objectEntries(sourceCode, node).entries.get("type");
  const type = typeEntry
    ? stringLiteralValue(unwrapExpression(typeEntry.value))
    : null;
  return (
    (type !== null && SCRIPT_STEP_TYPES.has(type)) || isInstallList(node.parent)
  );
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
    const steps = new Set<ESTree.ObjectExpression>();
    const remoteOptionObjects: ESTree.ObjectExpression[] = [];

    // Only a declaration in the options passed to `defineRemote` reaches the
    // dashboard form, so only that one makes a host placeholder a hostname.
    const isHostnameOption = (name: string): boolean =>
      remoteOptionObjects.some((options) => {
        const option = lookupProperty(sourceCode, options, name);
        return (
          option.status === "found" && isHostnameSpec(sourceCode, option.value)
        );
      });

    const checkStep = (step: ESTree.ObjectExpression): void => {
      const src = lookupProperty(sourceCode, step, "src");
      if (src.status === "missing") {
        return;
      }
      if (src.status === "unknown") {
        context.report({ messageId: "unresolved", node: src.via });
        return;
      }
      // A src that came through a spread is reported at the spread.
      const node = src.via.type === "Property" ? src.value : src.via;
      const problem = checkSource(
        literalText(sourceCode, src.value),
        isHostnameOption
      );
      if (problem?.messageId === "hostPlaceholder") {
        context.report({
          data: { placeholder: problem.placeholder },
          messageId: "hostPlaceholder",
          node,
        });
      } else if (problem) {
        context.report({ messageId: "notFixed", node });
      }
    };

    return {
      ArrayExpression(node) {
        if (!isInstallList(node)) {
          return;
        }
        // Entries written inline are visited as object literals.
        for (const element of node.elements) {
          if (
            element === null ||
            element.type === "SpreadElement" ||
            element.type === "ObjectExpression"
          ) {
            continue;
          }
          const value = resolveValue(sourceCode, element);
          if (value.type === "ObjectExpression") {
            steps.add(value);
          }
        }
      },
      CallExpression(node) {
        const options = remoteOptions(sourceCode, node);
        if (options?.status === "object") {
          remoteOptionObjects.push(options.object);
        }
      },
      ObjectExpression(node) {
        if (isScriptStep(sourceCode, node)) {
          steps.add(node);
        }
      },
      "Program:exit"() {
        for (const step of steps) {
          checkStep(step);
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
        "`{{placeholder}}` sets the script host. Write the host literally, or declare this name as an option of kind `hostname` in the options this file passes to `defineRemote`.",
      notFixed:
        "A manifest script `src` must be a string that starts with `https://` and a literal host, so no option can change which host's code runs.",
      unresolved:
        "This rule cannot see whether this sets the script `src`. Spread only `const` object literals from this file into a script step, and use plain property names.",
    },
    type: "problem",
  },
});
