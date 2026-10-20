// A TypeScript syntax tree with the parts of the ts-morph API the c15t
// codemods use. Scriptc cannot compile ts-morph or the TypeScript compiler,
// so the parser in `parser.ts` builds these nodes instead. Node kinds use the
// compiler's SyntaxKind names, so ported codemods compare the same strings.
//
// Edits follow ts-morph: removals and insertions leave the same whitespace,
// and nodes that an edit does not touch stay valid afterwards. Nodes an edit
// replaces are forgotten, and reading them throws, as in ts-morph.

/* eslint-disable max-classes-per-file -- Nodes, symbols and the ts-morph stand-ins they return. */
/* eslint-disable no-use-before-define -- Tree helpers and the Node class refer to each other. */

import {
  getLineEndFromPos,
  getLineStartFromPos,
  getNextMatchingPos,
  getNextNonWhitespacePos,
  getPosAtEndOfPreviousLine,
  getPosAtNextNonBlankLine,
  getPosAtStartOfLineOrNonWhitespace,
  getPreviousMatchingPos,
  getPreviousNonWhitespacePos,
  hasNewLineInRange,
  isNewLineAtPos,
  isWhitespace,
  skipTrivia,
  trailingCommentsEnd,
} from "./text.ts";

/** Flags stored on a node. */
export const NodeFlags = {
  Abstract: 32_768,
  Accessor: 1_048_576,
  Asserts: 16_777_216,
  Async: 1024,
  Await: 8_388_608,
  Const: 8192,
  Declare: 2048,
  Default: 512,
  DotDotDot: 2,
  Exclamation: 64,
  Export: 256,
  ExportEquals: 128,
  Generator: 16,
  In: 2_097_152,
  None: 0,
  Out: 4_194_304,
  Override: 524_288,
  Private: 131_072,
  Protected: 262_144,
  Public: 65_536,
  Question: 8,
  QuestionDot: 4,
  Readonly: 16_384,
  Static: 4096,
  TypeOf: 32,
  TypeOnly: 1,
} as const;

/** The node kinds the codemods name. Values are the kind names. */
export const SyntaxKind = {
  CallExpression: "CallExpression",
  CommaToken: "CommaToken",
  ExpressionStatement: "ExpressionStatement",
  Identifier: "Identifier",
  ImportDeclaration: "ImportDeclaration",
  ImportKeyword: "ImportKeyword",
  ImportType: "ImportType",
  JsxOpeningElement: "JsxOpeningElement",
  JsxSelfClosingElement: "JsxSelfClosingElement",
  MultiLineCommentTrivia: "MultiLineCommentTrivia",
  NoSubstitutionTemplateLiteral: "NoSubstitutionTemplateLiteral",
  ObjectLiteralExpression: "ObjectLiteralExpression",
  PropertyAccessExpression: "PropertyAccessExpression",
  PropertyAssignment: "PropertyAssignment",
  QualifiedName: "QualifiedName",
  SingleLineCommentTrivia: "SingleLineCommentTrivia",
  StringLiteral: "StringLiteral",
  SyntaxList: "SyntaxList",
  TemplateHead: "TemplateHead",
  TemplateMiddle: "TemplateMiddle",
  TemplateTail: "TemplateTail",
  TypeQuery: "TypeQuery",
  VariableDeclaration: "VariableDeclaration",
  VariableDeclarationList: "VariableDeclarationList",
  VariableStatement: "VariableStatement",
} as const;

/** A declared name: an import, variable, function, class, parameter or type. */
export class SyntaxSymbol {
  name: string;
  declarations: Node[] = [];
  references: Node[] = [];
  // True for import bindings, which ts-morph reports as aliases.
  alias = false;
  // ts-morph wraps the compiler's symbol; codemods compare these for identity.
  compilerSymbol: SyntaxSymbol;

  constructor(name: string) {
    this.name = name;
    this.compilerSymbol = this;
  }

  getName(): string {
    return this.name;
  }

  getDeclarations(): Node[] {
    return this.declarations;
  }
}

/** One edit to a file's text. */
export interface TextChange {
  start: number;
  end: number;
  text: string;
}

/** The text, parser and binder behind a source file node. */
export class SourceText {
  text: string;
  path: string;
  reparse: (text: string, path: string) => Node;
  bind: (root: Node) => void;
  // Symbols are resolved on first use and again after each edit.
  bound = false;

  constructor(
    text: string,
    path: string,
    reparse: (text: string, path: string) => Node,
    bind: (root: Node) => void
  ) {
    this.text = text;
    this.path = path;
    this.reparse = reparse;
    this.bind = bind;
  }
}

/** The answer to `getType().isObject()`, worked out from syntax alone. */
export class SyntacticType {
  object: boolean;

  constructor(object: boolean) {
    this.object = object;
  }

  isObject(): boolean {
    return this.object;
  }
}

/** Stands in for ts-morph's type checker, for the one call the codemods make. */
export class SyntaxTypeChecker {
  // eslint-disable-next-line class-methods-use-this -- ts-morph's checker API.
  getShorthandAssignmentValueSymbol(node: Node): SyntaxSymbol | undefined {
    return node.getValueSymbol();
  }
}

/** Stands in for `node.getProject()`, which codemods use for the checker. */
export class SyntaxProjectView {
  checker = new SyntaxTypeChecker();

  getTypeChecker(): SyntaxTypeChecker {
    return this.checker;
  }
}

const EMPTY: Node[] = [];

const isKind = <Kind extends string>(
  node: Node | undefined,
  kind: Kind
): node is NodeOf<Kind> => node?.kind === kind;

const ofKind = <Kind extends string>(
  nodes: readonly Node[],
  kind: Kind
): NodeOf<Kind>[] => {
  const found: NodeOf<Kind>[] = [];
  for (const node of nodes) {
    if (isKind(node, kind)) {
      found.push(node);
    }
  }
  return found;
};
const FORGOTTEN =
  "Attempted to get information from a node that was removed or forgotten.";

const STATEMENT_KINDS = new Set([
  "Block",
  "BreakStatement",
  "ClassDeclaration",
  "ContinueStatement",
  "DebuggerStatement",
  "DoStatement",
  "EmptyStatement",
  "EnumDeclaration",
  "ExportAssignment",
  "ExportDeclaration",
  "ExpressionStatement",
  "ForInStatement",
  "ForOfStatement",
  "ForStatement",
  "FunctionDeclaration",
  "IfStatement",
  "ImportDeclaration",
  "ImportEqualsDeclaration",
  "InterfaceDeclaration",
  "LabeledStatement",
  "ModuleBlock",
  "ModuleDeclaration",
  "NotEmittedStatement",
  "ReturnStatement",
  "SwitchStatement",
  "ThrowStatement",
  "TryStatement",
  "TypeAliasDeclaration",
  "VariableStatement",
  "WhileStatement",
  "WithStatement",
]);

