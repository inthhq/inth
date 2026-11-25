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

/** A property of an object literal by static name. */
export const findProperty = (
  object: ESTree.ObjectExpression,
  name: string
): ESTree.ObjectProperty | undefined =>
  object.properties.find(
    (property): property is ESTree.ObjectProperty =>
      property.type === "Property" && propertyKeyName(property) === name
  );

/** The string a property holds when it is a plain string literal. */
export const stringPropertyValue = (
  object: ESTree.ObjectExpression,
  name: string
): string | null => {
  const property = findProperty(object, name);
  return property ? stringLiteralValue(unwrapExpression(property.value)) : null;
};
