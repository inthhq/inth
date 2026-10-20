import { Node, SyntaxKind } from "./syntax/index.ts";
import type * as Syntax from "./syntax/index.ts";

/** Prefix of every comment a v3 codemod leaves for manual work. */
export const TODO_MARKER = "TODO(c15t v3):";

/** A replacement of `[start, end)` in a file's full text. */
export interface TextEdit {
  start: number;
  end: number;
  text: string;
}

/** Result shape every source transform returns to `runTransform`. */
export interface TransformResult {
  changed: boolean;
  operations: number;
  summaries: string[];
}

export const UNCHANGED: TransformResult = {
  changed: false,
  operations: 0,
  summaries: [],
};

export const toTextEdit = function toTextEdit(
  node: Syntax.Node,
  text: string
): TextEdit {
  return { end: node.getEnd(), start: node.getStart(), text };
};

/** The whitespace that starts the node's line, exactly as written. */
export const lineIndent = function lineIndent(node: Syntax.Node): string {
  const text = node.getSourceFile().getFullText();
  const lineStart = text.lastIndexOf("\n", node.getStart() - 1) + 1;
  return /^[\t ]*/u.exec(text.slice(lineStart))?.[0] ?? "";
};

/** Whether only whitespace precedes the node on its line. */
const startsLine = function startsLine(node: Syntax.Node): boolean {
  const text = node.getSourceFile().getFullText();
  const lineStart = text.lastIndexOf("\n", node.getStart() - 1) + 1;
  return text.slice(lineStart, node.getStart()).trim() === "";
};

/** Applies non-overlapping edits from the end of the file backwards. */
export const applyEdits = function applyEdits(
  sourceFile: Syntax.SourceFile,
  edits: TextEdit[]
): void {
  let text = sourceFile.getFullText();
  // At one position, replace before inserting, and keep insertions in
  // the order they were queued in.
  const ordered = edits
    .map((edit, index) => ({ edit, index }))
    .toSorted(
      (left, right) =>
        right.edit.start - left.edit.start ||
        right.edit.end - left.edit.end ||
        right.index - left.index
    );
  // Edits apply against the original offsets, so an overlap would delete
  // the wrong text. Drop exact duplicates and fail the file on any other
  // overlap instead of corrupting it.
  const applied: typeof ordered = [];
  for (const entry of ordered) {
    const previous = applied.at(-1)?.edit;
    const { edit } = entry;
    if (
      previous &&
      previous.start === edit.start &&
      previous.end === edit.end &&
      previous.text === edit.text &&
      edit.start < edit.end
    ) {
      continue;
    }
    if (previous && previous.start < edit.end) {
      throw new Error(
        `Codemod produced overlapping edits at offsets ${edit.start}-${edit.end} and ${previous.start}-${previous.end}.`
      );
    }
    applied.push(entry);
  }
  for (const { edit } of applied) {
    text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  }
  sourceFile.replaceWithText(text);
};

/**
 * Whether `comment` already sits on the node's line before it, or in the
 * block of comment lines directly above it.
 */
const hasCommentAbove = function hasCommentAbove(
  node: Syntax.Node,
  comment: string
): boolean {
  const text = node.getSourceFile().getFullText();
  let lineStart = text.lastIndexOf("\n", node.getStart() - 1) + 1;
  if (text.slice(lineStart, node.getStart()).includes(comment)) {
    return true;
  }
  while (lineStart > 0) {
    const previousStart = text.lastIndexOf("\n", lineStart - 2) + 1;
    const line = text.slice(previousStart, lineStart).trim();
    if (!(line.startsWith("//") || line.startsWith("/*"))) {
      return false;
    }
    if (line.includes(comment)) {
      return true;
    }
    lineStart = previousStart;
  }
  return false;
};

/**
 * Queues a `TODO(c15t v3)` comment above `node`, or inline before it when
 * the node shares its line. Returns false when the same comment is already
 * there, so a second run adds nothing.
 */
export const addTodo = function addTodo(
  node: Syntax.Node,
  message: string,
  edits: TextEdit[]
): boolean {
  const comment = `${TODO_MARKER} ${message}`;
  if (
    hasCommentAbove(node, comment) ||
    edits.some(
      (edit) => edit.start === node.getStart() && edit.text.includes(comment)
    )
  ) {
    return false;
  }
  const text = startsLine(node)
    ? `// ${comment}\n${lineIndent(node)}`
    : `/* ${comment} */ `;
  edits.push({ end: node.getStart(), start: node.getStart(), text });
  return true;
};