// Lists whose elements are separated by commas. ts-morph shows the commas as
// CommaToken siblings.
const COMMA_LISTS = new Set([
  "arguments",
  "declarations",
  "elements",
  "members",
  "parameters",
  "properties",
  "typeArguments",
  "typeParameters",
  "types",
]);

// Kinds that are not parse-tree nodes. ts-morph finds these inside JSDoc
// comments too, because it walks `getChildren()` to find them.
const TOKEN_KINDS = new Set([
  "BigIntLiteral",
  "Identifier",
  "JsxText",
  "JsxTextAllWhiteSpaces",
  "NoSubstitutionTemplateLiteral",
  "NumericLiteral",
  "PrivateIdentifier",
  "RegularExpressionLiteral",
  "StringLiteral",
  "TemplateHead",
  "TemplateMiddle",
  "TemplateTail",
]);

const isTokenKind = (kind: string): boolean =>
  kind.endsWith("Token") ||
  kind.endsWith("Keyword") ||
  kind.startsWith("JSDoc") ||
  TOKEN_KINDS.has(kind);

const isComment = (node: Node | undefined): boolean =>
  node !== undefined &&
  (node.kind === "SingleLineCommentTrivia" ||
    node.kind === "MultiLineCommentTrivia");

/**
 * The list ts-morph parses comments into for a container kind, such as a
 * block's statements, or undefined when it parses none.
 */
const commentList = (kind: string): string | undefined => {
  switch (kind) {
    case "SourceFile":
    case "Block":
    case "ModuleBlock":
    case "CaseClause":
    case "DefaultClause": {
      return "statements";
    }
    case "ClassDeclaration":
    case "ClassExpression":
    case "InterfaceDeclaration":
    case "EnumDeclaration":
    case "TypeLiteral": {
      return "members";
    }
    case "ObjectLiteralExpression": {
      return "properties";
    }
    default: {
      return undefined;
    }
  }
};

// Where an empty container's body starts: after its `{`, or after the `:` of
// a switch clause.
const bodyPos = (container: Node, text: string): number => {
  if (container.kind === "SourceFile") {
    return 0;
  }
  const opener =
    container.kind === "CaseClause" || container.kind === "DefaultClause"
      ? ":"
      : "{";
  const last = container.children.at(-1);
  let pos = last ? last.end : container.start;
  if (container.kind === "DefaultClause") {
    pos = container.start + "default".length;
  }
  while (pos < container.end) {
    pos = skipTrivia(text, pos);
    if (text[pos] === opener) {
      return pos + 1;
    }
    pos += 1;
  }
  return container.end;
};

// The comments ts-morph shows as nodes at `start`: its CommentNodeParser,
// ported line for line.
const commentNodes = (
  container: Node,
  text: string,
  start: number,
  stopAtJsDoc: boolean
): Node[] => {
  const fullStart = start;
  let pos = start;
  const found: Node[] = [];

  const commentKind = (): string | undefined => {
    if (text[pos] !== "/") {
      return undefined;
    }
    if (text[pos + 1] === "/") {
      return "SingleLine";
    }
    if (text[pos + 1] !== "*") {
      return undefined;
    }
    return text[pos + 2] === "*" ? "JsDoc" : "MultiLine";
  };

  const parseComment = (kind: string): Node => {
    const commentStart = pos;
    if (kind === "SingleLine") {
      pos += 2;
      while (pos < text.length && text[pos] !== "\n" && text[pos] !== "\r") {
        pos += 1;
      }
    } else {
      pos += kind === "JsDoc" ? 3 : 2;
      while (pos < text.length) {
        if (text[pos] === "*" && text[pos + 1] === "/") {
          pos += 2;
          break;
        }
        pos += 1;
      }
    }
    const node = new Node(
      kind === "SingleLine"
        ? "SingleLineCommentTrivia"
        : "MultiLineCommentTrivia",
      fullStart,
      commentStart
    );
    node.end = pos;
    node.parent = container;
    return node;
  };

  const skipTrailingLine = (): void => {
    if (pos === 0) {
      return;
    }
    let lineEnd = getLineEndFromPos(text, pos);
    while (pos < lineEnd) {
      const kind = commentKind();
      if (kind !== undefined) {
        const comment = parseComment(kind);
        if (comment.kind === "SingleLineCommentTrivia") {
          return;
        }
        lineEnd = getLineEndFromPos(text, pos);
      } else if (!isWhitespace(text[pos]) && text[pos] !== ",") {
        return;
      } else {
        pos += 1;
      }
    }
    while (text[pos] === "\n" || text[pos] === "\r") {
      pos += 1;
    }
  };

  skipTrailingLine();
  const leading: Node[] = [];
  while (pos < text.length) {
    const kind = commentKind();
    if (kind !== undefined) {
      if (kind === "JsDoc" && stopAtJsDoc) {
        break;
      }
      leading.push(parseComment(kind));
      skipTrailingLine();
    } else if (isWhitespace(text[pos])) {
      pos += 1;
    } else {
      break;
    }
  }
  const maxEnd =
    pos === text.length || text[pos] === "}"
      ? pos
      : getLineStartFromPos(text, pos);
  for (const comment of leading) {
    if (comment.end <= maxEnd) {
      found.push(comment);
    }
  }
  return found;
};

/** Comment nodes in a container's body, as ts-morph parses them. */
const containerComments = (container: Node, text: string): Node[] => {
  const name = commentList(container.kind);
  const items = name === undefined ? EMPTY : container.list(name);
  const found: Node[] = [];
  if (items.length === 0) {
    for (const comment of commentNodes(
      container,
      text,
      bodyPos(container, text),
      false
    )) {
      found.push(comment);
    }
    return found;
  }
  for (const item of items) {
    for (const comment of commentNodes(container, text, item.pos, true)) {
      found.push(comment);
    }
  }
  const last = items.at(-1);
  if (last) {
    for (const comment of commentNodes(container, text, last.end, false)) {
      found.push(comment);
    }
  }
  return found;
};

/**
 * The children of the syntax list that holds `parent`'s `name` list, as
 * ts-morph shows them: the elements, the commas between them, and, in a
 * body, comments on their own lines.
 */
const syntaxChildren = (parent: Node, name: string): Node[] => {
  const text = parent.sourceText();
  const items = parent.list(name);
  const result: Node[] = [];
  for (const item of items) {
    result.push(item);
    if (COMMA_LISTS.has(name)) {
      const comma = skipTrivia(text, item.end);
      if (text[comma] === "," && comma < parent.end) {
        const token = new Node("CommaToken", item.end, comma);
        token.end = comma + 1;
        token.parent = parent;
        result.push(token);
      }
    }
  }
  if (commentList(parent.kind) === name && parent.pos !== parent.end) {
    let index = 0;
    for (const comment of containerComments(parent, text)) {
      while (index < result.length && (result[index]?.end ?? 0) < comment.end) {
        index += 1;
      }
      result.splice(index, 0, comment);
      index += 1;
    }
  }
  for (const node of result) {
    if (node.parent !== parent || !items.includes(node)) {
      node.ownerList = result;
    }
  }
  return result;
};

