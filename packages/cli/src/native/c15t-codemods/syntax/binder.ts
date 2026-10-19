// Resolves identifiers to the declarations they name within one file. The
// codemods ask ts-morph for symbols to tell an import apart from a local of
// the same name and to follow a variable to its initializer. Declarations in
// other files and in the standard library are out of reach: a name that
// resolves to neither a local nor an import has no symbol.

import type { Node } from "./node.ts";
import { SyntaxSymbol } from "./node.ts";

const Meaning = {
  Type: 2,
  Value: 1,
} as const;

class Scope {
  parent: Scope | undefined;
  // Function scopes hold `var` and function declarations.
  functionScope: boolean;
  symbols = new Map<string, SyntaxSymbol>();
  meanings = new Map<SyntaxSymbol, number>();

  constructor(parent: Scope | undefined, functionScope: boolean) {
    this.parent = parent;
    this.functionScope = functionScope;
  }

  declare(name: Node, declaration: Node, meaning: number, alias: boolean): void {
    if (name.kind !== "Identifier") {
      return;
    }
    let symbol = this.symbols.get(name.value);
    if (!symbol) {
      symbol = new SyntaxSymbol(name.value);
      this.symbols.set(name.value, symbol);
    }
    symbol.declarations.push(declaration);
    symbol.references.push(name);
    symbol.alias ||= alias;
    this.meanings.set(symbol, (this.meanings.get(symbol) ?? 0) | meaning);
    name.symbol = symbol;
  }

  resolve(name: string, meaning: number): SyntaxSymbol | undefined {
    let scope: Scope | undefined = this;
    while (scope) {
      const symbol = scope.symbols.get(name);
      if (symbol && ((scope.meanings.get(symbol) ?? 0) & meaning) !== 0) {
        return symbol;
      }
      scope = scope.parent;
    }
    return undefined;
  }

  functionLike(): Scope {
    let scope: Scope = this;
    while (!scope.functionScope && scope.parent) {
      scope = scope.parent;
    }
    return scope;
  }
}

const FUNCTION_SCOPES = new Set([
  "ArrowFunction",
  "Constructor",
  "FunctionDeclaration",
  "FunctionExpression",
  "GetAccessor",
  "MethodDeclaration",
  "ModuleBlock",
  "SetAccessor",
  "SourceFile",
]);

// Nodes that open a block scope for `let`, `const`, classes or type
// parameters.
const BLOCK_SCOPES = new Set([
  "Block",
  "CallSignature",
  "CaseBlock",
  "CatchClause",
  "ClassDeclaration",
  "ClassExpression",
  "ConditionalType",
  "ConstructSignature",
  "ConstructorType",
  "ForInStatement",
  "ForOfStatement",
  "ForStatement",
  "FunctionType",
  "InterfaceDeclaration",
  "MappedType",
  "MethodSignature",
  "TypeAliasDeclaration",
]);

/** Names in a binding pattern, with the node TypeScript records for each. */
const bindingNames = (
  name: Node | undefined,
  declaration: Node,
  found: { name: Node; declaration: Node }[]
): void => {
  if (!name) {
    return;
  }
  if (name.kind === "Identifier") {
    found.push({ declaration, name });
    return;
  }
  for (const element of name.list("elements")) {
    if (element.kind === "BindingElement") {
      bindingNames(element.field("name"), element, found);
    }
  }
};

// Identifiers that name a property or label rather than a binding.
const isPropertyName = (node: Node, parent: Node): boolean => {
  switch (parent.kind) {
    case "PropertyAccessExpression":
    case "QualifiedName":
    case "JsxAttribute":
    case "PropertyAssignment":
    case "PropertyDeclaration":
    case "PropertySignature":
    case "MethodDeclaration":
    case "MethodSignature":
    case "GetAccessor":
    case "SetAccessor":
    case "EnumMember":
    case "MetaProperty":
    case "NamedTupleMember":
    case "ImportAttribute": {
      return (
        parent.field("name") === node ||
        parent.field("right") === node
      );
    }
    case "BindingElement":
    case "ImportSpecifier": {
      return parent.field("propertyName") === node;
    }
    case "ExportSpecifier": {
      const declaration = parent.getFirstAncestorByKind("ExportDeclaration");
      if (declaration?.field("moduleSpecifier")) {
        return true;
      }
      return (
        parent.field("propertyName") !== undefined &&
        parent.field("name") === node
      );
    }
    case "LabeledStatement":
    case "BreakStatement":
    case "ContinueStatement": {
      return parent.field("label") === node;
    }
    case "ImportType": {
      return true;
    }
    case "NamespaceExport":
    case "NamespaceExportDeclaration": {
      return true;
    }
    default: {
      return false;
    }
  }
};

// Whether an identifier is read as a type: a type reference, or the left
// side of a qualified type name.
const isTypePosition = (node: Node): boolean => {
  let current = node;
  let parent = node.parent;
  while (parent?.kind === "QualifiedName" && parent.field("left") === current) {
    current = parent;
    parent = parent.parent;
  }
  if (!parent) {
    return false;
  }
  if (parent.kind === "TypeReference") {
    return parent.field("typeName") === current;
  }
  if (parent.kind === "ExpressionWithTypeArguments") {
    const clause = parent.parent;
    return (
      clause?.kind === "HeritageClause" &&
      (clause.value === "implements" ||
        clause.parent?.kind === "InterfaceDeclaration")
    );
  }
  return false;
};