export interface ImportedBinding {
  isReference: (node: Syntax.Node) => boolean;
}

/**
 * The local binding an import specifier creates. `isReference` is true only
 * for identifiers that resolve to that binding, so a parameter or local
 * function with the same name is not treated as the import.
 */
export const importedBinding = function importedBinding(
  namedImport: Syntax.ImportSpecifier
): ImportedBinding {
  const symbol = (
    namedImport.getAliasNode() ?? namedImport.getNameNode()
  ).getSymbol()?.compilerSymbol;
  return {
    isReference: (node) =>
      symbol !== undefined &&
      Node.isIdentifier(node) &&
      node.getSymbol()?.compilerSymbol === symbol,
  };
};

/** Identifiers in this file, outside imports, that refer to the import. */
export const referencesOf = function referencesOf(
  namedImport: Syntax.ImportSpecifier
): Syntax.Identifier[] {
  const binding = importedBinding(namedImport);
  return namedImport
    .getSourceFile()
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .filter(
      (identifier) =>
        !identifier.getFirstAncestorByKind(SyntaxKind.ImportDeclaration) &&
        binding.isReference(identifier)
    );
};

/** The declarations an identifier resolves to in its own file. */
export const localDeclarationsOf = function localDeclarationsOf(
  identifier: Syntax.Identifier
): Syntax.Node[] {
  const sourceFile = identifier.getSourceFile();
  return (identifier.getSymbol()?.getDeclarations() ?? []).filter(
    (declaration) => declaration.getSourceFile() === sourceFile
  );
};

/** The module an import declaration that holds `node` loads. */
export const importedModuleOf = function importedModuleOf(
  node: Syntax.Node
): string | undefined {
  return node
    .getFirstAncestorByKind(SyntaxKind.ImportDeclaration)
    ?.getModuleSpecifierValue();
};

/** Whether a declaration is `import { name } from` one of `modules`. */
const isNamedImportFrom = function isNamedImportFrom(
  declaration: Syntax.Node,
  name: string,
  modules: readonly string[]
): boolean {
  if (!Node.isImportSpecifier(declaration) || declaration.getName() !== name) {
    return false;
  }
  const moduleName = importedModuleOf(declaration);
  return moduleName !== undefined && modules.includes(moduleName);
};

/**
 * The name a binding has where it comes from, so an alias resolves to what
 * it stands for:
 *
 * - an identifier nothing in the file declares is a global, named by its text;
 * - `test` in `import { vi as test } from 'vitest'` is `vi`;
 * - `V.vi` after `import * as V from 'vitest'` is `vi`, as is `V.vi` after
 *   a default import, `import V from 'vitest'`.
 *
 * An import counts only from a module `modulesOf` lists for its name. Any
 * other local binding, such as a parameter that shadows a global, has none.
 *
 * @param node - An identifier, or a property access on a namespace or
 * default import.
 * @param modulesOf - For each exported name, the modules that export it.
 * @returns The global or imported name, or `undefined`.
 */
export const sourceNameOf = function sourceNameOf(
  node: Syntax.Node,
  modulesOf: ReadonlyMap<string, readonly string[]>
): string | undefined {
  const modulesFor = (name: string): readonly string[] =>
    modulesOf.get(name) ?? [];
  if (Node.isPropertyAccessExpression(node)) {
    const namespace = node.getExpression();
    const name = node.getName();
    const imported =
      Node.isIdentifier(namespace) &&
      localDeclarationsOf(namespace).some(
        (declaration) =>
          (Node.isNamespaceImport(declaration) ||
            Node.isImportClause(declaration)) &&
          modulesFor(name).includes(importedModuleOf(declaration) ?? "")
      );
    return imported ? name : undefined;
  }
  if (!Node.isIdentifier(node)) {
    return undefined;
  }
  const declarations = localDeclarationsOf(node);
  if (declarations.length === 0) {
    return node.getText();
  }
  const specifier = declarations.find(
    (declaration) =>
      Node.isImportSpecifier(declaration) &&
      isNamedImportFrom(
        declaration,
        declaration.getName(),
        modulesFor(declaration.getName())
      )
  );
  return specifier && Node.isImportSpecifier(specifier)
    ? specifier.getName()
    : undefined;
};

/**
 * Strips `as`, `satisfies`, `<T>` type assertions, non-null `!` and
 * parentheses around an expression.
 */