// Nodes under `root` in source order, parents first. JSDoc comments come
// before a node's children, as in ts-morph.
const preorder = (root: Node, includeRoot: boolean): Node[] => {
  const found: Node[] = [];
  const stack: Node[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      break;
    }
    if (node !== root || includeRoot) {
      found.push(node);
    }
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const child = node.children[index];
      if (child) {
        stack.push(child);
      }
    }
    for (let index = node.jsDocs.length - 1; index >= 0; index -= 1) {
      const jsDoc = node.jsDocs[index];
      if (jsDoc) {
        stack.push(jsDoc);
      }
    }
  }
  return found;
};

// Statements with a body get a blank line around them when a removal joins
// their neighbours; other statements get a line break.
const hasBlankLineFormatting = (node: Node): boolean => {
  switch (node.kind) {
    case "Constructor":
    case "FunctionDeclaration":
    case "GetAccessor":
    case "MethodDeclaration":
    case "ModuleDeclaration":
    case "SetAccessor": {
      return node.field("body") !== undefined;
    }
    case "ArrowFunction":
    case "ClassStaticBlockDeclaration":
    case "FunctionExpression":
    case "InterfaceDeclaration":
    case "ClassDeclaration":
    case "EnumDeclaration": {
      return true;
    }
    default: {
      return false;
    }
  }
};

// Whether a value is an object, from its syntax: a literal, function, class
// or `new` expression, or a variable initialized with one. The codemods ask
// ts-morph's type checker; this answers the same for code in the file.
const WRAPPER_KINDS = new Set([
  "AsExpression",
  "NonNullExpression",
  "ParenthesizedExpression",
  "SatisfiesExpression",
  "TypeAssertionExpression",
]);

const OBJECT_KINDS = new Set([
  "ArrayLiteralExpression",
  "ArrowFunction",
  "ClassExpression",
  "FunctionExpression",
  "NewExpression",
  "ObjectLiteralExpression",
]);

const isObjectValue = (node: Node | undefined, depth: number): boolean => {
  let current = node;
  while (current && WRAPPER_KINDS.has(current.kind)) {
    current = current.field("expression");
  }
  if (!current) {
    return false;
  }
  if (OBJECT_KINDS.has(current.kind)) {
    return true;
  }
  if (current.kind !== "Identifier" || depth > 8) {
    return false;
  }
  const { parent } = current;
  const symbol =
    parent?.kind === "ShorthandPropertyAssignment" &&
    parent.field("name") === current
      ? parent.getValueSymbol()
      : current.getSymbol();
  for (const declaration of symbol?.declarations ?? EMPTY) {
    if (declaration.kind !== "VariableDeclaration") {
      continue;
    }
    if (declaration.field("type")?.kind === "TypeLiteral") {
      return true;
    }
    if (isObjectValue(declaration.field("initializer"), depth + 1)) {
      return true;
    }
  }
  return false;
};

const removalCondition =
  (removeNewLines: boolean, removeSpaces: boolean) =>
  (code: number): boolean => {
    if (removeNewLines && (code === 13 || code === 10)) {
      return false;
    }
    if (removeSpaces && (code === 32 || code === 9)) {
      return false;
    }
    return true;
  };

/** A syntax tree node. Method names and behavior follow ts-morph. */
/**
 * A node of `kind`. Type-only: Scriptc gives a generic class no prototype
 * table, so dynamic calls on its instances would fail at runtime.
 */
export type NodeOf<Kind extends string> = Node & { kind: Kind };

export class Node {
  kind: string;
  pos: number;
  start: number;
  end = 0;
  parent: Node | undefined = undefined;
  children: Node[] = [];
  fields = new Map<string, Node>();
  lists = new Map<string, Node[]>();
  flags = 0;
  // Identifier text, cooked literal value, operator, or declaration keyword.
  value = "";
  symbol: SyntaxSymbol | undefined = undefined;
  // The value a shorthand property reads, when this node is one.
  valueSymbol: SyntaxSymbol | undefined = undefined;
  // Only set on the SourceFile node.
  file: SourceText | undefined = undefined;
  // JSDoc comments attached to this node. Kept apart from `children`, as the
  // compiler keeps them apart.
  jsDocs: Node[] = [];
  // Set when an edit replaced this node.
  forgotten = false;
  // The syntax list a comma or comment node was made for.
  ownerList: Node[] | undefined = undefined;
  // The matching node from the other tree while an edit is applied.
  adopted: Node | undefined = undefined;

  constructor(kind: string, pos: number, start: number) {
    this.kind = kind;
    this.pos = pos;
    this.start = start;
  }

  // Type guards, named as in ts-morph's `Node.isX`.

  static isStatement(node: Node | undefined): boolean {
    return node !== undefined && STATEMENT_KINDS.has(node.kind);
  }

  static isArrayLiteralExpression(
    node: Node | undefined
  ): node is NodeOf<"ArrayLiteralExpression"> {
    return node?.kind === "ArrayLiteralExpression";
  }

  static isAsExpression(
    node: Node | undefined
  ): node is NodeOf<"AsExpression"> {
    return node?.kind === "AsExpression";
  }

  static isBindingElement(
    node: Node | undefined
  ): node is NodeOf<"BindingElement"> {
    return node?.kind === "BindingElement";
  }

  static isCallExpression(
    node: Node | undefined
  ): node is NodeOf<"CallExpression"> {
    return node?.kind === "CallExpression";
  }

  static isClassDeclaration(
    node: Node | undefined
  ): node is NodeOf<"ClassDeclaration"> {
    return node?.kind === "ClassDeclaration";
  }

  static isComputedPropertyName(
    node: Node | undefined
  ): node is NodeOf<"ComputedPropertyName"> {
    return node?.kind === "ComputedPropertyName";
  }

  static isConditionalExpression(
    node: Node | undefined
  ): node is NodeOf<"ConditionalExpression"> {
    return node?.kind === "ConditionalExpression";
  }

  static isExportDeclaration(
    node: Node | undefined
  ): node is NodeOf<"ExportDeclaration"> {
    return node?.kind === "ExportDeclaration";
  }

  static isExportSpecifier(
    node: Node | undefined
  ): node is NodeOf<"ExportSpecifier"> {
    return node?.kind === "ExportSpecifier";
  }

  static isExpressionStatement(
    node: Node | undefined
  ): node is NodeOf<"ExpressionStatement"> {
    return node?.kind === "ExpressionStatement";
  }

  static isExternalModuleReference(
    node: Node | undefined
  ): node is NodeOf<"ExternalModuleReference"> {
    return node?.kind === "ExternalModuleReference";
  }

