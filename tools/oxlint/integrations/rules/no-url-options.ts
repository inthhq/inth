import { defineRule } from "vite-plus/lint/plugins";

import { objectEntries } from "../shared/ast.ts";
import { isHostnameSpec, remoteOptions } from "../shared/remote.ts";

// `(?<!re)` keeps names such as `resourceKey` out.
const URL_NAME_PATTERN = /url|src|(?<!re)source|endpoint|host/iu;

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
        const options = remoteOptions(sourceCode, node);
        if (options === null) {
          return;
        }
        if (options.status === "unknown") {
          context.report({ messageId: "unresolved", node: options.node });
          return;
        }
        const { entries, unknown } = objectEntries(sourceCode, options.object);
        for (const via of unknown) {
          context.report({ messageId: "unresolved", node: via });
        }
        for (const [name, entry] of entries) {
          if (
            URL_NAME_PATTERN.test(name) &&
            !isHostnameSpec(sourceCode, entry.value)
          ) {
            context.report({
              data: { name },
              messageId: "urlOption",
              node: entry.via.type === "Property" ? entry.via.key : entry.via,
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
      unresolved:
        "This rule cannot see which remote options this adds. Write the options as an object literal in this file, or spread a `const` object literal from this file.",
      urlOption:
        "Remote option `{{name}}` reads like a URL, source, endpoint or host. Build the URL from a fixed vendor host and validated IDs, or use kind `hostname` for a tracker on the customer's own domain.",
    },
    type: "problem",
  },
});