export const unwrapExpression = function unwrapExpression(
  node: Syntax.Node
): Syntax.Node {
  let current = node;
  while (
    Node.isAsExpression(current) ||
    Node.isSatisfiesExpression(current) ||
    Node.isTypeAssertion(current) ||
    Node.isNonNullExpression(current) ||
    Node.isParenthesizedExpression(current)
  ) {
    current = current.getExpression();
  }
  return current;
};

/** The modules that export `createRequire`. */
const NODE_MODULE_ENTRIES = ["node:module", "module"];
const NODE_MODULE = new Map([["createRequire", NODE_MODULE_ENTRIES]]);

/**
 * Whether an identifier names Node's `require`: the global, or a binding
 * created by `createRequire()` from `node:module`, imported by name or
 * reached through a namespace or default import. A parameter or local
 * declaration that shadows `require` does not count.
 */
export const isNodeRequire = function isNodeRequire(
  identifier: Syntax.Identifier
): boolean {
  const declarations = localDeclarationsOf(identifier);
  if (declarations.length === 0) {
    return identifier.getText() === "require";
  }
  return declarations.some((declaration) => {
    if (!Node.isVariableDeclaration(declaration)) {
      return false;
    }
    const declared = declaration.getInitializer();
    const initializer = declared && unwrapExpression(declared);
    if (!initializer || !Node.isCallExpression(initializer)) {
      return false;
    }
    const factory = initializer.getExpression();
    if (Node.isPropertyAccessExpression(factory)) {
      return sourceNameOf(factory, NODE_MODULE) === "createRequire";
    }
    return (
      factory
        .getSymbol()
        ?.getDeclarations()
        .some((imported) =>
          isNamedImportFrom(imported, "createRequire", NODE_MODULE_ENTRIES)
        ) ?? false
    );
  });
};

/**
 * Test-runner and `require` helpers whose first argument names a module, so
 * a mock of `@c15t/react` follows the import it replaces.
 */
const MODULE_HELPERS = new Set([
  "jest.createMockFromModule",
  "jest.deepUnmock",
  "jest.doMock",
  "jest.dontMock",
  "jest.mock",
  "jest.requireActual",
  "jest.requireMock",
  "jest.setMock",
  "jest.unmock",
  "jest.unstable_mockModule",
  "jest.unstable_unmockModule",
  "require.resolve",
  "vi.doMock",
  "vi.doUnmock",
  "vi.importActual",
  "vi.importMock",
  "vi.mock",
  "vi.unmock",
]);

/** The method names in {@link MODULE_HELPERS}, checked before any binding. */
const HELPER_METHODS = new Set(
  [...MODULE_HELPERS].map((helper) => helper.slice(helper.indexOf(".") + 1))
);

/** Modules that export the test-runner globals, as `vitest` exports `vi`. */
const HELPER_MODULES = new Map<string, readonly string[]>(
  Object.entries({
    jest: ["@jest/globals"],
    vi: ["vitest"],
  })
);

/**
 * Whether a node is a `vi.mock()`-style call from {@link MODULE_HELPERS}.
 * The receiver is matched by what it refers to, not its local name: the
 * global `vi`, `jest` or `require`, a `createRequire()` binding, or `vi` or
 * `jest` imported under any name, as `import { vi as test } from 'vitest'`
 * or `import * as V from 'vitest'` does. A local binding that shadows a
 * global doesn't count.
 */
export const isModuleHelperCall = function isModuleHelperCall(
  node: Syntax.Node
): boolean {
  if (!Node.isCallExpression(node)) {
    return false;
  }
  const callee = node.getExpression();
  if (
    !(
      Node.isPropertyAccessExpression(callee) &&
      HELPER_METHODS.has(callee.getName())
    )
  ) {
    return false;
  }
  const receiver = callee.getExpression();
  const helper =
    Node.isIdentifier(receiver) && isNodeRequire(receiver)
      ? "require"
      : sourceNameOf(receiver, HELPER_MODULES);
  return (
    helper !== undefined && MODULE_HELPERS.has(`${helper}.${callee.getName()}`)
  );
};

/**
 * An object property's key without quotes. A computed key counts when it is
 * a string, as in `['tailwindcss']: {}`; any other computed key is
 * `undefined`.
 */