  static isFunctionDeclaration(
    node: Node | undefined
  ): node is NodeOf<"FunctionDeclaration"> {
    return node?.kind === "FunctionDeclaration";
  }

  static isIdentifier(node: Node | undefined): node is NodeOf<"Identifier"> {
    return node?.kind === "Identifier";
  }

  static isImportClause(
    node: Node | undefined
  ): node is NodeOf<"ImportClause"> {
    return node?.kind === "ImportClause";
  }

  static isImportDeclaration(
    node: Node | undefined
  ): node is NodeOf<"ImportDeclaration"> {
    return node?.kind === "ImportDeclaration";
  }

  static isImportSpecifier(
    node: Node | undefined
  ): node is NodeOf<"ImportSpecifier"> {
    return node?.kind === "ImportSpecifier";
  }

  static isImportTypeNode(
    node: Node | undefined
  ): node is NodeOf<"ImportType"> {
    return node?.kind === "ImportType";
  }

  static isJSDoc(node: Node | undefined): node is NodeOf<"JSDoc"> {
    return node?.kind === "JSDoc";
  }

  static isJsxAttribute(
    node: Node | undefined
  ): node is NodeOf<"JsxAttribute"> {
    return node?.kind === "JsxAttribute";
  }

  static isJsxExpression(
    node: Node | undefined
  ): node is NodeOf<"JsxExpression"> {
    return node?.kind === "JsxExpression";
  }

  static isJsxOpeningElement(
    node: Node | undefined
  ): node is NodeOf<"JsxOpeningElement"> {
    return node?.kind === "JsxOpeningElement";
  }

  static isJsxSelfClosingElement(
    node: Node | undefined
  ): node is NodeOf<"JsxSelfClosingElement"> {
    return node?.kind === "JsxSelfClosingElement";
  }

  static isLiteralTypeNode(
    node: Node | undefined
  ): node is NodeOf<"LiteralType"> {
    return node?.kind === "LiteralType";
  }

  static isMethodDeclaration(
    node: Node | undefined
  ): node is NodeOf<"MethodDeclaration"> {
    return node?.kind === "MethodDeclaration";
  }

  static isNamedImports(
    node: Node | undefined
  ): node is NodeOf<"NamedImports"> {
    return node?.kind === "NamedImports";
  }

  static isNamespaceImport(
    node: Node | undefined
  ): node is NodeOf<"NamespaceImport"> {
    return node?.kind === "NamespaceImport";
  }

  static isNonNullExpression(
    node: Node | undefined
  ): node is NodeOf<"NonNullExpression"> {
    return node?.kind === "NonNullExpression";
  }

  static isNoSubstitutionTemplateLiteral(
    node: Node | undefined
  ): node is NodeOf<"NoSubstitutionTemplateLiteral"> {
    return node?.kind === "NoSubstitutionTemplateLiteral";
  }

  static isObjectBindingPattern(
    node: Node | undefined
  ): node is NodeOf<"ObjectBindingPattern"> {
    return node?.kind === "ObjectBindingPattern";
  }

  static isObjectLiteralExpression(
    node: Node | undefined
  ): node is NodeOf<"ObjectLiteralExpression"> {
    return node?.kind === "ObjectLiteralExpression";
  }

  static isParameterDeclaration(
    node: Node | undefined
  ): node is NodeOf<"Parameter"> {
    return node?.kind === "Parameter";
  }

  static isParenthesizedExpression(
    node: Node | undefined
  ): node is NodeOf<"ParenthesizedExpression"> {
    return node?.kind === "ParenthesizedExpression";
  }

  static isPropertyAccessExpression(
    node: Node | undefined
  ): node is NodeOf<"PropertyAccessExpression"> {
    return node?.kind === "PropertyAccessExpression";
  }

  static isPropertyAssignment(
    node: Node | undefined
  ): node is NodeOf<"PropertyAssignment"> {
    return node?.kind === "PropertyAssignment";
  }

  static isQualifiedName(
    node: Node | undefined
  ): node is NodeOf<"QualifiedName"> {
    return node?.kind === "QualifiedName";
  }

  static isSatisfiesExpression(
    node: Node | undefined
  ): node is NodeOf<"SatisfiesExpression"> {
    return node?.kind === "SatisfiesExpression";
  }

  static isShorthandPropertyAssignment(
    node: Node | undefined
  ): node is NodeOf<"ShorthandPropertyAssignment"> {
    return node?.kind === "ShorthandPropertyAssignment";
  }

  static isSpreadAssignment(
    node: Node | undefined
  ): node is NodeOf<"SpreadAssignment"> {
    return node?.kind === "SpreadAssignment";
  }

  static isStringLiteral(
    node: Node | undefined
  ): node is NodeOf<"StringLiteral"> {
    return node?.kind === "StringLiteral";
  }

  static isTypeAssertion(
    node: Node | undefined
  ): node is NodeOf<"TypeAssertionExpression"> {
    return node?.kind === "TypeAssertionExpression";
  }

  static isTypeReference(
    node: Node | undefined
  ): node is NodeOf<"TypeReference"> {
    return node?.kind === "TypeReference";
  }

  static isVariableDeclaration(
    node: Node | undefined
  ): node is NodeOf<"VariableDeclaration"> {
    return node?.kind === "VariableDeclaration";
  }

  // Tree construction, used by the parser.

  set(name: string, child: Node | undefined): void {
    if (child) {
      this.fields.set(name, child);
    }
  }

  setList(name: string, list: Node[]): void {
    this.lists.set(name, list);
  }

  field(name: string): Node | undefined {
    return this.fields.get(name);
  }

  list(name: string): Node[] {
    return this.lists.get(name) ?? EMPTY;
  }

  has(flag: number): boolean {
    // eslint-disable-next-line no-bitwise -- Flags are a bit set.
    return (this.flags & flag) !== 0;
  }

  /** Link children to this node in source order. */
  link(): void {
    const children: Node[] = [];
    for (const child of this.fields.values()) {
      children.push(child);
    }
    for (const list of this.lists.values()) {
      for (const child of list) {
        children.push(child);
      }
    }
    children.sort(
      (left, right) => left.start - right.start || left.end - right.end
    );
    for (const child of children) {
      child.parent = this;
    }
    for (const jsDoc of this.jsDocs) {
      jsDoc.parent = this;
    }
    this.children = children;
  }

  // Text and position.

  getKind(): string {
    return this.kind;
  }

  getKindName(): string {
    return this.kind;
  }

  private root(): Node {
    return this.parent ? this.parent.root() : this;
  }

  getSourceFile(): NodeOf<"SourceFile"> {
    if (this.forgotten) {
      throw new Error(FORGOTTEN);
    }
    const node = this.root();
    if (!isKind(node, "SourceFile")) {
      throw new Error(`${this.kind} is not part of a source file.`);
    }
    return node;
  }