const isIntrinsicJsxTag = (node: Node, parent: Node): boolean =>
  (parent.kind === "JsxOpeningElement" ||
    parent.kind === "JsxSelfClosingElement" ||
    parent.kind === "JsxClosingElement") &&
  parent.field("tagName") === node &&
  /^[a-z]/u.test(node.value);

interface Reference {
  name: Node;
  scope: Scope;
}

class Binder {
  references: Reference[] = [];
  // Shorthand properties, which read the value of the name they hold.
  shorthands: { node: Node; scope: Scope }[] = [];
  declarationNames = new Set<Node>();

  declareIn(
    scope: Scope,
    name: Node | undefined,
    declaration: Node,
    meaning: number,
    alias = false
  ): void {
    const names: { name: Node; declaration: Node }[] = [];
    bindingNames(name, declaration, names);
    for (const entry of names) {
      this.declarationNames.add(entry.name);
      scope.declare(entry.name, entry.declaration, meaning, alias);
    }
  }

  // Declarations a node makes in the scopes around it.
  declare(node: Node, scope: Scope, inner: Scope): void {
    const name = node.field("name");
    switch (node.kind) {
      case "VariableDeclaration": {
        // Catch clause variables are block scoped too.
        const list = node.parent;
        const blockScoped =
          list?.kind !== "VariableDeclarationList" || list.value !== "var";
        this.declareIn(
          blockScoped ? scope : scope.functionLike(),
          name,
          node,
          Meaning.Value
        );
        break;
      }
      case "Parameter": {
        this.declareIn(scope, name, node, Meaning.Value);
        break;
      }
      case "FunctionDeclaration": {
        this.declareIn(scope.functionLike(), name, node, Meaning.Value);
        break;
      }
      case "FunctionExpression":
      case "ClassExpression": {
        this.declareIn(inner, name, node, Meaning.Value | Meaning.Type);
        break;
      }
      case "ClassDeclaration":
      case "EnumDeclaration": {
        this.declareIn(scope, name, node, Meaning.Value | Meaning.Type);
        break;
      }
      case "ModuleDeclaration": {
        this.declareIn(scope, name, node, Meaning.Value | Meaning.Type);
        break;
      }
      case "InterfaceDeclaration":
      case "TypeAliasDeclaration": {
        this.declareIn(scope, name, node, Meaning.Type);
        break;
      }
      case "TypeParameter": {
        this.declareIn(scope, name, node, Meaning.Type);
        break;
      }
      case "ImportClause":
      case "NamespaceImport":
      case "ImportSpecifier":
      case "ImportEqualsDeclaration": {
        this.declareIn(
          scope,
          name,
          node,
          Meaning.Value | Meaning.Type,
          true
        );
        break;
      }
      default: {
        break;
      }
    }
  }

  visit(node: Node, scope: Scope): void {
    let inner = scope;
    if (FUNCTION_SCOPES.has(node.kind)) {
      inner = node.kind === "SourceFile" ? scope : new Scope(scope, true);
    } else if (BLOCK_SCOPES.has(node.kind)) {
      inner = new Scope(scope, false);
    }
    this.declare(node, scope, inner);

    if (node.kind === "ShorthandPropertyAssignment") {
      const name = node.field("name");
      if (name) {
        // The name declares the property; its value is the binding it names.
        const property = new SyntaxSymbol(name.value);
        property.declarations.push(node);
        property.references.push(name);
        name.symbol = property;
        node.symbol = property;
        this.declarationNames.add(name);
        this.shorthands.push({ node, scope });
      }
    }

    if (node.kind === "Identifier" && node.parent) {
      if (
        !this.declarationNames.has(node) &&
        !isPropertyName(node, node.parent) &&
        !isIntrinsicJsxTag(node, node.parent)
      ) {
        this.references.push({ name: node, scope });
      }
    }

    for (const child of node.children) {
      this.visit(child, inner);
    }
    for (const jsDoc of node.jsDocs) {
      this.visit(jsDoc, scope);
    }
  }

  resolveAll(): void {
    for (const { name, scope } of this.references) {
      const meaning = isTypePosition(name) ? Meaning.Type : Meaning.Value;
      const symbol = scope.resolve(name.value, meaning);
      if (symbol) {
        name.symbol = symbol;
        symbol.references.push(name);
      }
    }
    for (const { node, scope } of this.shorthands) {
      const name = node.field("name");
      const symbol = name && scope.resolve(name.value, Meaning.Value);
      if (name && symbol) {
        node.valueSymbol = symbol;
        symbol.references.push(name);
      }
    }
  }
}

/** Resolve the identifiers in a source file to their declarations. */
export const bindSourceFile = (root: Node): void => {
  const binder = new Binder();
  binder.visit(root, new Scope(undefined, true));
  binder.resolveAll();
};