export const propertyKey = function propertyKey(
  property: Syntax.ObjectLiteralElementLike
): string | undefined {
  if (
    !Node.isPropertyAssignment(property) &&
    !Node.isShorthandPropertyAssignment(property) &&
    !Node.isMethodDeclaration(property)
  ) {
    return undefined;
  }
  const nameNode = property.getNameNode();
  if (Node.isIdentifier(nameNode)) {
    return nameNode.getText();
  }
  const name = Node.isComputedPropertyName(nameNode)
    ? nameNode.getExpression()
    : nameNode;
  if (
    Node.isStringLiteral(name) ||
    Node.isNoSubstitutionTemplateLiteral(name)
  ) {
    return name.getLiteralText();
  }
  return undefined;
};

/** The first property with this key, ignoring spreads and computed keys. */
export const findProperty = function findProperty(
  object: Syntax.ObjectLiteralExpression,
  key: string
): Syntax.ObjectLiteralElementLike | undefined {
  return object
    .getProperties()
    .find((property) => propertyKey(property) === key);
};

/** The value a property supplies: its initializer, or the shorthand name. */
export const propertyValueText = function propertyValueText(
  property: Syntax.ObjectLiteralElementLike
): string | undefined {
  if (Node.isPropertyAssignment(property)) {
    return property.getInitializer()?.getText();
  }
  if (Node.isShorthandPropertyAssignment(property)) {
    return property.getName();
  }
  return undefined;
};

/** Writes `key: value`, or the shorthand when they are the same name. */
export const propertyText = function propertyText(
  key: string,
  value: string
): string {
  return key === value ? key : `${key}: ${value}`;
};

/**
 * The range that removes the list elements from `first` to `last` (properties
 * or import specifiers) and their comma. Elements on their own lines take
 * the rest of the last line with them, so no blank line is left behind.
 */
const spanRemoval = function spanRemoval(
  first: Syntax.Node,
  last: Syntax.Node
): TextEdit {
  const sourceText = first.getSourceFile().getFullText();
  const comma = /^[\t ]*,/u.exec(sourceText.slice(last.getEnd()))?.[0];
  if (startsLine(first)) {
    const lineStart = sourceText.lastIndexOf("\n", first.getStart() - 1) + 1;
    const end = last.getEnd() + (comma?.length ?? 0);
    const rest = /^[\t ]*(?:\r?\n)?/u.exec(sourceText.slice(end))?.[0] ?? "";
    return { end: end + rest.length, start: lineStart, text: "" };
  }
  if (comma) {
    const end = last.getEnd() + comma.length;
    const trailing = /^[\t ]*/u.exec(sourceText.slice(end))?.[0] ?? "";
    // At the end of a line, take the space before the element instead, so
    // the line keeps no trailing whitespace.
    const endsLine = /^\r?\n/u.test(sourceText.slice(end + trailing.length));
    const leading = endsLine
      ? (/[\t ]*$/u.exec(sourceText.slice(0, first.getStart()))?.[0] ?? "")
      : "";
    return {
      end: end + trailing.length,
      start: first.getStart() - leading.length,
      text: "",
    };
  }
  // The last element on a line takes the comma before it instead. A JSX
  // attribute has no comma, so it takes the space before it.
  const before = /(?:,[\t ]*|[\t ]+)$/u.exec(
    sourceText.slice(0, first.getStart())
  )?.[0];
  return {
    end: last.getEnd(),
    start: first.getStart() - (before?.length ?? 0),
    text: "",
  };
};

/**
 * The range that removes one list element (a property, an import specifier
 * or a JSX attribute) and its comma. To remove several elements of the same
 * list, use `elementRemovals`, so two removals never claim the same comma.
 */
export const propertyRemoval = function propertyRemoval(
  property: Syntax.Node
): TextEdit {
  return spanRemoval(property, property);
};

/** The elements of the list that holds `element`, without the commas. */
const siblingsOf = function siblingsOf(element: Syntax.Node): Syntax.Node[] {
  return (
    element
      .getParentSyntaxList()
      ?.getChildren()
      .filter((child) => child.getKind() !== SyntaxKind.CommaToken) ?? [element]
  );
};

/** Whether a comment or other text sits between two adjacent elements. */
const hasTriviaBetween = function hasTriviaBetween(
  left: Syntax.Node,
  right: Syntax.Node
): boolean {
  return (
    left
      .getSourceFile()
      .getFullText()
      .slice(left.getEnd(), right.getStart())
      .replace(",", "")
      .trim() !== ""
  );
};

/**
 * Ranges that remove `elements` and their commas. Adjacent elements of one
 * list are removed as a single run: removing `b` and `c` from
 * `{ a: 1, b: 2, c: 3 }` leaves `{ a: 1 }`. A comment between two elements
 * ends the run, so it stays.
 */