  private source(): SourceText {
    const { file } = this.getSourceFile();
    if (!file) {
      throw new Error("Node is not part of a source file.");
    }
    return file;
  }

  /** The text of the file this node is in. */
  sourceText(): string {
    return this.source().text;
  }

  private ensureBound(): void {
    const root = this.getSourceFile();
    const { file } = root;
    if (file && !file.bound) {
      file.bound = true;
      file.bind(root);
    }
  }

  getText(includeJsDocComments = false): string {
    return this.source().text.slice(
      this.getStart(includeJsDocComments),
      this.end
    );
  }

  getFullText(): string {
    return this.source().text.slice(this.pos, this.end);
  }

  getStart(includeJsDocComments = false): number {
    const [jsDoc] = this.jsDocs;
    return includeJsDocComments && jsDoc ? jsDoc.start : this.start;
  }

  getEnd(): number {
    return this.end;
  }

  getPos(): number {
    return this.pos;
  }

  getFullStart(): number {
    return this.pos;
  }

  getWidth(): number {
    return this.end - this.start;
  }

  getStartLineNumber(includeJsDocComments = false): number {
    const { text } = this.source();
    const start = this.getStart(includeJsDocComments);
    let line = 1;
    for (let index = 0; index < start; index += 1) {
      if (text.charAt(index) === "\n") {
        line += 1;
      }
    }
    return line;
  }

  getFilePath(): string {
    return this.source().path;
  }

  /** Where the node's line or its leading comments start, as in ts-morph. */
  getNonWhitespaceStart(): number {
    const { text } = this.source();
    const { parent } = this;
    if (parent && parent.kind !== "SourceFile" && parent.pos === this.pos) {
      return this.getStart(true);
    }
    const previous = this.getPreviousSibling();
    let search = this.pos;
    if (previous && isComment(previous)) {
      search = previous.end;
    } else if (
      previous &&
      hasNewLineInRange(text, this.pos, this.getStart(true))
    ) {
      search = previous.getTrailingTriviaEnd();
    }
    return getNextNonWhitespacePos(text, search);
  }

  /** The end of the comments and spaces after the node on its line. */
  getTrailingTriviaEnd(): number {
    const { parent } = this;
    if (!parent || parent.end === this.end) {
      return this.end;
    }
    const { text } = this.source();
    return getNextMatchingPos(
      text,
      trailingCommentsEnd(text, this.end),
      (code) => code !== 32 && code !== 9
    );
  }

  isFirstNodeOnLine(): boolean {
    const { text } = this.source();
    for (let index = this.getNonWhitespaceStart() - 1; index >= 0; index -= 1) {
      const char = text[index];
      if (char === " " || char === "\t") {
        continue;
      }
      return char === "\n";
    }
    return true;
  }

  // Navigation.

  getParent(): Node | undefined {
    if (this.forgotten) {
      throw new Error(FORGOTTEN);
    }
    return this.parent;
  }

  getParentOrThrow(): Node {
    const parent = this.getParent();
    if (!parent) {
      throw new Error(`${this.kind} has no parent.`);
    }
    return parent;
  }

  getParentIfKind<Wanted extends string>(
    kind: Wanted
  ): NodeOf<Wanted> | undefined {
    const parent = this.getParent();
    return isKind(parent, kind) ? parent : undefined;
  }

  getChildren(): Node[] {
    return this.children;
  }

  /** The name of the parent's list that holds this node. */
  private listName(): string | undefined {
    const { parent } = this;
    if (!parent) {
      return undefined;
    }
    for (const name of parent.lists.keys()) {
      if (parent.list(name).includes(this)) {
        return name;
      }
    }
    return undefined;
  }

  /** The list in the parent that holds this node, such as its siblings. */
  getParentList(): Node[] | undefined {
    const name = this.listName();
    return name === undefined ? undefined : this.parent?.list(name);
  }

  /** The syntax list that holds this node, with commas and comments. */
  getParentSyntaxList(): Node | undefined {
    let items = this.ownerList;
    if (!items) {
      const name = this.listName();
      if (name === undefined || !this.parent) {
        return undefined;
      }
      items = syntaxChildren(this.parent, name);
    }
    const [first] = items;
    const last = items.at(-1);
    const list = new Node(
      "SyntaxList",
      first?.pos ?? this.pos,
      first?.start ?? this.start
    );
    list.end = last?.end ?? this.end;
    list.parent = this.parent;
    list.children = items;
    return list;
  }

  /** This node's siblings as ts-morph sees them, this node included. */
  siblings(): Node[] {
    if (this.ownerList) {
      return this.ownerList;
    }
    const { parent } = this;
    if (!parent) {
      return [this];
    }
    const name = this.listName();
    return name === undefined ? parent.children : syntaxChildren(parent, name);
  }

  getChildIndex(): number {
    return this.siblings().indexOf(this);
  }

  getPreviousSibling(): Node | undefined {
    const siblings = this.siblings();
    const index = siblings.indexOf(this);
    return index > 0 ? siblings[index - 1] : undefined;
  }

  getNextSibling(): Node | undefined {
    const siblings = this.siblings();
    const index = siblings.indexOf(this);
    return index === -1 ? undefined : siblings[index + 1];
  }

  getStatements(): Node[] {
    return this.list("statements");
  }

  getAncestors(): Node[] {
    const ancestors: Node[] = [];
    let node = this.getParent();
    while (node) {
      ancestors.push(node);
      node = node.parent;
    }
    return ancestors;
  }

  getFirstAncestor(predicate: (node: Node) => boolean): Node | undefined {
    let node = this.getParent();
    while (node) {
      if (predicate(node)) {
        return node;
      }
      node = node.parent;
    }
    return undefined;
  }

  getFirstAncestorByKind<Wanted extends string>(
    kind: Wanted
  ): NodeOf<Wanted> | undefined {
    let node = this.getParent();
    while (node) {
      if (isKind(node, kind)) {
        return node;
      }
      node = node.parent;
    }
    return undefined;
  }

  getDescendants(): Node[] {
    const found: Node[] = [];
    const stack: Node[] = [];
    for (let index = this.children.length - 1; index >= 0; index -= 1) {
      const child = this.children[index];
      if (child) {
        stack.push(child);
      }
    }
    while (stack.length > 0) {
      const node = stack.pop();
      if (!node) {
        break;
      }
      found.push(node);
      for (let index = node.children.length - 1; index >= 0; index -= 1) {
        const child = node.children[index];
        if (child) {
          stack.push(child);
        }
      }
    }
    return found;
  }

  getDescendantsOfKind<Wanted extends string>(kind: Wanted): NodeOf<Wanted>[] {
    const nodes = isTokenKind(kind)
      ? preorder(this, false)
      : this.getDescendants();
    return ofKind(nodes, kind);
  }

  getFirstDescendantByKind<Wanted extends string>(
    kind: Wanted
  ): NodeOf<Wanted> | undefined {
    return this.getDescendantsOfKind(kind)[0];
  }

