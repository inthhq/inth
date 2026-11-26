import type { ESTree, Scope, SourceCode } from "vite-plus/lint/plugins";

type Expression = ESTree.Expression;

/** Strip `as`, `satisfies`, `!` and parentheses, which do not change the value. */
export const unwrapExpression = (expression: Expression): Expression => {
  let current = expression;
  while (
    current.type === "TSAsExpression" ||
    current.type === "TSSatisfiesExpression" ||
    current.type === "TSTypeAssertion" ||
    current.type === "TSNonNullExpression" ||
    current.type === "ParenthesizedExpression"
  ) {
    current = current.expression;
  }
  return current;
};

/** The value of a string literal node, or null for any other node. */
export const stringLiteralValue = (node: ESTree.Node): string | null => {
  if (node.type !== "Literal") {
    return null;
  }
  const { value } = node;
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- ESTree gives every literal the type `Literal`; only the value's type tells a string apart.
  return typeof value === "string" ? value : null;
};

/** The static name of a property key: `a`, `'a'` or `['a']`. */
export const propertyKeyName = (
  property: ESTree.ObjectProperty
): string | null => {
  const { key } = property;
  if (!property.computed && key.type === "Identifier") {
    return key.name;
  }
  return stringLiteralValue(key);
};

/** The static name of a member: `a.b`, `a['b']`. */
export const memberPropertyName = (
  member: ESTree.MemberExpression
): string | null => {
  const { property } = member;
  if (!member.computed && property.type === "Identifier") {
    return property.name;
  }
  return stringLiteralValue(property);
};

/** The value of a `const` an identifier refers to in this file, or null. */
export const resolveConstInit = (
  sourceCode: SourceCode,
  identifier: ESTree.IdentifierReference
): Expression | null => {
  let scope: Scope | null = sourceCode.getScope(identifier);
  while (scope !== null) {
    const variable = scope.set.get(identifier.name);
    if (variable !== undefined) {
      const [definition] = variable.defs;
      if (
        variable.defs.length !== 1 ||
        definition?.node.type !== "VariableDeclarator" ||
        definition.parent?.type !== "VariableDeclaration" ||
        definition.parent.kind !== "const" ||
        !definition.node.init
      ) {
        return null;
      }
      return unwrapExpression(definition.node.init);
    }
    scope = scope.upper;
  }
  return null;
};

/** Follow an identifier to its `const` value; other expressions are returned unwrapped. */
export const resolveValue = (
  sourceCode: SourceCode,
  expression: Expression
): Expression => {
  const value = unwrapExpression(expression);
  if (value.type !== "Identifier") {
    return value;
  }
  return resolveConstInit(sourceCode, value) ?? value;
};

/**
 * Where an object literal's effective value for a name comes from, with
 * spreads of local object literals followed. `via` is the property, or the
 * outermost spread the value came through, so a report lands in this object.
 */
export type PropertyLookup =
  | { status: "found"; value: Expression; via: ESTree.Node }
  | { status: "missing" }
  | { status: "unknown"; via: ESTree.Node };

/** The object literal a spread copies, when it is one in this file. */
const spreadObject = (
  sourceCode: SourceCode,
  spread: ESTree.SpreadElement
): ESTree.ObjectExpression | null => {
  const value = resolveValue(sourceCode, spread.argument);
  return value.type === "ObjectExpression" ? value : null;
};

/**
 * The effective value of `name` in an object literal: the last property that
 * sets it wins. A spread the rule cannot follow, or a computed key it cannot
 * name, may set any name, so it makes the result unknown.
 */
export const lookupProperty = (
  sourceCode: SourceCode,
  object: ESTree.ObjectExpression,
  name: string,
  seen: ReadonlySet<ESTree.ObjectExpression> = new Set()
): PropertyLookup => {
  const path = new Set(seen).add(object);
  for (let index = object.properties.length - 1; index >= 0; index -= 1) {
    const property = object.properties[index];
    if (property === undefined) {
      continue;
    }
    if (property.type === "Property") {
      const key = propertyKeyName(property);
      if (key === null) {
        return { status: "unknown", via: property };
      }
      if (key === name) {
        return { status: "found", value: property.value, via: property };
      }
      continue;
    }
    const inner = spreadObject(sourceCode, property);
    if (inner === null || path.has(inner)) {
      return { status: "unknown", via: property };
    }
    const result = lookupProperty(sourceCode, inner, name, path);
    if (result.status === "found") {
      return { ...result, via: property };
    }
    if (result.status === "unknown") {
      return { status: "unknown", via: property };
    }
  }
  return { status: "missing" };
};

/** The string a name effectively holds when it is a plain string literal. */
export const effectiveStringValue = (
  sourceCode: SourceCode,
  object: ESTree.ObjectExpression,
  name: string
): string | null => {
  const result = lookupProperty(sourceCode, object, name);
  return result.status === "found"
    ? stringLiteralValue(unwrapExpression(result.value))
    : null;
};

export interface ObjectEntries {
  /** Each name the object sets, with its effective value. */
  entries: Map<string, { value: Expression; via: ESTree.Node }>;
  /** Spreads and computed keys the rule cannot follow. */
  unknown: ESTree.Node[];
}

/** Every name an object literal sets, with spreads of local literals followed. */
export const objectEntries = (
  sourceCode: SourceCode,
  object: ESTree.ObjectExpression,
  seen: ReadonlySet<ESTree.ObjectExpression> = new Set()
): ObjectEntries => {
  const path = new Set(seen).add(object);
  const result: ObjectEntries = { entries: new Map(), unknown: [] };
  for (const property of object.properties) {
    if (property.type === "Property") {
      const key = propertyKeyName(property);
      if (key === null) {
        result.unknown.push(property);
      } else {
        result.entries.set(key, { value: property.value, via: property });
      }
      continue;
    }
    const inner = spreadObject(sourceCode, property);
    if (inner === null || path.has(inner)) {
      result.unknown.push(property);
      continue;
    }
    const nested = objectEntries(sourceCode, inner, path);
    for (const [key, entry] of nested.entries) {
      result.entries.set(key, { value: entry.value, via: property });
    }
    if (nested.unknown.length > 0) {
      result.unknown.push(property);
    }
  }
  return result;
};