export const elementRemovals = function elementRemovals(
  elements: Syntax.Node[]
): TextEdit[] {
  const removing = new Set(elements);
  const covered = new Set<Syntax.Node>();
  const edits: TextEdit[] = [];
  const ordered = [...removing].toSorted(
    (left, right) => left.getStart() - right.getStart()
  );
  for (const element of ordered) {
    if (covered.has(element)) {
      continue;
    }
    const siblings = siblingsOf(element);
    let index = siblings.indexOf(element);
    let last = element;
    covered.add(element);
    while (index >= 0) {
      const next = siblings[index + 1];
      if (!(next && removing.has(next)) || hasTriviaBetween(last, next)) {
        break;
      }
      covered.add(next);
      last = next;
      index += 1;
    }
    edits.push(spanRemoval(element, last));
  }
  return edits;
};

/** The quote character the file's first import uses, defaulting to `'`. */
const preferredQuote = function preferredQuote(
  sourceFile: Syntax.SourceFile
): string {
  const [first] = sourceFile.getImportDeclarations();
  return first?.getModuleSpecifier().getText().charAt(0) ?? "'";
};

const findValueImport = function findValueImport(
  sourceFile: Syntax.SourceFile,
  specifier: string
): Syntax.ImportDeclaration | undefined {
  return sourceFile
    .getImportDeclarations()
    .find(
      (declaration) =>
        declaration.getModuleSpecifierValue() === specifier &&
        !declaration.isTypeOnly() &&
        !declaration.getNamespaceImport()
    );
};

/**
 * Appends specifiers to an import in the style it is written in: one per
 * line for a multi-line list, comma-separated otherwise.
 */
const insertNamedImports = function insertNamedImports(
  declaration: Syntax.ImportDeclaration,
  names: string[]
): void {
  const bindings = declaration.getImportClause()?.getNamedBindings();
  const last =
    bindings && Node.isNamedImports(bindings)
      ? bindings.getElements().at(-1)
      : undefined;
  if (!bindings || !last) {
    declaration.addNamedImports(names);
    return;
  }
  const sourceFile = declaration.getSourceFile();
  const after = sourceFile.getFullText().slice(last.getEnd());
  const comma = /^[\t ]*,/u.exec(after)?.[0];
  if (bindings.getText().includes("\n")) {
    const indent = lineIndent(last);
    const lines = names.map((name) => `\n${indent}${name}`);
    sourceFile.insertText(
      last.getEnd() + (comma?.length ?? 0),
      comma ? lines.map((line) => `${line},`).join("") : `,${lines.join(",")}`
    );
    return;
  }
  sourceFile.insertText(
    last.getEnd(),
    names.map((name) => `, ${name}`).join("")
  );
};

/**
 * Makes `names` available from `specifier`, reusing an existing value
 * import from it, or adding a declaration after the last import.
 */
export const ensureNamedImports = function ensureNamedImports(
  sourceFile: Syntax.SourceFile,
  specifier: string,
  names: string[]
): void {
  const existing = findValueImport(sourceFile, specifier);
  const present = new Set(
    existing
      ?.getNamedImports()
      .filter((named) => !named.isTypeOnly())
      .map((named) => named.getName())
  );
  const missing = [...new Set(names)]
    .filter((name) => !present.has(name))
    .toSorted();
  if (missing.length === 0) {
    return;
  }
  if (existing) {
    insertNamedImports(existing, missing);
    return;
  }
  const imports = sourceFile.getImportDeclarations();
  const quote = preferredQuote(sourceFile);
  const index =
    imports.length > 0 ? (imports.at(-1)?.getChildIndex() ?? 0) + 1 : 0;
  sourceFile.insertStatements(
    index,
    `import { ${missing.join(", ")} } from ${quote}${specifier}${quote};`
  );
};

/** True when the file has a binding with this name outside the given import. */
export const isNameTaken = function isNameTaken(
  sourceFile: Syntax.SourceFile,
  name: string
): boolean {
  return sourceFile
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .some(
      (identifier) =>
        identifier.getText() === name &&
        (Node.isVariableDeclaration(identifier.getParent()) ||
          Node.isFunctionDeclaration(identifier.getParent()) ||
          Node.isClassDeclaration(identifier.getParent()) ||
          Node.isParameterDeclaration(identifier.getParent()) ||
          Node.isBindingElement(identifier.getParent()) ||
          Node.isImportSpecifier(identifier.getParent()) ||
          Node.isImportClause(identifier.getParent()) ||
          Node.isNamespaceImport(identifier.getParent()))
    );
};