  // Common accessors.

  getExpression(): Node {
    const expression = this.field("expression");
    if (!expression) {
      throw new Error(`${this.kind} has no expression.`);
    }
    return expression;
  }

  getExpressionIfExists(): Node | undefined {
    return this.field("expression");
  }

  private nameField(): Node | undefined {
    return this.kind === "ImportSpecifier" || this.kind === "ExportSpecifier"
      ? (this.field("propertyName") ?? this.field("name"))
      : this.field("name");
  }

  getNameNode(): Node {
    const node = this.nameField();
    if (!node) {
      throw new Error(`${this.kind} has no name.`);
    }
    return node;
  }

  getName(): string {
    if (this.kind === "Identifier" || this.kind === "PrivateIdentifier") {
      return this.value;
    }
    return this.nameField()?.getText() ?? "";
  }

  getAliasNode(): Node | undefined {
    return this.field("propertyName") ? this.field("name") : undefined;
  }

  getPropertyNameNode(): Node | undefined {
    return this.field("propertyName");
  }

  getInitializer(): Node | undefined {
    return this.field("initializer");
  }

  getInitializerOrThrow(): Node {
    const initializer = this.field("initializer");
    if (!initializer) {
      throw new Error(`${this.kind} has no initializer.`);
    }
    return initializer;
  }

  getArguments(): Node[] {
    return this.list("arguments");
  }

  getTypeArguments(): Node[] {
    return this.list("typeArguments");
  }

  getProperties(): Node[] {
    return this.list("properties");
  }

  getElements(): Node[] {
    return this.list("elements");
  }

  getAttributes(): Node[] {
    return this.field("attributes")?.list("properties") ?? EMPTY;
  }

  getAttribute(name: string): Node | undefined {
    return this.getAttributes().find(
      (attribute) =>
        attribute.kind === "JsxAttribute" &&
        attribute.field("name")?.getText() === name
    );
  }

  getTagNameNode(): Node {
    const tag = this.field("tagName");
    if (!tag) {
      throw new Error(`${this.kind} has no tag name.`);
    }
    return tag;
  }

  getLeft(): Node {
    const left = this.field("left");
    if (!left) {
      throw new Error(`${this.kind} has no left side.`);
    }
    return left;
  }

  getRight(): Node {
    const right = this.field("right");
    if (!right) {
      throw new Error(`${this.kind} has no right side.`);
    }
    return right;
  }

  getOperatorText(): string {
    return this.value;
  }

  getCondition(): Node | undefined {
    return this.field("condition");
  }

  getWhenTrue(): Node {
    const node = this.field("whenTrue");
    if (!node) {
      throw new Error(`${this.kind} has no true branch.`);
    }
    return node;
  }

  getWhenFalse(): Node {
    const node = this.field("whenFalse");
    if (!node) {
      throw new Error(`${this.kind} has no false branch.`);
    }
    return node;
  }

  getTypeNode(): Node | undefined {
    return this.field("type");
  }

  getTypeName(): Node {
    const name = this.field("typeName");
    if (!name) {
      throw new Error(`${this.kind} has no type name.`);
    }
    return name;
  }

  getLiteral(): Node {
    const literal = this.field("literal");
    if (!literal) {
      throw new Error(`${this.kind} has no literal.`);
    }
    return literal;
  }

  getArgument(): Node {
    const argument = this.field("argument");
    if (!argument) {
      throw new Error(`${this.kind} has no argument.`);
    }
    return argument;
  }

  getBody(): Node | undefined {
    return this.field("body");
  }

  getParameters(): Node[] {
    return this.list("parameters");
  }

  getDeclarations(): Node[] {
    if (this.kind === "VariableStatement") {
      return this.field("declarationList")?.list("declarations") ?? EMPTY;
    }
    return this.list("declarations");
  }

  getDeclarationList(): Node | undefined {
    return this.field("declarationList");
  }

  getDeclarationKind(): string {
    return this.value;
  }

  getDotDotDotToken(): Node | undefined {
    return this.has(NodeFlags.DotDotDot) ? this : undefined;
  }

  // Imports and exports.

  getImportDeclarations(): NodeOf<"ImportDeclaration">[] {
    return ofKind(this.getStatements(), "ImportDeclaration");
  }

  getExportDeclarations(): NodeOf<"ExportDeclaration">[] {
    return ofKind(this.getStatements(), "ExportDeclaration");
  }

  /** An import's module specifier. Throws on `export { a }` with no `from`. */
  getModuleSpecifier(): NodeOf<"StringLiteral"> {
    const specifier = this.getModuleSpecifierIfExists();
    if (!specifier) {
      throw new Error(`${this.kind} has no module specifier.`);
    }
    return specifier;
  }

  /** The module specifier of an export, which may have none. */
  getModuleSpecifierIfExists(): NodeOf<"StringLiteral"> | undefined {
    const specifier = this.field("moduleSpecifier");
    return isKind(specifier, "StringLiteral") ? specifier : undefined;
  }

  getModuleSpecifierValue(): string {
    const specifier = this.field("moduleSpecifier");
    return specifier?.kind === "StringLiteral" ? specifier.value : "";
  }

  getImportClause(): Node | undefined {
    return this.field("importClause");
  }

  getNamedBindings(): Node | undefined {
    return this.field("namedBindings");
  }

  getNamedImports(): NodeOf<"ImportSpecifier">[] {
    const bindings = this.field("importClause")?.field("namedBindings");
    return bindings?.kind === "NamedImports"
      ? ofKind(bindings.list("elements"), "ImportSpecifier")
      : [];
  }

  getDefaultImport(): Node | undefined {
    return this.field("importClause")?.field("name");
  }

  getNamespaceImport(): NodeOf<"Identifier"> | undefined {
    const bindings = this.field("importClause")?.field("namedBindings");
    const name =
      bindings?.kind === "NamespaceImport" ? bindings.field("name") : undefined;
    return isKind(name, "Identifier") ? name : undefined;
  }

  getNamedExports(): NodeOf<"ExportSpecifier">[] {
    const clause = this.field("exportClause");
    return clause?.kind === "NamedExports"
      ? ofKind(clause.list("elements"), "ExportSpecifier")
      : [];
  }

  hasNamedExports(): boolean {
    return this.field("exportClause")?.kind === "NamedExports";
  }

  getImportDeclaration(): NodeOf<"ImportDeclaration"> {
    const declaration = this.getFirstAncestorByKind("ImportDeclaration");
    if (!declaration) {
      throw new Error(`${this.kind} is not inside an import declaration.`);
    }
    return declaration;
  }

  isTypeOnly(): boolean {
    if (this.kind === "ImportDeclaration") {
      return this.field("importClause")?.has(NodeFlags.TypeOnly) ?? false;
    }
    return this.has(NodeFlags.TypeOnly);
  }

  // Literals.

  getLiteralText(): string {
    return this.value;
  }

