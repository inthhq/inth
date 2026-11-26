import { defineRule } from "vite-plus/lint/plugins";
import type { ESTree, SourceCode } from "vite-plus/lint/plugins";

import {
  lookupProperty,
  objectEntries,
  propertyKeyName,
  resolveValue,
  stringLiteralValue,
} from "../shared/ast.ts";
import {
  idSpecPattern,
  isHostnameSpec,
  remoteOptions,
} from "../shared/remote.ts";

const SCRIPT_STEP_TYPES = new Set(["loadScript", "loadScriptStep"]);
// Same syntax as the manifest compiler's placeholders.
const PLACEHOLDER_PATTERN = /\{\{(?<name>[A-Za-z0-9_]+)\}\}/gu;
// Stands in for a template expression, which can hold any text.
const EXPRESSION_MARK = "\u0000";
const HOST_PATTERN = /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*(?::\d+)?$/u;
// `{{name}}` as the whole first label, then a literal domain of two or more
// labels, such as `{{partner}}.api.vendor.com`. No port.
const LABEL_HOST_PATTERN =
  /^\{\{(?<name>[A-Za-z0-9_]+)\}\}\.[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/u;

type SourceProblem =
  | { messageId: "notFixed" }
  | { messageId: "hostPlaceholder"; placeholder: string };

/** How the options this file passes to `defineRemote` declare a name. */
interface HostOptions {
  isHostname: (name: string) => boolean;
  isDnsLabelId: (name: string) => boolean;
}

const LETTER_OR_DIGIT = /^[A-Za-z0-9]$/u;
const CHARACTER_KINDS = [/^[a-z]$/u, /^[A-Z]$/u, /^[0-9]$/u];
const QUANTIFIER = /^(?:[?*+]|\{\d+(?:,\d*)?\})\??/u;

/** A class range whose ends are both lowercase, both uppercase or both digits. */
const isLabelRange = (from: string, to: string): boolean =>
  from <= to &&
  CHARACTER_KINDS.some((kind) => kind.test(from) && kind.test(to));

/**
 * Whether the body of `[...]` holds only letters, digits, `-` and ranges
 * within one of those kinds. A `-` that is not part of a range must be first
 * or last, so it can never be read as a range end.
 */
const isLabelClass = (body: string): boolean => {
  let index = 0;
  while (index < body.length) {
    const char = body[index] ?? "";
    const to = body[index + 2];
    if (body[index + 1] === "-" && to !== undefined) {
      if (!isLabelRange(char, to)) {
        return false;
      }
      index += 3;
      continue;
    }
    if (
      !LETTER_OR_DIGIT.test(char) &&
      !(char === "-" && (index === 0 || index === body.length - 1))
    ) {
      return false;
    }
    index += 1;
  }
  return body.length > 0;
};

/**
 * Whether an `id` pattern can only match one DNS label: letters, digits and
 * hyphens, at least one character. Reads the pattern's source and accepts a
 * small grammar it can prove: `^`, then literal letters, digits and `-`,
 * classes of those, non-capturing or plain groups and quantifiers, then `$`.
 * Anything else (`.`, escapes, `|`, lookarounds, negated classes) is refused,
 * even when it would be safe.
 */
const isDnsLabelPattern = (pattern: string): boolean => {
  if (!pattern.startsWith("^") || !pattern.endsWith("$")) {
    return false;
  }
  const body = pattern.slice(1, -1);
  let depth = 0;
  let index = 0;
  while (index < body.length) {
    const rest = body.slice(index);
    const char = rest[0] ?? "";
    if (char === "[") {
      const end = rest.indexOf("]");
      if (end === -1 || !isLabelClass(rest.slice(1, end))) {
        return false;
      }
      index += end + 1;
    } else if (rest.startsWith("(?:")) {
      depth += 1;
      index += 3;
      continue;
    } else if (char === "(" && rest[1] !== "?") {
      depth += 1;
      index += 1;
      continue;
    } else if (char === ")" && depth > 0) {
      depth -= 1;
      index += 1;
    } else if (LETTER_OR_DIGIT.test(char) || char === "-") {
      index += 1;
    } else {
      return false;
    }
    // A quantifier may follow an atom or a group.
    const quantifier = QUANTIFIER.exec(body.slice(index));
    index += quantifier?.[0].length ?? 0;
  }
  if (depth !== 0) {
    return false;
  }
  try {
    // An empty label would leave the vendor domain as the whole host.
    return !new RegExp(pattern, "u").test("");
  } catch {
    return false;
  }
};

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
  hostOptions: HostOptions
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
  const labelName = LABEL_HOST_PATTERN.exec(host)?.groups?.name;
  if (labelName !== undefined && hostOptions.isDnsLabelId(labelName)) {
    return null;
  }
  for (const match of host.matchAll(PLACEHOLDER_PATTERN)) {
    const [placeholder] = match;
    const name = match.groups?.name;
    if (name === undefined || !hostOptions.isHostname(name)) {
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

/** A string literal's value, or a template literal's when it has no expressions. */
const staticString = (node: ESTree.Node): string | null => {
  if (node.type === "TemplateLiteral") {
    return node.expressions.length === 0
      ? (node.quasis[0]?.value.cooked ?? null)
      : null;
  }
  return stringLiteralValue(node);
};

/** A `loadScript` step, a `loadScriptStep`, or any entry of an `install` list. */
const isScriptStep = (
  sourceCode: SourceCode,
  node: ESTree.ObjectExpression
): boolean => {
  // The last `type` the rule can see, so a spread it cannot follow after the
  // type does not hide the step.
  const typeEntry = objectEntries(sourceCode, node).entries.get("type");
  // Read the type the way `src` is read, through a `const`, so a step cannot
  // hide by naming its type indirectly.
  const type = typeEntry
    ? staticString(resolveValue(sourceCode, typeEntry.value))
    : null;
  return (
    (type !== null && SCRIPT_STEP_TYPES.has(type)) || isInstallList(node.parent)
  );
};

/**
 * The script a manifest loads decides whose code runs on the site. Keeping the
 * host literal in the vendor file means no option, and so no dashboard value,
 * can point it somewhere else. Two exceptions: a customer-run tracker domain,
 * through a validated `hostname` option, and a customer's own label under a
 * fixed vendor domain (`{{partner}}.api.vendor.com`), through an `id` option
 * whose pattern allows one DNS label only.
 */
export const fixedScriptHostRule = defineRule({
  create(context) {
    const { sourceCode } = context;
    const steps = new Set<ESTree.ObjectExpression>();
    const remoteOptionObjects: ESTree.ObjectExpression[] = [];

    // Only a declaration in the options passed to `defineRemote` reaches the
    // dashboard form and its validation, so only that one counts.
    const declares = (
      name: string,
      test: (value: ESTree.Expression) => boolean
    ): boolean =>
      remoteOptionObjects.some((options) => {
        const option = lookupProperty(sourceCode, options, name);
        return option.status === "found" && test(option.value);
      });
    const hostOptions: HostOptions = {
      isDnsLabelId: (name) =>
        declares(name, (value) => {
          const pattern = idSpecPattern(sourceCode, value);
          return pattern !== null && isDnsLabelPattern(pattern);
        }),
      isHostname: (name) =>
        declares(name, (value) => isHostnameSpec(sourceCode, value)),
    };

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
        hostOptions
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
        "`{{placeholder}}` sets the script host. Write the host literally, declare this name as an option of kind `hostname` in the options this file passes to `defineRemote`, or make it the whole first label of a literal vendor domain of two or more labels and declare it there as kind `id` with an anchored pattern of letters, digits and hyphens only.",
      notFixed:
        "A manifest script `src` must be a string that starts with `https://` and a literal host, so no option can change which host's code runs.",
      unresolved:
        "This rule cannot see whether this sets the script `src`. Spread only `const` object literals from this file into a script step, and use plain property names.",
    },
    type: "problem",
  },
});