/** Where one import or export specifier should go, and how to write it there. */
export interface SpecifierMove {
  target: string;
  text: string;
}

/**
 * Moves specifiers to declarations for other entries. A declaration whose
 * every specifier moves is replaced in place; otherwise the moved
 * specifiers are removed and new declarations follow it. Type-only
 * declarations stay type-only.
 */
export const moveSpecifiers = function moveSpecifiers(
  declaration: Syntax.ImportDeclaration | Syntax.ExportDeclaration,
  moves: Map<Syntax.Node, SpecifierMove>,
  edits: TextEdit[]
): void {
  if (moves.size === 0) {
    return;
  }
  const quote = declaration.getModuleSpecifier()?.getText().charAt(0) ?? "'";
  const isImport = Node.isImportDeclaration(declaration);
  const keyword = isImport ? "import" : "export";
  const typeOnly = declaration.isTypeOnly() ? "type " : "";
  const groups = new Map<string, string[]>();
  for (const { target, text } of moves.values()) {
    groups.set(target, [...(groups.get(target) ?? []), text]);
  }
  const lines = [...groups].map(
    ([target, texts]) =>
      `${keyword} ${typeOnly}{ ${texts.join(", ")} } from ${quote}${target}${quote};`
  );
  const specifiers = isImport
    ? declaration.getNamedImports()
    : declaration.getNamedExports();
  const keepsOthers =
    specifiers.some((specifier) => !moves.has(specifier)) ||
    (isImport &&
      (declaration.getDefaultImport() !== undefined ||
        declaration.getNamespaceImport() !== undefined));
  if (!keepsOthers) {
    edits.push(
      toTextEdit(declaration, lines.join(`\n${lineIndent(declaration)}`))
    );
    return;
  }
  edits.push(...elementRemovals([...moves.keys()]), {
    end: declaration.getEnd(),
    start: declaration.getEnd(),
    text: lines.map((line) => `\n${line}`).join(""),
  });
};

/** The text of a specifier with `name` in place of its imported name. */
export const renamedSpecifierText = function renamedSpecifierText(
  specifier: Syntax.ImportSpecifier | Syntax.ExportSpecifier,
  name: string,
  keepLocalName: boolean
): string {
  const typePrefix = specifier.isTypeOnly() ? "type " : "";
  const alias = specifier.getAliasNode()?.getText();
  const original = specifier.getNameNode().getText();
  if (alias) {
    return `${typePrefix}${name} as ${alias}`;
  }
  if (keepLocalName && name !== original) {
    return `${typePrefix}${name} as ${original}`;
  }
  return `${typePrefix}${name}`;
};

/**
 * The object literal an expression is written as, following an identifier
 * or shorthand property to a variable initialized in the same file.
 */
export const objectLiteralFor = function objectLiteralFor(
  node: Syntax.Node | undefined
): Syntax.ObjectLiteralExpression | undefined {
  if (!node) {
    return undefined;
  }
  const expression = Node.isShorthandPropertyAssignment(node)
    ? node
    : unwrapExpression(node);
  if (Node.isObjectLiteralExpression(expression)) {
    return expression;
  }
  let symbol: Syntax.Symbol | undefined;
  if (Node.isShorthandPropertyAssignment(expression)) {
    symbol = expression
      .getProject()
      .getTypeChecker()
      .getShorthandAssignmentValueSymbol(expression);
  } else if (Node.isIdentifier(expression)) {
    symbol = expression.getSymbol();
  }
  for (const declaration of symbol?.getDeclarations() ?? []) {
    if (
      !Node.isVariableDeclaration(declaration) ||
      declaration.getSourceFile() !== node.getSourceFile()
    ) {
      continue;
    }
    const initializer = declaration.getInitializer();
    const object = initializer && unwrapExpression(initializer);
    if (object && Node.isObjectLiteralExpression(object)) {
      return object;
    }
  }
  return undefined;
};

/** The node a property's value is written with: its initializer, or the shorthand itself. */
export const propertyValueNode = function propertyValueNode(
  property: Syntax.ObjectLiteralElementLike
): Syntax.Node | undefined {
  if (Node.isPropertyAssignment(property)) {
    return property.getInitializer();
  }
  if (Node.isShorthandPropertyAssignment(property)) {
    return property;
  }
  return undefined;
};