  getLiteralValue(): string {
    return this.value;
  }

  /** Replace a string literal's contents. Like ts-morph, it does not escape. */
  setLiteralValue(value: string): this {
    this.applyChanges([
      { end: this.end - 1, start: this.start + 1, text: value },
    ]);
    return this;
  }

  // Symbols and types.

  getSymbol(): SyntaxSymbol | undefined {
    this.ensureBound();
    return this.symbol ?? this.field("name")?.symbol;
  }

  getValueSymbol(): SyntaxSymbol | undefined {
    this.ensureBound();
    return this.valueSymbol;
  }

  getShorthandAssignmentValueSymbol(): SyntaxSymbol | undefined {
    return this.getValueSymbol();
  }

  // eslint-disable-next-line class-methods-use-this -- ts-morph's Node API.
  getProject(): SyntaxProjectView {
    return new SyntaxProjectView();
  }

  getType(): SyntacticType {
    return new SyntacticType(isObjectValue(this, 0));
  }

  /** Identifiers in this file that refer to the same declaration. */
  findReferencesAsNodes(): Node[] {
    const symbol = this.getSymbol();
    if (!symbol) {
      return EMPTY;
    }
    const isDefinition = (reference: Node): boolean =>
      symbol.declarations.some(
        (declaration) => declaration.field("name") === reference
      );
    return [...symbol.references]
      .toSorted((left, right) => left.start - right.start)
      .filter(
        (reference, index) =>
          symbol.alias || index > 0 || !isDefinition(reference)
      );
  }

  // Edits. Nodes an edit does not touch keep working afterwards.

  /** Apply text changes to this node's file and update the tree in place. */
  applyChanges(changes: TextChange[]): void {
    const root = this.getSourceFile();
    const file = root.source();
    const sorted = [...changes].toSorted(
      (left, right) => left.start - right.start || left.end - right.end
    );
    let text = "";
    let cursor = 0;
    for (const change of sorted) {
      text += file.text.slice(cursor, change.start) + change.text;
      cursor = change.end;
    }
    text += file.text.slice(cursor);
    const parsed = file.reparse(text, file.path);
    adoptTree(root, parsed, sorted);
    file.text = text;
    file.bound = false;
  }

  /**
   * Replace this node's text. On a source file, replaces the whole file and
   * keeps the nodes outside the changed span. Returns the node now at this
   * position.
   */
  replaceWithText(text: string): Node {
    const root = this.getSourceFile();
    if (this === root) {
      const old = root.source().text;
      let prefix = 0;
      const limit = Math.min(old.length, text.length);
      while (prefix < limit && old[prefix] === text[prefix]) {
        prefix += 1;
      }
      let suffix = 0;
      while (
        suffix < limit - prefix &&
        old[old.length - 1 - suffix] === text[text.length - 1 - suffix]
      ) {
        suffix += 1;
      }
      root.applyChanges([
        {
          end: old.length - suffix,
          start: prefix,
          text: text.slice(prefix, text.length - suffix),
        },
      ]);
      return root;
    }
    const start = this.getStart(true);
    root.applyChanges([{ end: this.end, start, text }]);
    const end = start + text.length;
    return (
      preorder(root, false).find(
        (node) => node.start === start && node.end === end
      ) ?? root
    );
  }

  insertText(position: number, text: string): this {
    this.applyChanges([{ end: position, start: position, text }]);
    return this;
  }

  /** Insert statements at an index of the statements and comments. */
  insertStatements(index: number, text: string): void {
    const siblings = syntaxChildren(this, "statements");
    const at = Math.min(index, siblings.length);
    const previous = siblings[at - 1];
    if (!previous) {
      if (this.kind !== "SourceFile") {
        throw new Error(`Cannot insert at the start of a ${this.kind}.`);
      }
      this.applyChanges([
        { end: 0, start: 0, text: text.endsWith("\n") ? text : `${text}\n` },
      ]);
      return;
    }
    this.applyChanges([
      { end: previous.end, start: previous.end, text: `\n${text}` },
    ]);
  }

  /** Add named imports to an import declaration. */
  addNamedImports(names: string[]): void {
    if (names.length === 0) {
      return;
    }
    const list = names.join(", ");
    const named = this.getNamedImports();
    const clause = this.field("importClause");
    const last = named.at(-1);
    if (!last) {
      const bindings = clause?.field("namedBindings");
      const defaultImport = clause?.field("name");
      if (!clause) {
        const at = this.start + "import".length;
        this.applyChanges([{ end: at, start: at, text: ` { ${list} } from` }]);
      } else if (bindings?.kind === "NamespaceImport") {
        throw new Error(
          "Cannot add a named import to an import declaration that has a namespace import."
        );
      } else if (bindings) {
        this.applyChanges([
          { end: bindings.end, start: bindings.start, text: `{ ${list} }` },
        ]);
      } else if (defaultImport) {
        this.applyChanges([
          {
            end: defaultImport.end,
            start: defaultImport.end,
            text: `, { ${list} }`,
          },
        ]);
      }
      return;
    }
    const { text } = this.source();
    const trailing = (node: Node): string =>
      text.slice(node.end, trailingCommentsEnd(text, node.end));
    const next = last.getNextSibling();
    const prefix =
      next?.kind === "CommaToken"
        ? `${trailing(last)},${trailing(next)}`
        : `,${trailing(last)}`;
    const close = (last.parent?.end ?? last.end) - 1;
    this.applyChanges([
      { end: close, start: last.end, text: `${prefix} ${list} ` },
    ]);
  }

  /** Remove this node and the whitespace around it, as ts-morph does. */
  remove(): void {
    if (this.kind === "ImportSpecifier") {
      const declaration = this.getImportDeclaration();
      const defaultImport = declaration.getDefaultImport();
      const bindings = declaration.getImportClause()?.getNamedBindings();
      if (declaration.getNamedImports().length > 1 || !defaultImport) {
        this.removeCommaSeparated();
        return;
      }
      const { text } = this.source();
      this.applyChanges([
        {
          end: bindings?.end ?? this.end,
          start: getNextNonWhitespacePos(text, defaultImport.end),
          text: "",
        },
      ]);
      return;
    }
    const name = this.listName();
    if (name === "statements" || isComment(this)) {
      this.removeStatement();
      return;
    }
    if (name !== undefined && COMMA_LISTS.has(name)) {
      this.removeCommaSeparated();
      return;
    }
    throw new Error(`Removing a ${this.kind} is not supported.`);
  }

