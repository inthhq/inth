import { defineRule } from "vite-plus/lint/plugins";
import type { ESTree } from "vite-plus/lint/plugins";

import {
  propertyKeyName,
  resolveValue,
  stringPropertyValue,
} from "../shared/ast.ts";

const DEFINE_REMOTE_NAMES = new Set([
  "defineRemote",
  "defineRemoteIntegration",
]);
const URL_NAME_PATTERN = /url|src|endpoint|apihost|host/iu;

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

/**
 * A remote option is a value someone types into the dashboard. An option that
 * takes a URL lets that value choose whose code runs on the site, so remote
 * entries build URLs from fixed vendor hosts and validated IDs instead. A
 * customer-run tracker domain uses kind `hostname`, which accepts a DNS name
 * only.
 */
export const noUrlOptionsRule = defineRule({
  create(context) {
    const { sourceCode } = context;
    return {
      CallExpression(node) {
        const name = calleeName(node.callee);
        const [, optionsArgument] = node.arguments;
        if (
          name === null ||
          !DEFINE_REMOTE_NAMES.has(name) ||
          !optionsArgument ||
          optionsArgument.type === "SpreadElement"
        ) {
          return;
        }
        const options = resolveValue(sourceCode, optionsArgument);
        if (options.type !== "ObjectExpression") {
          return;
        }
        for (const property of options.properties) {
          if (property.type !== "Property") {
            continue;
          }
          const optionName = propertyKeyName(property);
          if (optionName === null || !URL_NAME_PATTERN.test(optionName)) {
            continue;
          }
          const spec = resolveValue(sourceCode, property.value);
          const kind =
            spec.type === "ObjectExpression"
              ? stringPropertyValue(spec, "kind")
              : null;
          if (kind !== "hostname") {
            context.report({
              data: { name: optionName },
              messageId: "urlOption",
              node: property.key,
            });
          }
        }
      },
    };
  },
  meta: {
    docs: {
      description:
        "Disallow remote options named like a URL, source, endpoint or host, except kind `hostname`.",
    },
    messages: {
      urlOption:
        "Remote option `{{name}}` reads like a URL, source, endpoint or host. Build the URL from a fixed vendor host and validated IDs, or use kind `hostname` for a tracker on the customer's own domain.",
    },
    type: "problem",
  },
});