  private removeChildren(
    children: Node[],
    removePrecedingSpaces: boolean,
    removeFollowingSpaces: boolean,
    removePrecedingNewLines: boolean,
    removeFollowingNewLines: boolean
  ): void {
    const [first] = children;
    const last = children.at(-1);
    if (!first || !last) {
      return;
    }
    const { text } = this.source();
    let start = first.getNonWhitespaceStart();
    if (removePrecedingSpaces || removePrecedingNewLines) {
      start = getPreviousMatchingPos(
        text,
        start,
        removalCondition(removePrecedingNewLines, removePrecedingSpaces)
      );
    }
    let { end } = last;
    if (removeFollowingSpaces || removeFollowingNewLines) {
      end = getNextMatchingPos(
        text,
        end,
        removalCondition(removeFollowingNewLines, removeFollowingSpaces)
      );
    }
    this.applyChanges([{ end, start, text: "" }]);
  }

  private removeCommaSeparated(): void {
    const siblings = this.siblings();
    const index = siblings.indexOf(this);
    const toRemove: Node[] = [this];
    const isFirst = siblings[0] === this;
    const next = siblings[index + 1];
    if (next?.kind === "CommaToken") {
      toRemove.push(next);
    }
    const previous = siblings[index - 1];
    if (
      siblings.at(-1) === toRemove.at(-1) &&
      previous?.kind === "CommaToken"
    ) {
      toRemove.unshift(previous);
    }
    this.removeChildren(
      toRemove,
      !isFirst ||
        (siblings.length === toRemove.length && this.isFirstNodeOnLine()),
      isFirst,
      !isFirst,
      isFirst
    );
  }

  private removeStatement(): void {
    const { parent } = this;
    if (!parent) {
      throw new Error(`${this.kind} has no parent.`);
    }
    const { text } = this.source();
    const previous = this.getPreviousSibling();
    const next = this.getNextSibling();
    const trailingEnd = this.getTrailingTriviaEnd();

    let removalPos: number;
    if (previous) {
      const previousEnd = previous.getTrailingTriviaEnd();
      removalPos = isNewLineAtPos(text, previousEnd)
        ? previousEnd
        : previous.end;
    } else {
      const firstPos = getPreviousNonWhitespacePos(text, this.pos);
      removalPos =
        parent.pos === firstPos || !this.isFirstNodeOnLine()
          ? this.getNonWhitespaceStart()
          : firstPos;
    }

    let removalEnd: number;
    if (previous && next) {
      removalEnd = getPosAtStartOfLineOrNonWhitespace(
        text,
        next.getNonWhitespaceStart()
      );
    } else if (parent.end === this.end) {
      removalEnd = this.end;
    } else if (isNewLineAtPos(text, trailingEnd)) {
      removalEnd =
        !previous && this.pos === 0
          ? getPosAtNextNonBlankLine(text, trailingEnd)
          : getPosAtEndOfPreviousLine(
              text,
              getPosAtNextNonBlankLine(text, trailingEnd)
            );
    } else {
      removalEnd = previous ? this.end : trailingEnd;
    }

    let spacing = "";
    if (previous && next) {
      spacing =
        hasBlankLineFormatting(previous) || hasBlankLineFormatting(next)
          ? "\n\n"
          : "\n";
    }
    this.applyChanges([{ end: removalEnd, start: removalPos, text: spacing }]);
  }
}

// The key an old node would have in the new tree, or undefined when an edit
// overlaps it. `zeroWidthAtEnd` also counts an insertion right at the node's
// end as part of it.
const mappedKey = (
  node: Node,
  changes: TextChange[],
  zeroWidthAtEnd: boolean
): string | undefined => {
  const { start, end } = node;
  let mappedStart = start;
  let mappedEnd = end;
  for (const change of changes) {
    const crosses =
      (change.start < start && change.end > start) ||
      (change.start < end && change.end > end);
    const covers =
      change.start <= start && change.end >= end && change.end > change.start;
    if (crosses || covers) {
      return undefined;
    }
    const delta = change.text.length - (change.end - change.start);
    if (change.end <= start) {
      mappedStart += delta;
    }
    if (
      change.end < end ||
      (change.end === end && change.start < end) ||
      (zeroWidthAtEnd && change.end === end && change.start === end)
    ) {
      mappedEnd += delta;
    }
  }
  return `${node.kind}:${mappedStart}:${mappedEnd}`;
};

const enqueue = (map: Map<string, Node[]>, key: string, node: Node): void => {
  const queue = map.get(key);
  if (queue) {
    queue.push(node);
  } else {
    map.set(key, [node]);
  }
};

const takeUnused = (
  map: Map<string, Node[]>,
  key: string
): Node | undefined => {
  const queue = map.get(key);
  if (!queue) {
    return undefined;
  }
  while (queue.length > 0) {
    const node = queue.shift();
    if (node && !node.adopted) {
      return node;
    }
  }
  return undefined;
};

/**
 * Move a reparsed tree into the old one. Old nodes the changes did not touch
 * take the place of their new counterparts, so references to them stay
 * valid; the rest are forgotten.
 */
const adoptTree = (root: Node, parsed: Node, changes: TextChange[]): void => {
  const oldNodes = preorder(root, false);
  const primary = new Map<string, Node[]>();
  const fallback = new Map<string, Node[]>();
  for (const node of oldNodes) {
    const key = mappedKey(node, changes, false);
    if (key !== undefined) {
      enqueue(primary, key, node);
    }
    const loose = mappedKey(node, changes, true);
    if (loose !== undefined && loose !== key) {
      enqueue(fallback, loose, node);
    }
  }

  const newNodes = preorder(parsed, false);
  parsed.adopted = root;
  for (const node of newNodes) {
    const key = `${node.kind}:${node.start}:${node.end}`;
    const match = takeUnused(primary, key) ?? takeUnused(fallback, key);
    if (match) {
      match.adopted = node;
      node.adopted = match;
    } else {
      node.adopted = node;
    }
  }

  for (const node of [parsed, ...newNodes]) {
    const canonical = node.adopted ?? node;
    canonical.pos = node.pos;
    canonical.start = node.start;
    canonical.end = node.end;
    canonical.flags = node.flags;
    canonical.value = node.value;
    const fields = new Map<string, Node>();
    for (const name of node.fields.keys()) {
      const child = node.fields.get(name);
      if (child) {
        fields.set(name, child.adopted ?? child);
      }
    }
    const lists = new Map<string, Node[]>();
    for (const name of node.lists.keys()) {
      lists.set(
        name,
        node.list(name).map((child) => child.adopted ?? child)
      );
    }
    canonical.fields = fields;
    canonical.lists = lists;
    canonical.jsDocs = node.jsDocs.map((jsDoc) => jsDoc.adopted ?? jsDoc);
    canonical.symbol = undefined;
    canonical.valueSymbol = undefined;
    canonical.forgotten = false;
  }
  for (const node of [parsed, ...newNodes]) {
    const target = node.adopted ?? node;
    target.link();
  }
  root.parent = undefined;

  for (const node of oldNodes) {
    if (!node.adopted) {
      node.forgotten = true;
    }
    node.adopted = undefined;
  }
  for (const node of newNodes) {
    node.adopted = undefined;
  }
  parsed.adopted = undefined;
};
