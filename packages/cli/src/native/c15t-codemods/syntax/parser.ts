/* eslint-disable no-bitwise, oxc/bad-bitwise-operator -- Node and context flags are bit sets, as in the TypeScript parser. */
/* eslint-disable complexity -- Parse methods follow the TypeScript parser's case analysis. */
/* eslint-disable prefer-named-capture-group -- Scriptc reads regex captures by index. */

// Parser for TypeScript, TSX and JavaScript. It follows the structure of the
// TypeScript compiler's parser so node kinds, positions and ambiguity rules
// match what ts-morph reports. Unlike the compiler it throws on the first
// syntax error instead of recovering. JSDoc comments become JSDoc nodes with
// their tags and `{type}` expressions; tag names and descriptions are not
// parsed.

import { bindSourceFile } from "./binder.ts";
import { Node, NodeFlags, SourceText } from "./node.ts";
import type { NodeOf } from "./node.ts";
import { Scanner, Token, syntaxError } from "./scanner.ts";

const Tristate = { False: 0, True: 1, Unknown: 2 } as const;

const RESERVED_WORDS = new Set([
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "new",
  "null",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
]);

const modifierFlag = (word: string): number => {
  switch (word) {
    case "abstract": {
      return NodeFlags.Abstract;
    }
    case "accessor": {
      return NodeFlags.Accessor;
    }
    case "async": {
      return NodeFlags.Async;
    }
    case "const": {
      return NodeFlags.Const;
    }
    case "declare": {
      return NodeFlags.Declare;
    }
    case "default": {
      return NodeFlags.Default;
    }
    case "export": {
      return NodeFlags.Export;
    }
    case "in": {
      return NodeFlags.In;
    }
    case "out": {
      return NodeFlags.Out;
    }
    case "override": {
      return NodeFlags.Override;
    }
    case "private": {
      return NodeFlags.Private;
    }
    case "protected": {
      return NodeFlags.Protected;
    }
    case "public": {
      return NodeFlags.Public;
    }
    case "readonly": {
      return NodeFlags.Readonly;
    }
    case "static": {
      return NodeFlags.Static;
    }
    default: {
      return NodeFlags.None;
    }
  }
};

const KEYWORD_TYPES = new Map([
  ["any", "AnyKeyword"],
  ["bigint", "BigIntKeyword"],
  ["boolean", "BooleanKeyword"],
  ["never", "NeverKeyword"],
  ["number", "NumberKeyword"],
  ["object", "ObjectKeyword"],
  ["string", "StringKeyword"],
  ["symbol", "SymbolKeyword"],
  ["undefined", "UndefinedKeyword"],
  ["unknown", "UnknownKeyword"],
]);

const ASSIGNMENT_OPERATORS = new Set([
  "=",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "**=",
  "<<=",
  ">>=",
  ">>>=",
  "&=",
  "|=",
  "^=",
  "&&=",
  "||=",
  "??=",
]);

// Reserved words that can start a type.
const TYPE_START_WORDS = new Set([
  "false",
  "function",
  "import",
  "new",
  "null",
  "this",
  "true",
  "typeof",
  "void",
]);

/** A modifier list: decorators as nodes, keywords as flags. */
interface Modifiers {
  decorators: Node[];
  flags: number;
}

const LITERAL_KEYWORD_KINDS = new Map([
  ["false", "FalseKeyword"],
  ["null", "NullKeyword"],
  ["true", "TrueKeyword"],
]);

/** A node that starts where `first` does. */
const startAt = (kind: string, first: Node): Node =>
  new Node(kind, first.pos, first.start);

const applyModifiers = (node: Node, modifiers?: Modifiers): void => {
  if (modifiers) {
    node.flags |= modifiers.flags;
    if (modifiers.decorators.length > 0) {
      node.setList("modifiers", modifiers.decorators);
    }
  }
};

class Parser {
  scanner: Scanner;
  javascript: boolean;
  disallowIn = false;
  disallowConditionalTypes = false;
  inDecorator = false;
  inAwait = true;
  inYield = false;
  // Start offsets known not to begin a parenthesized arrow function.
  notArrow = new Set<number>();

  constructor(text: string, path: string) {
    const lower = path.toLowerCase();
    const typeScriptOnly =
      lower.endsWith(".ts") || lower.endsWith(".mts") || lower.endsWith(".cts");
    this.javascript =
      lower.endsWith(".js") ||
      lower.endsWith(".jsx") ||
      lower.endsWith(".mjs") ||
      lower.endsWith(".cjs");
    this.scanner = new Scanner(text, !typeScriptOnly);
  }

  // Tokens.

  token(): string {
    return this.scanner.token;
  }

  next(): string {
    return this.scanner.next();
  }

  is(word: string): boolean {
    return this.scanner.token === Token.Name && this.scanner.value === word;
  }

  isPunct(token: string): boolean {
    return this.scanner.token === token;
  }

  fail(message: string): Error {
    return syntaxError(message, this.scanner.tokenStart);
  }

  expect(token: string): void {
    if (this.scanner.token !== token) {
      throw this.fail(`'${token}' expected`);
    }
    this.next();
  }

  expectWord(word: string): void {
    if (!this.is(word)) {
      throw this.fail(`'${word}' expected`);
    }
    this.next();
  }

  optional(token: string): boolean {
    if (this.scanner.token === token) {
      this.next();
      return true;
    }
    return false;
  }

  optionalWord(word: string): boolean {
    if (this.is(word)) {
      this.next();
      return true;
    }
    return false;
  }

  isName(): boolean {
    return this.scanner.token === Token.Name;
  }

  isIdentifier(): boolean {
    if (this.scanner.token !== Token.Name) {
      return false;
    }
    const word = this.scanner.value;
    if (word === "yield" && this.inYield) {
      return false;
    }
    if (word === "await" && this.inAwait) {
      return false;
    }
    return !RESERVED_WORDS.has(word);
  }

  isModifierWord(): boolean {
    return this.isName() && modifierFlag(this.scanner.value) !== NodeFlags.None;
  }

  isLiteralPropertyName(): boolean {
    const token = this.token();
    return (
      token === Token.Name ||
      token === Token.String ||
      token === Token.Number ||
      token === Token.BigInt
    );
  }

  canParseSemicolon(): boolean {
    const token = this.token();
    return (
      token === ";" ||
      token === "}" ||
      token === Token.Eof ||
      this.scanner.lineBreak
    );
  }

  parseSemicolon(): void {
    if (!this.canParseSemicolon()) {
      throw this.fail("';' expected");
    }
    this.optional(";");
  }

  // Speculation.

  lookAhead(check: () => boolean): boolean {
    const state = this.scanner.save();
    const savedDisallowIn = this.disallowIn;
    const savedInAwait = this.inAwait;
    const savedInYield = this.inYield;
    try {
      return check();
    } catch {
      return false;
    } finally {
      this.scanner.restore(state);
      this.disallowIn = savedDisallowIn;
      this.inAwait = savedInAwait;
      this.inYield = savedInYield;
    }
  }

  lookAheadTristate(check: () => number): number {
    const state = this.scanner.save();
    try {
      return check();
    } catch {
      return Tristate.False;
    } finally {
      this.scanner.restore(state);
    }
  }

  tryParse<ResultType>(
    parse: () => ResultType | undefined
  ): ResultType | undefined {
    const state = this.scanner.save();
    const savedDisallowIn = this.disallowIn;
    const savedDisallowConditionalTypes = this.disallowConditionalTypes;
    const savedInAwait = this.inAwait;
    const savedInYield = this.inYield;
    let result: ResultType | undefined;
    try {
      result = parse();
    } catch {
      result = undefined;
    }
    if (result === undefined) {
      this.scanner.restore(state);
      this.disallowIn = savedDisallowIn;
      this.disallowConditionalTypes = savedDisallowConditionalTypes;
      this.inAwait = savedInAwait;
      this.inYield = savedInYield;
    }
    return result;
  }

  nextIsOnSameLine(check: () => boolean): boolean {
    return this.lookAhead(() => {
      this.next();
      return !this.scanner.lineBreak && check();
    });
  }

  // Context.

  allowIn<ResultType>(parse: () => ResultType): ResultType {
    const saved = this.disallowIn;
    this.disallowIn = false;
    try {
      return parse();
    } finally {
      this.disallowIn = saved;
    }
  }

  withDisallowIn<ResultType>(parse: () => ResultType): ResultType {
    const saved = this.disallowIn;
    this.disallowIn = true;
    try {
      return parse();
    } finally {
      this.disallowIn = saved;
    }
  }

  withConditionalTypes<ResultType>(
    disallow: boolean,
    parse: () => ResultType
  ): ResultType {
    const saved = this.disallowConditionalTypes;
    this.disallowConditionalTypes = disallow;
    try {
      return parse();
    } finally {
      this.disallowConditionalTypes = saved;
    }
  }

  withFunctionContext<ResultType>(
    isAsync: boolean,
    isGenerator: boolean,
    parse: () => ResultType
  ): ResultType {
    const savedInAwait = this.inAwait;
    const savedInYield = this.inYield;
    const savedInDecorator = this.inDecorator;
    this.inAwait = isAsync;
    this.inYield = isGenerator;
    this.inDecorator = false;
    try {
      return parse();
    } finally {
      this.inAwait = savedInAwait;
      this.inYield = savedInYield;
      this.inDecorator = savedInDecorator;
    }
  }

  // Nodes.

  start(kind: string): Node {
    return new Node(kind, this.scanner.tokenFullStart, this.scanner.tokenStart);
  }

  finish(node: Node): Node {
    node.end = this.scanner.lastTokenEnd;
    // TypeScript starts an empty node at its full start.
    if (node.end === node.pos) {
      node.start = node.pos;
    }
    node.link();
    return node;
  }

  /** A node for the current token. */
  tokenNode(kind: string): Node {
    const node = this.start(kind);
    node.value = this.scanner.value;
    this.next();
    return this.finish(node);
  }

  delimited(close: string, parseElement: () => Node): Node[] {
    const list: Node[] = [];
    while (this.token() !== close) {
      list.push(parseElement());
      if (!this.optional(",")) {
        break;
      }
    }
    return list;
  }

  bracketed(open: string, close: string, parseElement: () => Node): Node[] {
    this.expect(open);
    const list = this.delimited(close, parseElement);
    this.expect(close);
    return list;
  }

  bracketedAllowIn(
    open: string,
    close: string,
    parseElement: () => Node
  ): Node[] {
    return this.allowIn(() => this.bracketed(open, close, parseElement));
  }

  // Names.

  parseIdentifier(): Node {
    if (!this.isIdentifier()) {
      throw this.fail("Identifier expected");
    }
    return this.tokenNode("Identifier");
  }

  parseIdentifierName(): Node {
    if (!this.isName()) {
      throw this.fail("Identifier expected");
    }
    return this.tokenNode("Identifier");
  }

  parseRightSideOfDot(allowPrivate: boolean): Node {
    if (allowPrivate && this.token() === Token.PrivateName) {
      return this.tokenNode("PrivateIdentifier");
    }
    return this.parseIdentifierName();
  }

  parseEntityName(allowReservedWords: boolean): Node {
    let entity = allowReservedWords
      ? this.parseIdentifierName()
      : this.parseIdentifier();
    while (this.isPunct(".")) {
      const node = startAt("QualifiedName", entity);
      this.next();
      node.set("left", entity);
      node.set("right", this.parseIdentifierName());
      entity = this.finish(node);
    }
    return entity;
  }

  parseLiteral(): Node {
    switch (this.token()) {
      case Token.String: {
        return this.tokenNode("StringLiteral");
      }
      case Token.Number: {
        return this.tokenNode("NumericLiteral");
      }
      case Token.BigInt: {
        return this.tokenNode("BigIntLiteral");
      }
      case Token.NoSubstitutionTemplate: {
        return this.tokenNode("NoSubstitutionTemplateLiteral");
      }
      default: {
        throw this.fail("Literal expected");
      }
    }
  }

  parsePropertyName(): Node {
    const token = this.token();
    if (
      token === Token.String ||
      token === Token.Number ||
      token === Token.BigInt
    ) {
      return this.parseLiteral();
    }
    if (token === Token.PrivateName) {
      return this.tokenNode("PrivateIdentifier");
    }
    if (token === "[") {
      const node = this.start("ComputedPropertyName");
      this.next();
      node.set(
        "expression",
        this.allowIn(() => this.parseExpression())
      );
      this.expect("]");
      return this.finish(node);
    }
    return this.parseIdentifierName();
  }

  parseModuleExportName(): Node {
    return this.token() === Token.String
      ? this.parseLiteral()
      : this.parseIdentifierName();
  }

  // Source file and statements.

  parseSourceFile(): NodeOf<"SourceFile"> {
    this.scanner.scan();
    const node = new Node("SourceFile", 0, this.scanner.tokenStart);
    const statements: Node[] = [];
    while (this.token() !== Token.Eof) {
      statements.push(this.parseStatement());
    }
    node.setList("statements", statements);
    node.end = this.scanner.text.length;
    node.link();
    // SAFETY: The node was created with the SourceFile kind above.
    return node as NodeOf<"SourceFile">;
  }

  parseStatementList(close: string): Node[] {
    const statements: Node[] = [];
    while (this.token() !== close) {
      if (this.token() === Token.Eof) {
        throw this.fail(`'${close}' expected`);
      }
      statements.push(this.parseStatement());
    }
    return statements;
  }

  parseBlock(): Node {
    const node = this.start("Block");
    this.expect("{");
    node.setList("statements", this.parseStatementList("}"));
    this.expect("}");
    return this.finish(node);
  }

  parseFunctionBlock(isAsync: boolean, isGenerator: boolean): Node {
    return this.withFunctionContext(isAsync, isGenerator, () =>
      this.allowIn(() => this.parseBlock())
    );
  }

  parseFunctionBlockOrSemicolon(
    isAsync: boolean,
    isGenerator: boolean
  ): Node | undefined {
    if (this.token() !== "{" && this.canParseSemicolon()) {
      this.parseSemicolon();
      return undefined;
    }
    return this.parseFunctionBlock(isAsync, isGenerator);
  }

  parseStatement(): Node {
    const token = this.token();
    if (token === ";") {
      return this.tokenNode("EmptyStatement");
    }
    if (token === "{") {
      return this.parseBlock();
    }
    if (token === "@") {
      return this.parseDeclaration();
    }
    if (token === Token.Name) {
      const statement = this.parseKeywordStatement(this.scanner.value);
      if (statement) {
        return statement;
      }
    }
    return this.parseExpressionOrLabeledStatement();
  }

  parseKeywordStatement(word: string): Node | undefined {
    switch (word) {
      case "var": {
        return this.parseVariableStatement(this.start("VariableStatement"));
      }
      case "let": {
        return this.isLetDeclaration()
          ? this.parseVariableStatement(this.start("VariableStatement"))
          : undefined;
      }
      case "await": {
        return this.isAwaitUsingDeclaration()
          ? this.parseVariableStatement(this.start("VariableStatement"))
          : undefined;
      }
      case "using": {
        return this.isUsingDeclaration()
          ? this.parseVariableStatement(this.start("VariableStatement"))
          : undefined;
      }
      case "function": {
        return this.parseFunctionDeclaration(this.start("FunctionDeclaration"));
      }
      case "class": {
        return this.parseClass(this.start("ClassDeclaration"));
      }
      case "if": {
        return this.parseIfStatement();
      }
      case "do": {
        return this.parseDoStatement();
      }
      case "while": {
        return this.parseWhileStatement();
      }
      case "for": {
        return this.parseForStatement();
      }
      case "continue": {
        return this.parseBreakOrContinue("ContinueStatement");
      }
      case "break": {
        return this.parseBreakOrContinue("BreakStatement");
      }
      case "return": {
        return this.parseReturnStatement();
      }
      case "with": {
        return this.parseWithStatement();
      }
      case "switch": {
        return this.parseSwitchStatement();
      }
      case "throw": {
        return this.parseThrowStatement();
      }
      case "try": {
        return this.parseTryStatement();
      }
      case "debugger": {
        const node = this.start("DebuggerStatement");
        this.next();
        this.parseSemicolon();
        return this.finish(node);
      }
      case "async":
      case "interface":
      case "type":
      case "module":
      case "namespace":
      case "declare":
      case "const":
      case "enum":
      case "export":
      case "import":
      case "private":
      case "protected":
      case "public":
      case "abstract":
      case "accessor":
      case "static":
      case "readonly":
      case "global": {
        return this.lookAhead(() => this.isDeclaration())
          ? this.parseDeclaration()
          : undefined;
      }
      default: {
        return undefined;
      }
    }
  }

  isLetDeclaration(): boolean {
    return this.lookAhead(() => {
      this.next();
      return this.isIdentifier() || this.isPunct("{") || this.isPunct("[");
    });
  }

  isUsingDeclaration(): boolean {
    return this.nextIsOnSameLine(() => this.isIdentifier() && !this.is("of"));
  }

  isAwaitUsingDeclaration(): boolean {
    return this.lookAhead(() => {
      this.next();
      if (this.scanner.lineBreak || !this.is("using")) {
        return false;
      }
      this.next();
      return !this.scanner.lineBreak && this.isIdentifier();
    });
  }

  /** Whether the tokens from here start a declaration. Runs in a lookahead. */
  isDeclaration(): boolean {
    while (true) {
      if (this.token() === "@") {
        return true;
      }
      if (!this.isName()) {
        return false;
      }
      const word = this.scanner.value;
      switch (word) {
        case "var":
        case "let":
        case "const":
        case "function":
        case "class":
        case "enum": {
          return true;
        }
        case "using": {
          return this.isUsingDeclaration();
        }
        case "await": {
          return this.isAwaitUsingDeclaration();
        }
        case "interface":
        case "type": {
          return this.nextIsOnSameLine(() => this.isIdentifier());
        }
        case "module":
        case "namespace": {
          return this.nextIsOnSameLine(
            () => this.isIdentifier() || this.token() === Token.String
          );
        }
        case "abstract":
        case "accessor":
        case "async":
        case "declare":
        case "private":
        case "protected":
        case "public":
        case "readonly": {
          this.next();
          if (this.scanner.lineBreak) {
            return false;
          }
          if (word === "declare" && this.is("type")) {
            return true;
          }
          continue;
        }
        case "global": {
          this.next();
          return this.isPunct("{") || this.isIdentifier() || this.is("export");
        }
        case "import": {
          this.next();
          const token = this.token();
          return (
            token === Token.String ||
            token === "*" ||
            token === "{" ||
            this.isName()
          );
        }
        case "export": {
          this.next();
          let state = this.scanner.save();
          if (this.is("type")) {
            state = this.scanner.save();
            this.next();
          }
          const token = this.token();
          if (
            token === "=" ||
            token === "*" ||
            token === "{" ||
            token === "@" ||
            this.is("default") ||
            this.is("as")
          ) {
            return true;
          }
          this.scanner.restore(state);
          continue;
        }
        case "static": {
          this.next();
          continue;
        }
        default: {
          return false;
        }
      }
    }
  }

  parseDeclaration(): Node {
    const node = this.start("");
    const modifiers = this.parseModifiers(true, false, false);
    if (this.isName()) {
      switch (this.scanner.value) {
        case "var":
        case "let":
        case "const":
        case "using":
        case "await": {
          node.kind = "VariableStatement";
          return this.parseVariableStatement(node, modifiers);
        }
        case "function": {
          node.kind = "FunctionDeclaration";
          return this.parseFunctionDeclaration(node, modifiers);
        }
        case "class": {
          node.kind = "ClassDeclaration";
          return this.parseClass(node, modifiers);
        }
        case "interface": {
          return this.parseInterface(node, modifiers);
        }
        case "type": {
          return this.parseTypeAlias(node, modifiers);
        }
        case "enum": {
          return this.parseEnum(node, modifiers);
        }
        case "global":
        case "module":
        case "namespace": {
          return this.parseModuleDeclaration(node, modifiers);
        }
        case "import": {
          return this.parseImportDeclaration(node, modifiers);
        }
        case "export": {
          this.next();
          if (this.is("default") || this.isPunct("=")) {
            return this.parseExportAssignment(node, modifiers);
          }
          if (this.is("as")) {
            node.kind = "NamespaceExportDeclaration";
            this.next();
            this.expectWord("namespace");
            node.set("name", this.parseIdentifier());
            this.parseSemicolon();
            applyModifiers(node, modifiers);
            return this.finish(node);
          }
          return this.parseExportDeclaration(node, modifiers);
        }
        default: {
          break;
        }
      }
    }
    throw this.fail("Declaration expected");
  }

  // Modifiers.

  parseDecorator(): Node {
    const node = this.start("Decorator");
    this.expect("@");
    const saved = this.inDecorator;
    this.inDecorator = true;
    try {
      node.set("expression", this.parseLeftHandSideExpression());
    } finally {
      this.inDecorator = saved;
    }
    return this.finish(node);
  }

  canFollowModifier(): boolean {
    const token = this.token();
    return (
      token === "[" ||
      token === "{" ||
      token === "*" ||
      token === "..." ||
      token === Token.PrivateName ||
      this.isLiteralPropertyName()
    );
  }

  canFollowExportModifier(): boolean {
    return (
      this.isPunct("@") ||
      (!this.isPunct("*") &&
        !this.is("as") &&
        !this.isPunct("{") &&
        this.canFollowModifier())
    );
  }

  canFollowDefaultKeyword(): boolean {
    return (
      this.is("class") ||
      this.is("function") ||
      this.is("interface") ||
      this.isPunct("@") ||
      (this.is("abstract") && this.nextIsOnSameLine(() => this.is("class"))) ||
      (this.is("async") && this.nextIsOnSameLine(() => this.is("function")))
    );
  }

  /** After moving past `word`, whether it was a modifier. */
  canFollowModifierWord(word: string): boolean {
    switch (word) {
      case "const": {
        return this.is("enum");
      }
      case "export": {
        if (this.is("default")) {
          return this.lookAhead(() => {
            this.next();
            return this.canFollowDefaultKeyword();
          });
        }
        if (this.is("type")) {
          return this.lookAhead(() => {
            this.next();
            return this.canFollowExportModifier();
          });
        }
        return this.canFollowExportModifier();
      }
      case "default": {
        return this.canFollowDefaultKeyword();
      }
      case "static": {
        return this.canFollowModifier();
      }
      default: {
        return !this.scanner.lineBreak && this.canFollowModifier();
      }
    }
  }

  parseModifiers(
    allowDecorators: boolean,
    permitConst: boolean,
    stopOnStaticBlock: boolean
  ): Modifiers {
    const modifiers: Modifiers = { decorators: [], flags: NodeFlags.None };
    let seenStatic = false;
    while (true) {
      if (allowDecorators && this.isPunct("@")) {
        modifiers.decorators.push(this.parseDecorator());
        continue;
      }
      if (!this.isName()) {
        break;
      }
      const word = this.scanner.value;
      const flag = modifierFlag(word);
      if (
        flag === NodeFlags.None ||
        flag === NodeFlags.In ||
        flag === NodeFlags.Out
      ) {
        break;
      }
      if (word === "static" && seenStatic) {
        break;
      }
      const accepted =
        word === "const" && permitConst
          ? this.nextIsOnSameLine(() => this.canFollowModifier())
          : this.lookAhead(() => {
              this.next();
              return (
                !(
                  word === "static" &&
                  stopOnStaticBlock &&
                  this.isPunct("{")
                ) && this.canFollowModifierWord(word)
              );
            });
      if (!accepted) {
        break;
      }
      this.next();
      if (word === "static") {
        seenStatic = true;
      }
      modifiers.flags |= flag;
    }
    return modifiers;
  }

  /** Move past `get` or `set` when it starts an accessor. */
  parseAccessorKeyword(word: string): boolean {
    if (!this.is(word)) {
      return false;
    }
    const state = this.scanner.save();
    this.next();
    if (
      this.isPunct("[") ||
      this.token() === Token.PrivateName ||
      this.isLiteralPropertyName()
    ) {
      return true;
    }
    this.scanner.restore(state);
    return false;
  }

  // Variables.

  parseVariableStatement(node: Node, modifiers?: Modifiers): Node {
    const list = this.parseVariableDeclarationList(false);
    node.set("declarationList", list);
    node.value = list.value;
    this.parseSemicolon();
    applyModifiers(node, modifiers);
    return this.finish(node);
  }

  parseVariableDeclarationList(inForInitializer: boolean): Node {
    const node = this.start("VariableDeclarationList");
    if (this.is("await")) {
      this.next();
      this.expectWord("using");
      node.value = "await using";
    } else {
      node.value = this.scanner.value;
      this.next();
    }
    if (
      inForInitializer &&
      this.is("of") &&
      this.lookAhead(() => {
        this.next();
        if (!this.isIdentifier()) {
          return false;
        }
        this.next();
        return this.isPunct(")");
      })
    ) {
      node.setList("declarations", []);
      return this.finish(node);
    }
    const saved = this.disallowIn;
    this.disallowIn = inForInitializer;
    try {
      node.setList(
        "declarations",
        this.delimited("", () =>
          this.parseVariableDeclaration(!inForInitializer)
        )
      );
    } finally {
      this.disallowIn = saved;
    }
    return this.finish(node);
  }

  parseVariableDeclaration(allowExclamation: boolean): Node {
    const node = this.start("VariableDeclaration");
    const name = this.parseBindingNameOrPattern();
    node.set("name", name);
    if (
      allowExclamation &&
      name.kind === "Identifier" &&
      this.isPunct("!") &&
      !this.scanner.lineBreak
    ) {
      this.next();
      node.flags |= NodeFlags.Exclamation;
    }
    node.set("type", this.parseTypeAnnotation());
    if (!this.is("in") && !this.is("of")) {
      node.set("initializer", this.parseInitializer());
    }
    return this.finish(node);
  }

  parseBindingNameOrPattern(): Node {
    if (this.isPunct("[")) {
      return this.parseArrayBindingPattern();
    }
    if (this.isPunct("{")) {
      return this.parseObjectBindingPattern();
    }
    return this.parseIdentifier();
  }

  parseArrayBindingPattern(): Node {
    const node = this.start("ArrayBindingPattern");
    node.setList(
      "elements",
      this.bracketedAllowIn("[", "]", () => {
        if (this.isPunct(",")) {
          const omitted = this.start("OmittedExpression");
          return this.finish(omitted);
        }
        const element = this.start("BindingElement");
        if (this.optional("...")) {
          element.flags |= NodeFlags.DotDotDot;
        }
        element.set("name", this.parseBindingNameOrPattern());
        element.set("initializer", this.parseInitializer());
        return this.finish(element);
      })
    );
    return this.finish(node);
  }

  parseObjectBindingPattern(): Node {
    const node = this.start("ObjectBindingPattern");
    node.setList(
      "elements",
      this.bracketedAllowIn("{", "}", () => {
        const element = this.start("BindingElement");
        if (this.optional("...")) {
          element.flags |= NodeFlags.DotDotDot;
        }
        const isIdentifier = this.isIdentifier();
        const propertyName = this.parsePropertyName();
        if (isIdentifier && !this.isPunct(":")) {
          element.set("name", propertyName);
        } else {
          this.expect(":");
          element.set("propertyName", propertyName);
          element.set("name", this.parseBindingNameOrPattern());
        }
        element.set("initializer", this.parseInitializer());
        return this.finish(element);
      })
    );
    return this.finish(node);
  }

  parseInitializer(): Node | undefined {
    if (this.optional("=")) {
      return this.parseAssignmentExpression(true);
    }
    return undefined;
  }

  parseTypeAnnotation(): Node | undefined {
    if (this.optional(":")) {
      return this.parseType();
    }
    return undefined;
  }

  // Control flow statements.

  parseParenthesizedCondition(): Node {
    this.expect("(");
    const expression = this.allowIn(() => this.parseExpression());
    this.expect(")");
    return expression;
  }

  parseIfStatement(): Node {
    const node = this.start("IfStatement");
    this.next();
    node.set("expression", this.parseParenthesizedCondition());
    node.set("thenStatement", this.parseStatement());
    if (this.optionalWord("else")) {
      node.set("elseStatement", this.parseStatement());
    }
    return this.finish(node);
  }

  parseDoStatement(): Node {
    const node = this.start("DoStatement");
    this.next();
    node.set("statement", this.parseStatement());
    this.expectWord("while");
    node.set("expression", this.parseParenthesizedCondition());
    this.optional(";");
    return this.finish(node);
  }

  parseWhileStatement(): Node {
    const node = this.start("WhileStatement");
    this.next();
    node.set("expression", this.parseParenthesizedCondition());
    node.set("statement", this.parseStatement());
    return this.finish(node);
  }

  parseWithStatement(): Node {
    const node = this.start("WithStatement");
    this.next();
    node.set("expression", this.parseParenthesizedCondition());
    node.set("statement", this.parseStatement());
    return this.finish(node);
  }

  parseForStatement(): Node {
    const node = this.start("ForStatement");
    this.next();
    const isAwait = this.optionalWord("await");
    if (isAwait) {
      node.flags |= NodeFlags.Await;
    }
    this.expect("(");
    let initializer: Node | undefined;
    if (!this.isPunct(";")) {
      const declares =
        this.is("var") ||
        this.is("let") ||
        this.is("const") ||
        (this.is("using") &&
          this.nextIsOnSameLine(() => this.isIdentifier() && !this.is("of"))) ||
        (this.is("await") && this.isAwaitUsingDeclaration());
      initializer = declares
        ? this.parseVariableDeclarationList(true)
        : this.withDisallowIn(() => this.parseExpression());
    }
    node.set("initializer", initializer);
    if (isAwait) {
      this.expectWord("of");
    }
    if (isAwait || this.optionalWord("of")) {
      node.kind = "ForOfStatement";
      node.set(
        "expression",
        this.allowIn(() => this.parseAssignmentExpression(true))
      );
    } else if (this.optionalWord("in")) {
      node.kind = "ForInStatement";
      node.set(
        "expression",
        this.allowIn(() => this.parseExpression())
      );
    } else {
      this.expect(";");
      if (!this.isPunct(";") && !this.isPunct(")")) {
        node.set(
          "condition",
          this.allowIn(() => this.parseExpression())
        );
      }
      this.expect(";");
      if (!this.isPunct(")")) {
        node.set(
          "incrementor",
          this.allowIn(() => this.parseExpression())
        );
      }
    }
    this.expect(")");
    node.set("statement", this.parseStatement());
    return this.finish(node);
  }

  parseBreakOrContinue(kind: string): Node {
    const node = this.start(kind);
    this.next();
    if (!this.canParseSemicolon()) {
      node.set("label", this.parseIdentifier());
    }
    this.parseSemicolon();
    return this.finish(node);
  }

  parseReturnStatement(): Node {
    const node = this.start("ReturnStatement");
    this.next();
    if (!this.canParseSemicolon()) {
      node.set(
        "expression",
        this.allowIn(() => this.parseExpression())
      );
    }
    this.parseSemicolon();
    return this.finish(node);
  }

  parseSwitchStatement(): Node {
    const node = this.start("SwitchStatement");
    this.next();
    node.set("expression", this.parseParenthesizedCondition());
    const block = this.start("CaseBlock");
    this.expect("{");
    const clauses: Node[] = [];
    while (!this.isPunct("}")) {
      const clause = this.start("CaseClause");
      if (this.optionalWord("case")) {
        clause.set(
          "expression",
          this.allowIn(() => this.parseExpression())
        );
      } else {
        this.expectWord("default");
        clause.kind = "DefaultClause";
      }
      this.expect(":");
      const statements: Node[] = [];
      while (
        !this.isPunct("}") &&
        !this.is("case") &&
        !this.is("default") &&
        this.token() !== Token.Eof
      ) {
        statements.push(this.parseStatement());
      }
      clause.setList("statements", statements);
      clauses.push(this.finish(clause));
    }
    block.setList("clauses", clauses);
    this.expect("}");
    node.set("caseBlock", this.finish(block));
    return this.finish(node);
  }

  parseThrowStatement(): Node {
    const node = this.start("ThrowStatement");
    this.next();
    if (!this.scanner.lineBreak) {
      node.set(
        "expression",
        this.allowIn(() => this.parseExpression())
      );
    }
    this.parseSemicolon();
    return this.finish(node);
  }

  parseTryStatement(): Node {
    const node = this.start("TryStatement");
    this.next();
    node.set("tryBlock", this.parseBlock());
    if (this.is("catch")) {
      const clause = this.start("CatchClause");
      this.next();
      if (this.optional("(")) {
        clause.set("variableDeclaration", this.parseVariableDeclaration(false));
        this.expect(")");
      }
      clause.set("block", this.parseBlock());
      node.set("catchClause", this.finish(clause));
    }
    if (this.optionalWord("finally")) {
      node.set("finallyBlock", this.parseBlock());
    }
    return this.finish(node);
  }

  parseExpressionOrLabeledStatement(): Node {
    const node = this.start("ExpressionStatement");
    const expression = this.allowIn(() => this.parseExpression());
    if (expression.kind === "Identifier" && this.optional(":")) {
      node.kind = "LabeledStatement";
      node.set("label", expression);
      node.set("statement", this.parseStatement());
      return this.finish(node);
    }
    node.set("expression", expression);
    this.parseSemicolon();
    return this.finish(node);
  }

  // Functions and classes.

  parseFunctionDeclaration(node: Node, modifiers?: Modifiers): Node {
    applyModifiers(node, modifiers);
    this.expectWord("function");
    const isGenerator = this.optional("*");
    if (isGenerator) {
      node.flags |= NodeFlags.Generator;
    }
    const isAsync = node.has(NodeFlags.Async);
    if (!node.has(NodeFlags.Default) || this.isIdentifier()) {
      node.set("name", this.parseIdentifier());
    }
    this.parseSignature(node, ":", isAsync, isGenerator);
    node.set("body", this.parseFunctionBlockOrSemicolon(isAsync, isGenerator));
    return this.finish(node);
  }

  parseFunctionExpression(): Node {
    const node = this.start("FunctionExpression");
    if (this.optionalWord("async")) {
      node.flags |= NodeFlags.Async;
    }
    this.expectWord("function");
    const isGenerator = this.optional("*");
    if (isGenerator) {
      node.flags |= NodeFlags.Generator;
    }
    const isAsync = node.has(NodeFlags.Async);
    this.withFunctionContext(isAsync, isGenerator, () => {
      if (this.isIdentifier()) {
        node.set("name", this.parseIdentifier());
      }
    });
    this.parseSignature(node, ":", isAsync, isGenerator);
    node.set("body", this.parseFunctionBlock(isAsync, isGenerator));
    return this.finish(node);
  }

  /** Type parameters, parameters and return type. */
  parseSignature(
    node: Node,
    returnToken: string,
    isAsync: boolean,
    isGenerator: boolean
  ): void {
    const typeParameters = this.parseTypeParameters();
    if (typeParameters) {
      node.setList("typeParameters", typeParameters);
    }
    node.setList(
      "parameters",
      this.withFunctionContext(isAsync, isGenerator, () =>
        this.parseParameters()
      )
    );
    node.set("type", this.parseReturnType(returnToken));
  }

  parseReturnType(returnToken: string): Node | undefined {
    if (returnToken === "=>") {
      this.expect("=>");
    } else if (!this.optional(":")) {
      return undefined;
    }
    return this.withConditionalTypes(false, () =>
      this.parseTypeOrTypePredicate()
    );
  }

  parseParameters(): Node[] {
    return this.bracketed("(", ")", () => this.parseParameter());
  }

  parseParameter(): Node {
    const node = this.start("Parameter");
    applyModifiers(node, this.parseModifiers(true, false, false));
    if (this.is("this")) {
      node.set("name", this.tokenNode("Identifier"));
      node.set("type", this.parseTypeAnnotation());
      return this.finish(node);
    }
    if (this.optional("...")) {
      node.flags |= NodeFlags.DotDotDot;
    }
    node.set("name", this.parseBindingNameOrPattern());
    if (this.optional("?")) {
      node.flags |= NodeFlags.Question;
    }
    node.set("type", this.parseTypeAnnotation());
    node.set("initializer", this.parseInitializer());
    return this.finish(node);
  }

  parseClass(node: Node, modifiers?: Modifiers): Node {
    applyModifiers(node, modifiers);
    this.expectWord("class");
    if (
      this.isIdentifier() &&
      !(
        this.is("implements") &&
        this.lookAhead(() => {
          this.next();
          return this.isName();
        })
      )
    ) {
      node.set("name", this.parseIdentifier());
    }
    const typeParameters = this.parseTypeParameters();
    if (typeParameters) {
      node.setList("typeParameters", typeParameters);
    }
    node.setList("heritageClauses", this.parseHeritageClauses());
    this.expect("{");
    const members: Node[] = [];
    while (!this.isPunct("}")) {
      members.push(this.parseClassElement());
    }
    node.setList("members", members);
    this.expect("}");
    return this.finish(node);
  }

  parseHeritageClauses(): Node[] {
    const clauses: Node[] = [];
    while (this.is("extends") || this.is("implements")) {
      const clause = this.start("HeritageClause");
      clause.value = this.scanner.value;
      this.next();
      clause.setList(
        "types",
        this.delimited("", () => this.parseExpressionWithTypeArguments())
      );
      clauses.push(this.finish(clause));
    }
    return clauses;
  }

  parseExpressionWithTypeArguments(): Node {
    const node = this.start("ExpressionWithTypeArguments");
    const expression = this.parseLeftHandSideExpression();
    if (expression.kind === "ExpressionWithTypeArguments") {
      return expression;
    }
    node.set("expression", expression);
    if (this.isPunct("<")) {
      node.setList(
        "typeArguments",
        this.bracketed("<", ">", () => this.parseType())
      );
    }
    return this.finish(node);
  }

  parseClassElement(): Node {
    if (this.isPunct(";")) {
      return this.tokenNode("SemicolonClassElement");
    }
    const node = this.start("");
    const modifiers = this.parseModifiers(true, true, true);
    applyModifiers(node, modifiers);
    if (
      this.is("static") &&
      this.lookAhead(() => {
        this.next();
        return this.isPunct("{");
      })
    ) {
      node.kind = "ClassStaticBlockDeclaration";
      this.next();
      node.set("body", this.parseFunctionBlock(false, false));
      return this.finish(node);
    }
    if (this.parseAccessorKeyword("get")) {
      return this.parseAccessor(node, "GetAccessor", false);
    }
    if (this.parseAccessorKeyword("set")) {
      return this.parseAccessor(node, "SetAccessor", false);
    }
    if (
      (this.is("constructor") ||
        (this.token() === Token.String &&
          this.scanner.value === "constructor")) &&
      this.lookAhead(() => {
        this.next();
        return this.isPunct("(") || this.isPunct("<");
      })
    ) {
      node.kind = "Constructor";
      this.next();
      this.parseSignature(node, ":", false, false);
      node.set("body", this.parseFunctionBlockOrSemicolon(false, false));
      return this.finish(node);
    }
    if (this.isIndexSignature()) {
      return this.parseIndexSignature(node);
    }
    if (
      this.isLiteralPropertyName() ||
      this.isPunct("*") ||
      this.isPunct("[") ||
      this.token() === Token.PrivateName
    ) {
      return this.parsePropertyOrMethod(node);
    }
    throw this.fail("Declaration or statement expected");
  }

  parseAccessor(node: Node, kind: string, inType: boolean): Node {
    node.kind = kind;
    node.set("name", this.parsePropertyName());
    this.parseSignature(node, ":", false, false);
    if (inType && !this.isPunct("{")) {
      this.parseTypeMemberSemicolon();
    } else {
      node.set("body", this.parseFunctionBlockOrSemicolon(false, false));
    }
    return this.finish(node);
  }

  parsePropertyOrMethod(node: Node): Node {
    const isGenerator = this.optional("*");
    if (isGenerator) {
      node.flags |= NodeFlags.Generator;
    }
    node.set("name", this.parsePropertyName());
    if (this.optional("?")) {
      node.flags |= NodeFlags.Question;
    }
    if (isGenerator || this.isPunct("(") || this.isPunct("<")) {
      node.kind = "MethodDeclaration";
      const isAsync = node.has(NodeFlags.Async);
      this.parseSignature(node, ":", isAsync, isGenerator);
      node.set(
        "body",
        this.parseFunctionBlockOrSemicolon(isAsync, isGenerator)
      );
      return this.finish(node);
    }
    node.kind = "PropertyDeclaration";
    if (
      !node.has(NodeFlags.Question) &&
      !this.scanner.lineBreak &&
      this.isPunct("!")
    ) {
      this.next();
      node.flags |= NodeFlags.Exclamation;
    }
    node.set("type", this.parseTypeAnnotation());
    node.set(
      "initializer",
      this.withFunctionContext(false, false, () =>
        this.allowIn(() => this.parseInitializer())
      )
    );
    this.parseSemicolon();
    return this.finish(node);
  }

  isIndexSignature(): boolean {
    if (!this.isPunct("[")) {
      return false;
    }
    return this.lookAhead(() => {
      this.next();
      if (this.isPunct("...") || this.isPunct("]")) {
        return true;
      }
      if (this.isModifierWord()) {
        this.next();
        if (this.isIdentifier()) {
          return true;
        }
      } else if (this.isIdentifier()) {
        this.next();
      } else {
        return false;
      }
      if (this.isPunct(":") || this.isPunct(",")) {
        return true;
      }
      if (!this.isPunct("?")) {
        return false;
      }
      this.next();
      return this.isPunct(":") || this.isPunct(",") || this.isPunct("]");
    });
  }

  parseIndexSignature(node: Node): Node {
    node.kind = "IndexSignature";
    node.setList(
      "parameters",
      this.bracketed("[", "]", () => this.parseParameter())
    );
    node.set("type", this.parseTypeAnnotation());
    this.parseTypeMemberSemicolon();
    return this.finish(node);
  }

  // TypeScript declarations.

  parseInterface(node: Node, modifiers?: Modifiers): Node {
    node.kind = "InterfaceDeclaration";
    applyModifiers(node, modifiers);
    this.expectWord("interface");
    node.set("name", this.parseIdentifier());
    const typeParameters = this.parseTypeParameters();
    if (typeParameters) {
      node.setList("typeParameters", typeParameters);
    }
    node.setList("heritageClauses", this.parseHeritageClauses());
    node.setList("members", this.parseTypeMembers());
    return this.finish(node);
  }

  parseTypeAlias(node: Node, modifiers?: Modifiers): Node {
    node.kind = "TypeAliasDeclaration";
    applyModifiers(node, modifiers);
    this.expectWord("type");
    node.set("name", this.parseIdentifier());
    const typeParameters = this.parseTypeParameters();
    if (typeParameters) {
      node.setList("typeParameters", typeParameters);
    }
    this.expect("=");
    if (
      this.is("intrinsic") &&
      this.lookAhead(() => {
        this.next();
        return !this.isPunct(".");
      })
    ) {
      node.set("type", this.tokenNode("IntrinsicKeyword"));
    } else {
      node.set("type", this.parseType());
    }
    this.parseSemicolon();
    return this.finish(node);
  }

  parseEnum(node: Node, modifiers?: Modifiers): Node {
    node.kind = "EnumDeclaration";
    applyModifiers(node, modifiers);
    this.expectWord("enum");
    node.set("name", this.parseIdentifier());
    node.setList(
      "members",
      this.bracketed("{", "}", () => {
        const member = this.start("EnumMember");
        member.set("name", this.parsePropertyName());
        member.set(
          "initializer",
          this.allowIn(() => this.parseInitializer())
        );
        return this.finish(member);
      })
    );
    return this.finish(node);
  }

  parseModuleDeclaration(node: Node, modifiers?: Modifiers): Node {
    node.kind = "ModuleDeclaration";
    applyModifiers(node, modifiers);
    if (this.is("global")) {
      node.set("name", this.parseIdentifierName());
      if (this.isPunct("{")) {
        node.set("body", this.parseModuleBlock());
      } else {
        this.parseSemicolon();
      }
      return this.finish(node);
    }
    if (!this.optionalWord("namespace")) {
      this.expectWord("module");
      if (this.token() === Token.String) {
        node.set("name", this.parseLiteral());
        if (this.isPunct("{")) {
          node.set("body", this.parseModuleBlock());
        } else {
          this.parseSemicolon();
        }
        return this.finish(node);
      }
    }
    return this.parseNamespaceBody(node);
  }

  parseNamespaceBody(node: Node, nested = false): Node {
    node.set(
      "name",
      nested ? this.parseIdentifierName() : this.parseIdentifier()
    );
    if (this.optional(".")) {
      const inner = this.start("ModuleDeclaration");
      node.set("body", this.parseNamespaceBody(inner, true));
    } else {
      node.set("body", this.parseModuleBlock());
    }
    return this.finish(node);
  }

  parseModuleBlock(): Node {
    const node = this.start("ModuleBlock");
    this.expect("{");
    node.setList("statements", this.parseStatementList("}"));
    this.expect("}");
    return this.finish(node);
  }

  // Imports and exports.

  parseImportDeclaration(node: Node, modifiers?: Modifiers): Node {
    applyModifiers(node, modifiers);
    this.expectWord("import");
    const clause = this.start("ImportClause");
    let identifier: Node | undefined;
    if (this.isIdentifier()) {
      identifier = this.parseIdentifier();
    }
    let isTypeOnly = false;
    let isDefer = false;
    if (
      identifier?.value === "type" &&
      (!this.is("from") ||
        (this.isIdentifier() &&
          this.lookAhead(() => {
            this.next();
            return this.is("from") || this.isPunct("=");
          }))) &&
      (this.isIdentifier() || this.isPunct("*") || this.isPunct("{"))
    ) {
      isTypeOnly = true;
      identifier = this.isIdentifier() ? this.parseIdentifier() : undefined;
    } else if (
      // `import defer * as ns from 'x'`, as the compiler reads it.
      identifier?.value === "defer" &&
      (this.is("from")
        ? !this.lookAhead(() => {
            this.next();
            return this.token() === Token.String;
          })
        : !this.isPunct(",") && !this.isPunct("="))
    ) {
      isDefer = true;
      identifier = this.isIdentifier() ? this.parseIdentifier() : undefined;
    }
    if (identifier && !this.isPunct(",") && !this.is("from") && !isDefer) {
      node.kind = "ImportEqualsDeclaration";
      if (isTypeOnly) {
        node.flags |= NodeFlags.TypeOnly;
      }
      node.set("name", identifier);
      this.expect("=");
      node.set("moduleReference", this.parseModuleReference());
      this.parseSemicolon();
      return this.finish(node);
    }
    node.kind = "ImportDeclaration";
    if (identifier || this.isPunct("*") || this.isPunct("{")) {
      if (isTypeOnly) {
        clause.flags |= NodeFlags.TypeOnly;
      }
      clause.set("name", identifier);
      if (!identifier || this.optional(",")) {
        clause.set(
          "namedBindings",
          this.isPunct("*")
            ? this.parseNamespaceImport()
            : this.parseNamedImportsOrExports("NamedImports", "ImportSpecifier")
        );
      }
      node.set("importClause", this.finish(clause));
      this.expectWord("from");
    }
    node.set("moduleSpecifier", this.parseModuleSpecifier());
    node.set("attributes", this.parseImportAttributes());
    this.parseSemicolon();
    return this.finish(node);
  }

  parseModuleReference(): Node {
    if (
      this.is("require") &&
      this.lookAhead(() => {
        this.next();
        return this.isPunct("(");
      })
    ) {
      const node = this.start("ExternalModuleReference");
      this.next();
      this.expect("(");
      node.set("expression", this.parseModuleSpecifier());
      this.expect(")");
      return this.finish(node);
    }
    return this.parseEntityName(false);
  }

  parseModuleSpecifier(): Node {
    if (this.token() !== Token.String) {
      throw this.fail("String literal expected");
    }
    return this.parseLiteral();
  }

  parseImportAttributes(): Node | undefined {
    if ((!this.is("with") && !this.is("assert")) || this.scanner.lineBreak) {
      return undefined;
    }
    const node = this.start("ImportAttributes");
    node.value = this.scanner.value;
    this.next();
    node.setList(
      "elements",
      this.bracketed("{", "}", () => {
        const attribute = this.start("ImportAttribute");
        attribute.set(
          "name",
          this.token() === Token.String
            ? this.parseLiteral()
            : this.parseIdentifierName()
        );
        this.expect(":");
        attribute.set("value", this.parseAssignmentExpression(true));
        return this.finish(attribute);
      })
    );
    return this.finish(node);
  }

  parseNamespaceImport(): Node {
    const node = this.start("NamespaceImport");
    this.expect("*");
    this.expectWord("as");
    node.set("name", this.parseIdentifier());
    return this.finish(node);
  }

  parseNamedImportsOrExports(kind: string, specifierKind: string): Node {
    const node = this.start(kind);
    node.setList(
      "elements",
      this.bracketed("{", "}", () => this.parseSpecifier(specifierKind))
    );
    return this.finish(node);
  }

  parseSpecifier(kind: string): Node {
    const node = this.start(kind);
    let propertyName: Node | undefined;
    let canParseAs = true;
    let name = this.parseModuleExportName();
    if (name.kind === "Identifier" && name.value === "type") {
      if (this.is("as")) {
        const firstAs = this.parseIdentifierName();
        if (this.is("as")) {
          const secondAs = this.parseIdentifierName();
          if (this.isName() || this.token() === Token.String) {
            node.flags |= NodeFlags.TypeOnly;
            propertyName = firstAs;
            name = this.parseModuleExportName();
          } else {
            propertyName = name;
            name = secondAs;
          }
          canParseAs = false;
        } else if (this.isName() || this.token() === Token.String) {
          propertyName = name;
          canParseAs = false;
          name = this.parseModuleExportName();
        } else {
          node.flags |= NodeFlags.TypeOnly;
          name = firstAs;
        }
      } else if (this.isName() || this.token() === Token.String) {
        node.flags |= NodeFlags.TypeOnly;
        name = this.parseModuleExportName();
      }
    }
    if (canParseAs && this.is("as")) {
      propertyName = name;
      this.next();
      name = this.parseModuleExportName();
    }
    node.set("propertyName", propertyName);
    node.set("name", name);
    return this.finish(node);
  }

  parseExportAssignment(node: Node, modifiers?: Modifiers): Node {
    node.kind = "ExportAssignment";
    applyModifiers(node, modifiers);
    if (this.optional("=")) {
      node.flags |= NodeFlags.ExportEquals;
    } else {
      this.expectWord("default");
    }
    node.set(
      "expression",
      this.allowIn(() => this.parseAssignmentExpression(true))
    );
    this.parseSemicolon();
    return this.finish(node);
  }

  parseExportDeclaration(node: Node, modifiers?: Modifiers): Node {
    node.kind = "ExportDeclaration";
    applyModifiers(node, modifiers);
    if (this.optionalWord("type")) {
      node.flags |= NodeFlags.TypeOnly;
    }
    const namespaceExport = this.start("NamespaceExport");
    if (this.optional("*")) {
      if (this.optionalWord("as")) {
        namespaceExport.set("name", this.parseModuleExportName());
        node.set("exportClause", this.finish(namespaceExport));
      }
      this.expectWord("from");
      node.set("moduleSpecifier", this.parseModuleSpecifier());
    } else {
      node.set(
        "exportClause",
        this.parseNamedImportsOrExports("NamedExports", "ExportSpecifier")
      );
      if (
        this.is("from") ||
        (this.token() === Token.String && !this.scanner.lineBreak)
      ) {
        this.expectWord("from");
        node.set("moduleSpecifier", this.parseModuleSpecifier());
      }
    }
    if (node.field("moduleSpecifier")) {
      node.set("attributes", this.parseImportAttributes());
    }
    this.parseSemicolon();
    return this.finish(node);
  }

  // Expressions.

  parseExpression(): Node {
    let expression = this.parseAssignmentExpression(true);
    while (this.isPunct(",")) {
      const node = startAt("BinaryExpression", expression);
      node.value = ",";
      this.next();
      node.set("left", expression);
      node.set("right", this.parseAssignmentExpression(true));
      expression = this.finish(node);
    }
    return expression;
  }

  parseAssignmentExpression(allowReturnTypeInArrow: boolean): Node {
    if (this.isYieldExpression()) {
      return this.parseYieldExpression();
    }
    const arrow =
      this.tryParseParenthesizedArrowFunction(allowReturnTypeInArrow) ??
      this.tryParseAsyncSimpleArrowFunction(allowReturnTypeInArrow);
    if (arrow) {
      return arrow;
    }
    const expression = this.parseBinaryExpression(0);
    if (expression.kind === "Identifier" && this.isPunct("=>")) {
      return this.parseSimpleArrowFunction(expression, allowReturnTypeInArrow);
    }
    this.scanner.reScanGreater();
    if (ASSIGNMENT_OPERATORS.has(this.token())) {
      const node = startAt("BinaryExpression", expression);
      node.value = this.token();
      this.next();
      node.set("left", expression);
      node.set("right", this.parseAssignmentExpression(allowReturnTypeInArrow));
      return this.finish(node);
    }
    return this.parseConditionalRest(expression, allowReturnTypeInArrow);
  }

  parseConditionalRest(condition: Node, allowReturnTypeInArrow: boolean): Node {
    if (!this.isPunct("?")) {
      return condition;
    }
    const node = startAt("ConditionalExpression", condition);
    this.next();
    node.set("condition", condition);
    node.set(
      "whenTrue",
      this.allowIn(() => this.parseAssignmentExpression(false))
    );
    this.expect(":");
    node.set(
      "whenFalse",
      this.parseAssignmentExpression(allowReturnTypeInArrow)
    );
    return this.finish(node);
  }

  isYieldExpression(): boolean {
    if (!this.is("yield")) {
      return false;
    }
    if (this.inYield) {
      return true;
    }
    return this.nextIsOnSameLine(
      () =>
        this.isName() ||
        this.token() === Token.String ||
        this.token() === Token.Number ||
        this.token() === Token.BigInt
    );
  }

  parseYieldExpression(): Node {
    const node = this.start("YieldExpression");
    this.next();
    if (
      !this.scanner.lineBreak &&
      (this.isPunct("*") || this.isStartOfExpression())
    ) {
      if (this.optional("*")) {
        node.flags |= NodeFlags.Generator;
      }
      node.set("expression", this.parseAssignmentExpression(true));
    }
    return this.finish(node);
  }

  binaryPrecedence(): number {
    const token = this.token();
    if (token === Token.Name) {
      switch (this.scanner.value) {
        case "in": {
          return this.disallowIn ? -1 : 11;
        }
        case "instanceof":
        case "as":
        case "satisfies": {
          return 11;
        }
        default: {
          return -1;
        }
      }
    }
    switch (token) {
      case "??": {
        return 4;
      }
      case "||": {
        return 5;
      }
      case "&&": {
        return 6;
      }
      case "|": {
        return 7;
      }
      case "^": {
        return 8;
      }
      case "&": {
        return 9;
      }
      case "==":
      case "!=":
      case "===":
      case "!==": {
        return 10;
      }
      case "<":
      case ">":
      case "<=":
      case ">=": {
        return 11;
      }
      case "<<":
      case ">>":
      case ">>>": {
        return 12;
      }
      case "+":
      case "-": {
        return 13;
      }
      case "*":
      case "/":
      case "%": {
        return 14;
      }
      case "**": {
        return 15;
      }
      default: {
        return -1;
      }
    }
  }

  parseBinaryExpression(precedence: number): Node {
    const left = this.parseUnaryExpression();
    return this.parseBinaryRest(precedence, left);
  }

  parseBinaryRest(precedence: number, first: Node): Node {
    let left = first;
    while (true) {
      this.scanner.reScanGreater();
      const newPrecedence = this.binaryPrecedence();
      const consume =
        this.token() === "**"
          ? newPrecedence >= precedence
          : newPrecedence > precedence;
      if (!consume) {
        break;
      }
      if (this.is("as") || this.is("satisfies")) {
        if (this.scanner.lineBreak) {
          break;
        }
        const node = startAt(
          this.is("as") ? "AsExpression" : "SatisfiesExpression",
          left
        );
        this.next();
        node.set("expression", left);
        node.set("type", this.parseType());
        left = this.finish(node);
        continue;
      }
      const node = startAt("BinaryExpression", left);
      node.value =
        this.token() === Token.Name ? this.scanner.value : this.token();
      this.next();
      node.set("left", left);
      node.set("right", this.parseBinaryExpression(newPrecedence));
      left = this.finish(node);
    }
    return left;
  }

  isUpdateExpression(): boolean {
    const token = this.token();
    if (
      token === "+" ||
      token === "-" ||
      token === "~" ||
      token === "!" ||
      this.is("delete") ||
      this.is("typeof") ||
      this.is("void") ||
      this.is("await")
    ) {
      return false;
    }
    if (token === "<") {
      return this.scanner.jsx;
    }
    return true;
  }

  parseUnaryExpression(): Node {
    if (this.isUpdateExpression()) {
      const expression = this.parseUpdateExpression();
      return this.isPunct("**")
        ? this.parseBinaryRest(15, expression)
        : expression;
    }
    return this.parseSimpleUnaryExpression();
  }

  parseSimpleUnaryExpression(): Node {
    const token = this.token();
    if (token === "+" || token === "-" || token === "~" || token === "!") {
      const node = this.start("PrefixUnaryExpression");
      node.value = token;
      this.next();
      node.set("operand", this.parseSimpleUnaryExpression());
      return this.finish(node);
    }
    if (this.is("delete") || this.is("typeof") || this.is("void")) {
      let kind = "VoidExpression";
      if (this.is("delete")) {
        kind = "DeleteExpression";
      } else if (this.is("typeof")) {
        kind = "TypeOfExpression";
      }
      const node = this.start(kind);
      this.next();
      node.set("expression", this.parseSimpleUnaryExpression());
      return this.finish(node);
    }
    if (token === "<") {
      const node = this.start("TypeAssertionExpression");
      this.next();
      node.set("type", this.parseType());
      this.expect(">");
      node.set("expression", this.parseSimpleUnaryExpression());
      return this.finish(node);
    }
    if (this.is("await") && this.isAwaitExpression()) {
      const node = this.start("AwaitExpression");
      this.next();
      node.set("expression", this.parseSimpleUnaryExpression());
      return this.finish(node);
    }
    return this.parseUpdateExpression();
  }

  isAwaitExpression(): boolean {
    if (this.inAwait) {
      return true;
    }
    return this.nextIsOnSameLine(
      () =>
        this.isName() ||
        this.token() === Token.String ||
        this.token() === Token.Number ||
        this.token() === Token.BigInt
    );
  }

  parseUpdateExpression(): Node {
    const token = this.token();
    if (token === "++" || token === "--") {
      const node = this.start("PrefixUnaryExpression");
      node.value = token;
      this.next();
      node.set("operand", this.parseLeftHandSideExpression());
      return this.finish(node);
    }
    if (
      this.scanner.jsx &&
      token === "<" &&
      this.lookAhead(() => {
        this.next();
        return this.isName() || this.isPunct(">");
      })
    ) {
      return this.parseJsxElementOrFragment(true);
    }
    const expression = this.parseLeftHandSideExpression();
    if ((this.isPunct("++") || this.isPunct("--")) && !this.scanner.lineBreak) {
      const node = startAt("PostfixUnaryExpression", expression);
      node.value = this.token();
      this.next();
      node.set("operand", expression);
      return this.finish(node);
    }
    return expression;
  }

  parseLeftHandSideExpression(): Node {
    let expression: Node;
    if (
      this.is("import") &&
      this.lookAhead(() => {
        this.next();
        return this.isPunct("(") || this.isPunct("<");
      })
    ) {
      expression = this.tokenNode("ImportKeyword");
    } else if (
      this.is("import") &&
      this.lookAhead(() => {
        this.next();
        return this.isPunct(".");
      })
    ) {
      const node = this.start("MetaProperty");
      node.value = "import";
      this.next();
      this.next();
      node.set("name", this.parseIdentifierName());
      expression = this.parseMemberRest(this.finish(node), true);
    } else if (this.is("super")) {
      expression = this.parseMemberRest(this.tokenNode("SuperKeyword"), true);
    } else {
      expression = this.parseMemberRest(this.parsePrimaryExpression(), true);
    }
    return this.parseCallRest(expression);
  }

  isTemplateStart(): boolean {
    return (
      this.token() === Token.NoSubstitutionTemplate ||
      this.token() === Token.TemplateHead
    );
  }

  parseMemberRest(first: Node, allowOptionalChain: boolean): Node {
    let expression = first;
    while (true) {
      let questionDot = false;
      let isPropertyAccess = false;
      if (
        allowOptionalChain &&
        this.isPunct("?.") &&
        this.lookAhead(() => {
          this.next();
          return (
            this.isName() ||
            this.token() === Token.PrivateName ||
            this.isPunct("[") ||
            this.isTemplateStart()
          );
        })
      ) {
        this.next();
        questionDot = true;
        isPropertyAccess = this.isName();
      } else {
        isPropertyAccess = this.optional(".");
      }
      if (isPropertyAccess) {
        const node = startAt("PropertyAccessExpression", expression);
        if (questionDot) {
          node.flags |= NodeFlags.QuestionDot;
        }
        node.set("expression", expression);
        node.set("name", this.parseRightSideOfDot(true));
        expression = this.finish(node);
        continue;
      }
      if ((questionDot || !this.inDecorator) && this.isPunct("[")) {
        const node = startAt("ElementAccessExpression", expression);
        this.next();
        if (questionDot) {
          node.flags |= NodeFlags.QuestionDot;
        }
        node.set("expression", expression);
        node.set(
          "argumentExpression",
          this.allowIn(() => this.parseExpression())
        );
        this.expect("]");
        expression = this.finish(node);
        continue;
      }
      if (this.isTemplateStart()) {
        const instantiated =
          !questionDot && expression.kind === "ExpressionWithTypeArguments";
        expression = instantiated
          ? this.parseTaggedTemplate(
              expression,
              expression.getExpression(),
              false,
              expression.list("typeArguments")
            )
          : this.parseTaggedTemplate(expression, expression, questionDot);
        continue;
      }
      if (!questionDot) {
        if (this.isPunct("!") && !this.scanner.lineBreak) {
          const node = startAt("NonNullExpression", expression);
          this.next();
          node.set("expression", expression);
          expression = this.finish(node);
          continue;
        }
        const typeArguments =
          this.isPunct("<") || this.isPunct("<<")
            ? this.tryParse(() => this.parseTypeArgumentsInExpression())
            : undefined;
        if (typeArguments) {
          const node = startAt("ExpressionWithTypeArguments", expression);
          node.set("expression", expression);
          node.setList("typeArguments", typeArguments);
          expression = this.finish(node);
          continue;
        }
      }
      return expression;
    }
  }

  parseTaggedTemplate(
    first: Node,
    tag: Node,
    questionDot: boolean,
    typeArguments?: Node[]
  ): Node {
    const node = startAt("TaggedTemplateExpression", first);
    if (questionDot) {
      node.flags |= NodeFlags.QuestionDot;
    }
    node.set("tag", tag);
    if (typeArguments) {
      node.setList("typeArguments", typeArguments);
    }
    node.set(
      "template",
      this.token() === Token.NoSubstitutionTemplate
        ? this.parseLiteral()
        : this.parseTemplateExpression()
    );
    return this.finish(node);
  }

  parseTypeArgumentsInExpression(): Node[] | undefined {
    if (this.javascript || this.scanner.reScanLessThan() !== "<") {
      return undefined;
    }
    this.next();
    const typeArguments = this.delimited(">", () => this.parseType());
    if (this.scanner.reScanGreater() !== ">") {
      return undefined;
    }
    this.next();
    return this.canFollowTypeArgumentsInExpression()
      ? typeArguments
      : undefined;
  }

  canFollowTypeArgumentsInExpression(): boolean {
    const token = this.token();
    if (token === "(" || this.isTemplateStart()) {
      return true;
    }
    if (token === "<" || token === ">" || token === "+" || token === "-") {
      return false;
    }
    return (
      this.scanner.lineBreak ||
      this.binaryPrecedence() > 0 ||
      !this.isStartOfExpression()
    );
  }

  parseCallRest(first: Node): Node {
    let expression = first;
    while (true) {
      expression = this.parseMemberRest(expression, true);
      let typeArguments: Node[] | undefined;
      const questionDot = this.optional("?.");
      if (questionDot) {
        typeArguments = this.tryParse(() =>
          this.parseTypeArgumentsInExpression()
        );
        if (this.isTemplateStart()) {
          expression = this.parseTaggedTemplate(
            expression,
            expression,
            true,
            typeArguments
          );
          continue;
        }
      }
      if (typeArguments || this.isPunct("(")) {
        let callee = expression;
        if (!questionDot && expression.kind === "ExpressionWithTypeArguments") {
          typeArguments = expression.list("typeArguments");
          callee = expression.getExpression();
        }
        const node = startAt("CallExpression", expression);
        if (questionDot) {
          node.flags |= NodeFlags.QuestionDot;
        }
        node.set("expression", callee);
        if (typeArguments) {
          node.setList("typeArguments", typeArguments);
        }
        node.setList("arguments", this.parseArgumentList());
        expression = this.finish(node);
        continue;
      }
      if (questionDot) {
        throw this.fail("Identifier expected");
      }
      return expression;
    }
  }

  parseArgumentList(): Node[] {
    const savedInDecorator = this.inDecorator;
    this.inDecorator = false;
    try {
      return this.bracketedAllowIn("(", ")", () =>
        this.parseArgumentOrArrayElement()
      );
    } finally {
      this.inDecorator = savedInDecorator;
    }
  }

  parseArgumentOrArrayElement(): Node {
    if (this.isPunct("...")) {
      const node = this.start("SpreadElement");
      this.next();
      node.set("expression", this.parseAssignmentExpression(true));
      return this.finish(node);
    }
    if (this.isPunct(",")) {
      return this.finish(this.start("OmittedExpression"));
    }
    return this.parseAssignmentExpression(true);
  }

  isStartOfLeftHandSideExpression(): boolean {
    const token = this.token();
    switch (token) {
      case Token.Number:
      case Token.BigInt:
      case Token.String:
      case Token.NoSubstitutionTemplate:
      case Token.TemplateHead:
      case "(":
      case "[":
      case "{":
      case "/":
      case "/=": {
        return true;
      }
      default: {
        break;
      }
    }
    if (
      this.is("this") ||
      this.is("super") ||
      this.is("null") ||
      this.is("true") ||
      this.is("false") ||
      this.is("function") ||
      this.is("class") ||
      this.is("new")
    ) {
      return true;
    }
    if (this.is("import")) {
      return this.lookAhead(() => {
        this.next();
        return this.isPunct("(") || this.isPunct("<") || this.isPunct(".");
      });
    }
    return this.isIdentifier();
  }

  isStartOfExpression(): boolean {
    if (this.isStartOfLeftHandSideExpression()) {
      return true;
    }
    const token = this.token();
    switch (token) {
      case "+":
      case "-":
      case "~":
      case "!":
      case "++":
      case "--":
      case "<":
      case "@":
      case Token.PrivateName: {
        return true;
      }
      default: {
        break;
      }
    }
    if (
      this.is("delete") ||
      this.is("typeof") ||
      this.is("void") ||
      this.is("await") ||
      this.is("yield")
    ) {
      return true;
    }
    if (this.binaryPrecedence() > 0) {
      return true;
    }
    return this.isIdentifier();
  }

  parsePrimaryExpression(): Node {
    const token = this.token();
    switch (token) {
      case Token.NoSubstitutionTemplate:
      case Token.String:
      case Token.Number:
      case Token.BigInt: {
        return this.parseLiteral();
      }
      case Token.TemplateHead: {
        return this.parseTemplateExpression();
      }
      case Token.PrivateName: {
        return this.tokenNode("PrivateIdentifier");
      }
      case "(": {
        const node = this.start("ParenthesizedExpression");
        this.next();
        node.set(
          "expression",
          this.allowIn(() => this.parseExpression())
        );
        this.expect(")");
        return this.finish(node);
      }
      case "[": {
        const node = this.start("ArrayLiteralExpression");
        node.setList(
          "elements",
          this.allowIn(() =>
            this.bracketed("[", "]", () => this.parseArgumentOrArrayElement())
          )
        );
        return this.finish(node);
      }
      case "{": {
        return this.parseObjectLiteral();
      }
      case "/":
      case "/=": {
        this.scanner.reScanSlash();
        return this.tokenNode("RegularExpressionLiteral");
      }
      default: {
        break;
      }
    }
    if (this.isName()) {
      switch (this.scanner.value) {
        case "this": {
          return this.tokenNode("ThisKeyword");
        }
        case "null": {
          return this.tokenNode("NullKeyword");
        }
        case "true": {
          return this.tokenNode("TrueKeyword");
        }
        case "false": {
          return this.tokenNode("FalseKeyword");
        }
        case "async": {
          if (this.nextIsOnSameLine(() => this.is("function"))) {
            return this.parseFunctionExpression();
          }
          break;
        }
        case "function": {
          return this.parseFunctionExpression();
        }
        case "class": {
          return this.parseClass(this.start("ClassExpression"));
        }
        case "new": {
          return this.parseNewExpression();
        }
        default: {
          break;
        }
      }
    }
    if (this.isPunct("@")) {
      const node = this.start("ClassExpression");
      const modifiers = this.parseModifiers(true, false, false);
      return this.parseClass(node, modifiers);
    }
    return this.parseIdentifier();
  }

  parseNewExpression(): Node {
    const node = this.start("NewExpression");
    this.next();
    if (this.optional(".")) {
      node.kind = "MetaProperty";
      node.value = "new";
      node.set("name", this.parseIdentifierName());
      return this.finish(node);
    }
    let expression = this.parseMemberRest(this.parsePrimaryExpression(), false);
    if (expression.kind === "ExpressionWithTypeArguments") {
      node.setList("typeArguments", expression.list("typeArguments"));
      expression = expression.getExpression();
    }
    node.set("expression", expression);
    if (this.isPunct("(")) {
      node.setList("arguments", this.parseArgumentList());
    }
    return this.finish(node);
  }

  parseTemplateExpression(): Node {
    const node = this.start("TemplateExpression");
    node.set("head", this.tokenNode("TemplateHead"));
    const spans: Node[] = [];
    while (true) {
      const span = this.start("TemplateSpan");
      span.set(
        "expression",
        this.allowIn(() => this.parseExpression())
      );
      const literal = this.parseTemplateContinuation();
      span.set("literal", literal);
      spans.push(this.finish(span));
      if (literal.kind === "TemplateTail") {
        break;
      }
    }
    node.setList("templateSpans", spans);
    return this.finish(node);
  }

  /** Rescan `}` as the middle or tail of a template. */
  parseTemplateContinuation(): Node {
    if (!this.isPunct("}")) {
      throw this.fail("'}' expected");
    }
    const token = this.scanner.reScanTemplate();
    return this.tokenNode(
      token === Token.TemplateTail ? "TemplateTail" : "TemplateMiddle"
    );
  }

  parseObjectLiteral(): Node {
    const node = this.start("ObjectLiteralExpression");
    node.setList(
      "properties",
      this.allowIn(() =>
        this.bracketed("{", "}", () => this.parseObjectLiteralElement())
      )
    );
    return this.finish(node);
  }

  parseObjectLiteralElement(): Node {
    const node = this.start("");
    if (this.optional("...")) {
      node.kind = "SpreadAssignment";
      node.set("expression", this.parseAssignmentExpression(true));
      return this.finish(node);
    }
    applyModifiers(node, this.parseModifiers(true, false, false));
    if (this.parseAccessorKeyword("get")) {
      return this.parseAccessor(node, "GetAccessor", false);
    }
    if (this.parseAccessorKeyword("set")) {
      return this.parseAccessor(node, "SetAccessor", false);
    }
    const isGenerator = this.optional("*");
    if (isGenerator) {
      node.flags |= NodeFlags.Generator;
    }
    const isIdentifier = this.isIdentifier();
    const name = this.parsePropertyName();
    node.set("name", name);
    if (this.optional("?")) {
      node.flags |= NodeFlags.Question;
    }
    if (this.optional("!")) {
      node.flags |= NodeFlags.Exclamation;
    }
    if (isGenerator || this.isPunct("(") || this.isPunct("<")) {
      node.kind = "MethodDeclaration";
      const isAsync = node.has(NodeFlags.Async);
      this.parseSignature(node, ":", isAsync, isGenerator);
      node.set("body", this.parseFunctionBlock(isAsync, isGenerator));
      return this.finish(node);
    }
    if (isIdentifier && !this.isPunct(":")) {
      node.kind = "ShorthandPropertyAssignment";
      if (this.optional("=")) {
        node.set(
          "objectAssignmentInitializer",
          this.allowIn(() => this.parseAssignmentExpression(true))
        );
      }
      return this.finish(node);
    }
    node.kind = "PropertyAssignment";
    this.expect(":");
    node.set(
      "initializer",
      this.allowIn(() => this.parseAssignmentExpression(true))
    );
    return this.finish(node);
  }

  // Arrow functions.

  tryParseParenthesizedArrowFunction(
    allowReturnTypeInArrow: boolean
  ): Node | undefined {
    const state = this.isParenthesizedArrowFunction();
    if (state === Tristate.False) {
      return undefined;
    }
    if (state === Tristate.True) {
      return this.parseParenthesizedArrowFunction(true, true);
    }
    const start = this.scanner.tokenStart;
    if (this.notArrow.has(start)) {
      return undefined;
    }
    const result = this.tryParse(() =>
      this.parseParenthesizedArrowFunction(false, allowReturnTypeInArrow)
    );
    if (!result) {
      this.notArrow.add(start);
    }
    return result;
  }

  isParenthesizedArrowFunction(): number {
    const token = this.token();
    if (token === "(" || token === "<" || this.is("async")) {
      return this.lookAheadTristate(() =>
        this.isParenthesizedArrowFunctionWorker()
      );
    }
    if (token === "=>") {
      return Tristate.True;
    }
    return Tristate.False;
  }

  isParenthesizedArrowFunctionWorker(): number {
    if (this.is("async")) {
      this.next();
      if (this.scanner.lineBreak) {
        return Tristate.False;
      }
      if (!this.isPunct("(") && !this.isPunct("<")) {
        return Tristate.False;
      }
    }
    const first = this.token();
    const second = this.next();
    if (first === "(") {
      if (second === ")") {
        const third = this.next();
        return third === "=>" || third === ":" || third === "{"
          ? Tristate.True
          : Tristate.False;
      }
      if (second === "[" || second === "{") {
        return Tristate.Unknown;
      }
      if (second === "...") {
        return Tristate.True;
      }
      if (
        this.isModifierWord() &&
        !this.is("async") &&
        this.lookAhead(() => {
          this.next();
          return this.isIdentifier();
        })
      ) {
        this.next();
        return this.is("as") ? Tristate.False : Tristate.True;
      }
      if (!this.isIdentifier() && !this.is("this")) {
        return Tristate.False;
      }
      const third = this.next();
      if (third === ":") {
        return Tristate.True;
      }
      if (third === "?") {
        const fourth = this.next();
        return fourth === ":" ||
          fourth === "," ||
          fourth === "=" ||
          fourth === ")"
          ? Tristate.True
          : Tristate.False;
      }
      if (third === "," || third === "=" || third === ")") {
        return Tristate.Unknown;
      }
      return Tristate.False;
    }
    if (!this.isIdentifier() && !this.is("const")) {
      return Tristate.False;
    }
    if (this.scanner.jsx) {
      const isArrow = this.lookAhead(() => {
        this.optionalWord("const");
        const third = this.next();
        if (third === Token.Name && this.scanner.value === "extends") {
          const fourth = this.next();
          return fourth !== "=" && fourth !== ">" && fourth !== "/";
        }
        return third === "," || third === "=";
      });
      return isArrow ? Tristate.True : Tristate.False;
    }
    return Tristate.Unknown;
  }

  parseParenthesizedArrowFunction(
    allowAmbiguity: boolean,
    allowReturnTypeInArrow: boolean
  ): Node | undefined {
    const node = this.start("ArrowFunction");
    if (this.optionalWord("async")) {
      node.flags |= NodeFlags.Async;
    }
    const isAsync = node.has(NodeFlags.Async);
    const typeParameters = this.parseTypeParameters();
    if (typeParameters) {
      node.setList("typeParameters", typeParameters);
    }
    node.setList(
      "parameters",
      this.withFunctionContext(isAsync, false, () => this.parseParameters())
    );
    const hasReturnColon = this.isPunct(":");
    node.set("type", this.parseReturnType(":"));
    if (!allowAmbiguity && !this.isPunct("=>") && !this.isPunct("{")) {
      return undefined;
    }
    this.expect("=>");
    node.set(
      "body",
      this.parseArrowFunctionBody(isAsync, allowReturnTypeInArrow)
    );
    if (!allowReturnTypeInArrow && hasReturnColon && !this.isPunct(":")) {
      return undefined;
    }
    return this.finish(node);
  }

  tryParseAsyncSimpleArrowFunction(
    allowReturnTypeInArrow: boolean
  ): Node | undefined {
    if (
      !this.is("async") ||
      !this.lookAhead(() => {
        this.next();
        if (this.scanner.lineBreak || this.isPunct("=>")) {
          return false;
        }
        const expression = this.parseBinaryExpression(0);
        return (
          !this.scanner.lineBreak &&
          expression.kind === "Identifier" &&
          this.isPunct("=>")
        );
      })
    ) {
      return undefined;
    }
    const node = this.start("ArrowFunction");
    this.next();
    const parameter = this.parseBinaryExpression(0);
    return this.parseSimpleArrowFunction(
      parameter,
      allowReturnTypeInArrow,
      node
    );
  }

  parseSimpleArrowFunction(
    identifier: Node,
    allowReturnTypeInArrow: boolean,
    asyncNode?: Node
  ): Node {
    const parameter = startAt("Parameter", identifier);
    parameter.set("name", identifier);
    parameter.end = identifier.end;
    parameter.link();
    const node = asyncNode ?? startAt("ArrowFunction", identifier);
    const isAsync = asyncNode !== undefined;
    if (isAsync) {
      node.flags |= NodeFlags.Async;
    }
    node.setList("parameters", [parameter]);
    this.expect("=>");
    node.set(
      "body",
      this.parseArrowFunctionBody(isAsync, allowReturnTypeInArrow)
    );
    return this.finish(node);
  }

  parseArrowFunctionBody(
    isAsync: boolean,
    allowReturnTypeInArrow: boolean
  ): Node {
    if (this.isPunct("{")) {
      return this.parseFunctionBlock(isAsync, false);
    }
    return this.withFunctionContext(isAsync, false, () =>
      this.parseAssignmentExpression(allowReturnTypeInArrow)
    );
  }

  // Types.

  parseType(): Node {
    if (this.isStartOfFunctionOrConstructorType()) {
      return this.parseFunctionOrConstructorType();
    }
    const type = this.parseUnionType();
    if (
      !this.disallowConditionalTypes &&
      !this.scanner.lineBreak &&
      this.is("extends")
    ) {
      const node = startAt("ConditionalType", type);
      this.next();
      node.set("checkType", type);
      node.set(
        "extendsType",
        this.withConditionalTypes(true, () => this.parseType())
      );
      this.expect("?");
      node.set(
        "trueType",
        this.withConditionalTypes(false, () => this.parseType())
      );
      this.expect(":");
      node.set(
        "falseType",
        this.withConditionalTypes(false, () => this.parseType())
      );
      return this.finish(node);
    }
    return type;
  }

  parseTypeOrTypePredicate(): Node {
    const node = this.start("TypePredicate");
    const parameterName = this.isIdentifier()
      ? this.tryParse(() => {
          const name = this.parseIdentifier();
          const predicate = this.is("is") && !this.scanner.lineBreak;
          if (predicate) {
            this.next();
          }
          return predicate ? name : undefined;
        })
      : undefined;
    const type = this.parseType();
    if (!parameterName) {
      return type;
    }
    node.set("parameterName", parameterName);
    node.set("type", type);
    return this.finish(node);
  }

  isStartOfFunctionOrConstructorType(): boolean {
    if (this.isPunct("<")) {
      return true;
    }
    if (this.isPunct("(")) {
      return this.lookAhead(() => this.isUnambiguouslyStartOfFunctionType());
    }
    return (
      this.is("new") ||
      (this.is("abstract") &&
        this.lookAhead(() => {
          this.next();
          return this.is("new");
        }))
    );
  }

  isUnambiguouslyStartOfFunctionType(): boolean {
    this.next();
    if (this.isPunct(")") || this.isPunct("...")) {
      return true;
    }
    if (this.skipParameterStart()) {
      const token = this.token();
      if (token === ":" || token === "," || token === "?" || token === "=") {
        return true;
      }
      if (token === ")") {
        this.next();
        if (this.isPunct("=>")) {
          return true;
        }
      }
    }
    return false;
  }

  skipParameterStart(): boolean {
    if (this.isModifierWord()) {
      this.parseModifiers(false, false, false);
    }
    if (this.isIdentifier() || this.is("this")) {
      this.next();
      return true;
    }
    if (this.isPunct("[") || this.isPunct("{")) {
      this.parseBindingNameOrPattern();
      return true;
    }
    return false;
  }

  parseFunctionOrConstructorType(): Node {
    const node = this.start("FunctionType");
    if (this.optionalWord("abstract")) {
      node.flags |= NodeFlags.Abstract;
    }
    if (this.optionalWord("new")) {
      node.kind = "ConstructorType";
    }
    this.parseSignature(node, "=>", false, false);
    return this.finish(node);
  }

  parseUnionType(): Node {
    return this.parseUnionOrIntersection("|", "UnionType", () =>
      this.parseIntersectionType()
    );
  }

  parseIntersectionType(): Node {
    return this.parseUnionOrIntersection("&", "IntersectionType", () =>
      this.parseTypeOperator()
    );
  }

  parseUnionOrIntersection(
    operator: string,
    kind: string,
    parseConstituent: () => Node
  ): Node {
    const node = this.start(kind);
    const hasLeadingOperator = this.optional(operator);
    const parseMember = (): Node =>
      this.isStartOfFunctionOrConstructorType()
        ? this.parseFunctionOrConstructorType()
        : parseConstituent();
    const type = hasLeadingOperator ? parseMember() : parseConstituent();
    if (!this.isPunct(operator) && !hasLeadingOperator) {
      return type;
    }
    const types = [type];
    while (this.optional(operator)) {
      types.push(parseMember());
    }
    node.setList("types", types);
    return this.finish(node);
  }

  parseTypeOperator(): Node {
    if (this.is("keyof") || this.is("unique") || this.is("readonly")) {
      const node = this.start("TypeOperator");
      node.value = this.scanner.value;
      this.next();
      node.set("type", this.parseTypeOperator());
      return this.finish(node);
    }
    if (this.is("infer")) {
      const node = this.start("InferType");
      this.next();
      const parameter = this.start("TypeParameter");
      parameter.set("name", this.parseIdentifier());
      parameter.set(
        "constraint",
        this.tryParse(() => {
          if (!this.optionalWord("extends")) {
            return;
          }
          const constraint = this.withConditionalTypes(true, () =>
            this.parseType()
          );
          return this.disallowConditionalTypes || !this.isPunct("?")
            ? constraint
            : undefined;
        })
      );
      node.set("typeParameter", this.finish(parameter));
      return this.finish(node);
    }
    return this.withConditionalTypes(false, () => this.parsePostfixType());
  }

  parsePostfixType(): Node {
    let type = this.parseNonArrayType();
    while (!this.scanner.lineBreak && this.isPunct("[")) {
      const node = startAt("ArrayType", type);
      this.next();
      if (this.isStartOfType()) {
        node.kind = "IndexedAccessType";
        node.set("objectType", type);
        node.set("indexType", this.parseType());
      } else {
        node.set("elementType", type);
      }
      this.expect("]");
      type = this.finish(node);
    }
    return type;
  }

  isStartOfType(): boolean {
    const token = this.token();
    switch (token) {
      case "{":
      case "[":
      case "<":
      case "|":
      case "&":
      case "(":
      case "-":
      case "*":
      case "?":
      case "!":
      case "...":
      case Token.String:
      case Token.Number:
      case Token.BigInt:
      case Token.NoSubstitutionTemplate:
      case Token.TemplateHead: {
        return true;
      }
      default: {
        break;
      }
    }
    return (
      this.isIdentifier() ||
      (this.isName() && TYPE_START_WORDS.has(this.scanner.value))
    );
  }

  parseNonArrayType(): Node {
    const token = this.token();
    switch (token) {
      case Token.String:
      case Token.Number:
      case Token.BigInt:
      case Token.NoSubstitutionTemplate: {
        const node = this.start("LiteralType");
        node.set("literal", this.parseLiteral());
        return this.finish(node);
      }
      case "-": {
        if (
          this.lookAhead(() => {
            this.next();
            return (
              this.token() === Token.Number || this.token() === Token.BigInt
            );
          })
        ) {
          const node = this.start("LiteralType");
          const unary = this.start("PrefixUnaryExpression");
          unary.value = "-";
          this.next();
          unary.set("operand", this.parseLiteral());
          node.set("literal", this.finish(unary));
          return this.finish(node);
        }
        break;
      }
      case "?": {
        // Flow-style `?Type`, which TypeScript parses in every file.
        const node = this.start("JSDocNullableType");
        this.next();
        if (
          this.isPunct(",") ||
          this.isPunct("}") ||
          this.isPunct(")") ||
          this.isPunct(">") ||
          this.isPunct("=") ||
          this.isPunct("|")
        ) {
          node.kind = "JSDocUnknownType";
        } else {
          node.set("type", this.parseType());
        }
        return this.finish(node);
      }
      case "{": {
        return this.lookAhead(() => this.isStartOfMappedType())
          ? this.parseMappedType()
          : this.parseTypeLiteral();
      }
      case "[": {
        return this.parseTupleType();
      }
      case "(": {
        const node = this.start("ParenthesizedType");
        this.next();
        node.set("type", this.parseType());
        this.expect(")");
        return this.finish(node);
      }
      case Token.TemplateHead: {
        return this.parseTemplateLiteralType();
      }
      default: {
        break;
      }
    }
    if (this.isName()) {
      const word = this.scanner.value;
      const keywordKind = KEYWORD_TYPES.get(word);
      if (
        keywordKind &&
        !this.lookAhead(() => {
          this.next();
          return this.isPunct(".");
        })
      ) {
        return this.tokenNode(keywordKind);
      }
      switch (word) {
        case "true":
        case "false":
        case "null": {
          const node = this.start("LiteralType");
          node.set(
            "literal",
            this.tokenNode(LITERAL_KEYWORD_KINDS.get(word) ?? "NullKeyword")
          );
          return this.finish(node);
        }
        case "void": {
          return this.tokenNode("VoidKeyword");
        }
        case "this": {
          const thisType = this.tokenNode("ThisType");
          if (this.is("is") && !this.scanner.lineBreak) {
            const node = startAt("TypePredicate", thisType);
            this.next();
            node.set("parameterName", thisType);
            node.set("type", this.parseType());
            return this.finish(node);
          }
          return thisType;
        }
        case "typeof": {
          return this.lookAhead(() => {
            this.next();
            return this.is("import");
          })
            ? this.parseImportType()
            : this.parseTypeQuery();
        }
        case "import": {
          return this.parseImportType();
        }
        case "asserts": {
          if (this.nextIsOnSameLine(() => this.isName())) {
            return this.parseAssertsTypePredicate();
          }
          break;
        }
        default: {
          break;
        }
      }
    }
    return this.parseTypeReference();
  }

  parseAssertsTypePredicate(): Node {
    const node = this.start("TypePredicate");
    node.flags |= NodeFlags.Asserts;
    this.next();
    node.set(
      "parameterName",
      this.is("this") ? this.tokenNode("ThisType") : this.parseIdentifier()
    );
    if (this.optionalWord("is")) {
      node.set("type", this.parseType());
    }
    return this.finish(node);
  }

  parseTypeReference(): Node {
    const node = this.start("TypeReference");
    node.set("typeName", this.parseEntityName(true));
    if (!this.scanner.lineBreak && this.scanner.reScanLessThan() === "<") {
      node.setList(
        "typeArguments",
        this.bracketed("<", ">", () => this.parseType())
      );
    }
    return this.finish(node);
  }

  parseTypeQuery(): Node {
    const node = this.start("TypeQuery");
    this.expectWord("typeof");
    node.set("exprName", this.parseEntityName(true));
    if (!this.scanner.lineBreak && this.isPunct("<")) {
      node.setList(
        "typeArguments",
        this.bracketed("<", ">", () => this.parseType())
      );
    }
    return this.finish(node);
  }

  parseImportType(): Node {
    const node = this.start("ImportType");
    if (this.optionalWord("typeof")) {
      node.flags |= NodeFlags.TypeOf;
    }
    this.expectWord("import");
    this.expect("(");
    node.set("argument", this.parseType());
    if (this.optional(",")) {
      this.expect("{");
      const keyword = this.scanner.value;
      this.next();
      this.expect(":");
      const attributes = this.start("ImportAttributes");
      attributes.value = keyword;
      attributes.setList(
        "elements",
        this.bracketed("{", "}", () => {
          const attribute = this.start("ImportAttribute");
          attribute.set(
            "name",
            this.token() === Token.String
              ? this.parseLiteral()
              : this.parseIdentifierName()
          );
          this.expect(":");
          attribute.set("value", this.parseAssignmentExpression(true));
          return this.finish(attribute);
        })
      );
      node.set("attributes", this.finish(attributes));
      this.optional(",");
      this.expect("}");
    }
    this.expect(")");
    if (this.optional(".")) {
      node.set("qualifier", this.parseEntityName(true));
    }
    if (!this.scanner.lineBreak && this.scanner.reScanLessThan() === "<") {
      node.setList(
        "typeArguments",
        this.bracketed("<", ">", () => this.parseType())
      );
    }
    return this.finish(node);
  }

  isStartOfMappedType(): boolean {
    this.next();
    if (this.isPunct("+") || this.isPunct("-")) {
      this.next();
      return this.is("readonly");
    }
    if (this.is("readonly")) {
      this.next();
    }
    if (!this.isPunct("[")) {
      return false;
    }
    this.next();
    if (!this.isIdentifier()) {
      return false;
    }
    this.next();
    return this.is("in");
  }

  parseMappedType(): Node {
    const node = this.start("MappedType");
    this.expect("{");
    if (this.isPunct("+") || this.isPunct("-")) {
      this.next();
      this.expectWord("readonly");
    } else {
      this.optionalWord("readonly");
    }
    this.expect("[");
    const parameter = this.start("TypeParameter");
    parameter.set("name", this.parseIdentifierName());
    this.expectWord("in");
    parameter.set("constraint", this.parseType());
    node.set("typeParameter", this.finish(parameter));
    if (this.optionalWord("as")) {
      node.set("nameType", this.parseType());
    }
    this.expect("]");
    if (this.isPunct("+") || this.isPunct("-")) {
      this.next();
      this.expect("?");
    } else {
      this.optional("?");
    }
    node.set("type", this.parseTypeAnnotation());
    this.parseSemicolon();
    this.expect("}");
    return this.finish(node);
  }

  parseTypeLiteral(): Node {
    const node = this.start("TypeLiteral");
    node.setList("members", this.parseTypeMembers());
    return this.finish(node);
  }

  parseTypeMembers(): Node[] {
    this.expect("{");
    const members: Node[] = [];
    while (!this.isPunct("}")) {
      members.push(this.parseTypeMember());
    }
    this.expect("}");
    return members;
  }

  parseTypeMember(): Node {
    if (this.isPunct("(") || this.isPunct("<")) {
      const node = this.start("CallSignature");
      this.parseSignature(node, ":", false, false);
      this.parseTypeMemberSemicolon();
      return this.finish(node);
    }
    if (
      this.is("new") &&
      this.lookAhead(() => {
        this.next();
        return this.isPunct("(") || this.isPunct("<");
      })
    ) {
      const node = this.start("ConstructSignature");
      this.next();
      this.parseSignature(node, ":", false, false);
      this.parseTypeMemberSemicolon();
      return this.finish(node);
    }
    const node = this.start("");
    applyModifiers(node, this.parseModifiers(false, false, false));
    if (this.parseAccessorKeyword("get")) {
      return this.parseAccessor(node, "GetAccessor", true);
    }
    if (this.parseAccessorKeyword("set")) {
      return this.parseAccessor(node, "SetAccessor", true);
    }
    if (this.isIndexSignature()) {
      return this.parseIndexSignature(node);
    }
    node.set("name", this.parsePropertyName());
    if (this.optional("?")) {
      node.flags |= NodeFlags.Question;
    }
    if (this.isPunct("(") || this.isPunct("<")) {
      node.kind = "MethodSignature";
      this.parseSignature(node, ":", false, false);
    } else {
      node.kind = "PropertySignature";
      node.set("type", this.parseTypeAnnotation());
    }
    this.parseTypeMemberSemicolon();
    return this.finish(node);
  }

  parseTypeMemberSemicolon(): void {
    if (this.optional(",")) {
      return;
    }
    this.parseSemicolon();
  }

  parseTupleType(): Node {
    const node = this.start("TupleType");
    node.setList(
      "elements",
      this.bracketed("[", "]", () => this.parseTupleElement())
    );
    return this.finish(node);
  }

  isTupleElementName(): boolean {
    if (this.isPunct("...")) {
      this.next();
    }
    if (!this.isName()) {
      return false;
    }
    this.next();
    if (this.isPunct(":")) {
      return true;
    }
    if (!this.isPunct("?")) {
      return false;
    }
    this.next();
    return this.isPunct(":");
  }

  parseTupleElement(): Node {
    if (this.lookAhead(() => this.isTupleElementName())) {
      const node = this.start("NamedTupleMember");
      if (this.optional("...")) {
        node.flags |= NodeFlags.DotDotDot;
      }
      node.set("name", this.parseIdentifierName());
      if (this.optional("?")) {
        node.flags |= NodeFlags.Question;
      }
      this.expect(":");
      node.set("type", this.parseTupleElementType());
      return this.finish(node);
    }
    return this.parseTupleElementType();
  }

  parseTupleElementType(): Node {
    if (this.isPunct("...")) {
      const node = this.start("RestType");
      this.next();
      node.set("type", this.parseType());
      return this.finish(node);
    }
    const type = this.parseType();
    if (this.isPunct("?")) {
      const node = startAt("OptionalType", type);
      this.next();
      node.set("type", type);
      return this.finish(node);
    }
    return type;
  }

  parseTemplateLiteralType(): Node {
    const node = this.start("TemplateLiteralType");
    node.set("head", this.tokenNode("TemplateHead"));
    const spans: Node[] = [];
    while (true) {
      const span = this.start("TemplateLiteralTypeSpan");
      span.set("type", this.parseType());
      const literal = this.parseTemplateContinuation();
      span.set("literal", literal);
      spans.push(this.finish(span));
      if (literal.kind === "TemplateTail") {
        break;
      }
    }
    node.setList("templateSpans", spans);
    return this.finish(node);
  }

  parseTypeParameters(): Node[] | undefined {
    if (!this.isPunct("<")) {
      return undefined;
    }
    return this.bracketed("<", ">", () => {
      const node = this.start("TypeParameter");
      while (
        (this.is("const") || this.is("in") || this.is("out")) &&
        this.nextIsOnSameLine(() => this.isIdentifier())
      ) {
        node.flags |= modifierFlag(this.scanner.value);
        this.next();
      }
      node.set("name", this.parseIdentifier());
      if (this.optionalWord("extends")) {
        node.set("constraint", this.parseType());
      }
      if (this.optional("=")) {
        node.set("default", this.parseType());
      }
      return this.finish(node);
    });
  }

  // JSX.

  parseJsxElementOrFragment(inExpressionContext: boolean): Node {
    const opening = this.parseJsxOpening(inExpressionContext);
    if (opening.kind === "JsxOpeningElement") {
      const node = startAt("JsxElement", opening);
      node.set("openingElement", opening);
      node.setList("children", this.parseJsxChildren());
      node.set(
        "closingElement",
        this.parseJsxClosing(inExpressionContext, false)
      );
      return this.finish(node);
    }
    if (opening.kind === "JsxOpeningFragment") {
      const node = startAt("JsxFragment", opening);
      node.set("openingFragment", opening);
      node.setList("children", this.parseJsxChildren());
      node.set(
        "closingFragment",
        this.parseJsxClosing(inExpressionContext, true)
      );
      return this.finish(node);
    }
    return opening;
  }

  parseJsxOpening(inExpressionContext: boolean): Node {
    const node = this.start("JsxOpeningElement");
    this.expect("<");
    if (this.isPunct(">")) {
      node.kind = "JsxOpeningFragment";
      this.scanner.nextJsxText();
      return this.finish(node);
    }
    node.set("tagName", this.parseJsxElementName());
    if (!this.javascript && this.isPunct("<")) {
      node.setList(
        "typeArguments",
        this.bracketed("<", ">", () => this.parseType())
      );
    }
    const attributes = this.start("JsxAttributes");
    const properties: Node[] = [];
    while (!this.isPunct("/") && !this.isPunct(">")) {
      if (this.token() === Token.Eof) {
        throw this.fail("'>' expected");
      }
      properties.push(this.parseJsxAttribute());
    }
    attributes.setList("properties", properties);
    node.set("attributes", this.finish(attributes));
    if (this.isPunct(">")) {
      this.scanner.nextJsxText();
      return this.finish(node);
    }
    node.kind = "JsxSelfClosingElement";
    this.expect("/");
    if (!this.isPunct(">")) {
      throw this.fail("'>' expected");
    }
    if (inExpressionContext) {
      this.next();
    } else {
      this.scanner.nextJsxText();
    }
    return this.finish(node);
  }

  parseJsxElementName(): Node {
    this.scanner.scanJsxIdentifier();
    const isThis = this.is("this");
    let expression = isThis
      ? this.tokenNode("ThisKeyword")
      : this.parseIdentifierName();
    if (!isThis && this.isPunct(":")) {
      const node = startAt("JsxNamespacedName", expression);
      this.next();
      this.scanner.scanJsxIdentifier();
      node.set("namespace", expression);
      node.set("name", this.parseIdentifierName());
      return this.finish(node);
    }
    while (this.isPunct(".")) {
      const node = startAt("PropertyAccessExpression", expression);
      this.next();
      node.set("expression", expression);
      node.set("name", this.parseIdentifierName());
      expression = this.finish(node);
    }
    return expression;
  }

  parseJsxAttribute(): Node {
    if (this.isPunct("{")) {
      const node = this.start("JsxSpreadAttribute");
      this.next();
      this.expect("...");
      node.set("expression", this.parseExpression());
      this.expect("}");
      return this.finish(node);
    }
    const node = this.start("JsxAttribute");
    this.scanner.scanJsxIdentifier();
    let name = this.parseIdentifierName();
    if (this.isPunct(":")) {
      const namespaced = startAt("JsxNamespacedName", name);
      this.next();
      this.scanner.scanJsxIdentifier();
      namespaced.set("namespace", name);
      namespaced.set("name", this.parseIdentifierName());
      name = this.finish(namespaced);
    }
    node.set("name", name);
    if (this.isPunct("=")) {
      const token = this.scanner.nextJsxAttributeValue();
      if (token === Token.String) {
        node.set("initializer", this.parseLiteral());
      } else if (token === "{") {
        node.set("initializer", this.parseJsxExpression(true));
      } else if (token === "<") {
        node.set("initializer", this.parseJsxElementOrFragment(true));
      } else {
        throw this.fail("JSX attribute value expected");
      }
    }
    return this.finish(node);
  }

  parseJsxExpression(inExpressionContext: boolean): Node {
    const node = this.start("JsxExpression");
    this.expect("{");
    if (!this.isPunct("}")) {
      if (!inExpressionContext && this.optional("...")) {
        node.flags |= NodeFlags.DotDotDot;
      }
      node.set(
        "expression",
        this.allowIn(() => this.parseExpression())
      );
    }
    if (inExpressionContext) {
      this.expect("}");
    } else {
      if (!this.isPunct("}")) {
        throw this.fail("'}' expected");
      }
      this.scanner.nextJsxText();
    }
    return this.finish(node);
  }

  parseJsxChildren(): Node[] {
    const children: Node[] = [];
    while (true) {
      const token = this.scanner.reScanJsxToken();
      if (token === Token.Eof) {
        throw this.fail("JSX closing tag expected");
      }
      if (token === "</") {
        return children;
      }
      if (token === Token.JsxText) {
        const node = this.start("JsxText");
        node.value = this.scanner.value;
        this.scanner.nextJsxText();
        this.finish(node);
        // TypeScript skips leading whitespace and comments in JSX text.
        node.start = Math.min(this.scanner.triviaEnd(node.pos), node.end);
        children.push(node);
      } else if (token === "{") {
        children.push(this.parseJsxExpression(false));
      } else {
        children.push(this.parseJsxElementOrFragment(false));
      }
    }
  }

  /** Parse the type in a JSDoc `{…}`, or return undefined if it is not one. */
  parseJsDocType(open: number, close: number): Node | undefined {
    this.scanner.pos = open + 1;
    this.scanner.lastTokenEnd = open + 1;
    this.scanner.scan();
    try {
      const type = this.parseType();
      return this.isPunct("}") && this.scanner.tokenStart === close
        ? type
        : undefined;
    } catch {
      return undefined;
    }
  }

  parseJsxClosing(inExpressionContext: boolean, fragment: boolean): Node {
    const node = this.start(
      fragment ? "JsxClosingFragment" : "JsxClosingElement"
    );
    this.expect("</");
    if (!fragment) {
      node.set("tagName", this.parseJsxElementName());
    }
    if (!this.isPunct(">")) {
      throw this.fail("'>' expected");
    }
    if (inExpressionContext) {
      this.next();
    } else {
      this.scanner.nextJsxText();
    }
    return this.finish(node);
  }
}

// Kinds the compiler attaches JSDoc comments to. A comment goes to the
// outermost such node that starts after it.
const JSDOC_KINDS = new Set([
  "ArrowFunction",
  "BinaryExpression",
  "CallSignature",
  "ClassDeclaration",
  "ClassExpression",
  "ClassStaticBlockDeclaration",
  "Constructor",
  "ConstructSignature",
  "EnumDeclaration",
  "EnumMember",
  "ExportAssignment",
  "ExportDeclaration",
  "ExportSpecifier",
  "ExpressionStatement",
  "ForInStatement",
  "ForOfStatement",
  "ForStatement",
  "FunctionDeclaration",
  "FunctionExpression",
  "GetAccessor",
  "IfStatement",
  "ImportDeclaration",
  "ImportEqualsDeclaration",
  "IndexSignature",
  "InterfaceDeclaration",
  "LabeledStatement",
  "MethodDeclaration",
  "MethodSignature",
  "ModuleDeclaration",
  "Parameter",
  "ParenthesizedExpression",
  "PropertyAssignment",
  "PropertyDeclaration",
  "PropertySignature",
  "ReturnStatement",
  "SetAccessor",
  "ShorthandPropertyAssignment",
  "SpreadAssignment",
  "SwitchStatement",
  "ThrowStatement",
  "TryStatement",
  "TypeAliasDeclaration",
  "VariableDeclaration",
  "VariableStatement",
  "WhileStatement",
]);

const JSDOC_TAG_KINDS = new Map(
  Object.entries({
    arg: "JSDocParameterTag",
    argument: "JSDocParameterTag",
    param: "JSDocParameterTag",
    return: "JSDocReturnTag",
    returns: "JSDocReturnTag",
    satisfies: "JSDocSatisfiesTag",
    type: "JSDocTypeTag",
    typedef: "JSDocTypedefTag",
  })
);

// The `/** … */` comments in the trivia between `pos` and `start`.
const jsDocRanges = (
  text: string,
  pos: number,
  start: number
): { start: number; end: number }[] => {
  const ranges: { start: number; end: number }[] = [];
  let index = pos;
  while (index < start) {
    const char = text[index];
    if (char === "/" && text[index + 1] === "/") {
      while (index < start && text[index] !== "\n") {
        index += 1;
      }
    } else if (char === "/" && text[index + 1] === "*") {
      const close = text.indexOf("*/", index + 2);
      const end = close === -1 ? start : close + 2;
      if (text[index + 2] === "*" && text[index + 3] !== "/") {
        ranges.push({ end, start: index });
      }
      index = end;
    } else {
      index += 1;
    }
  }
  return ranges;
};

// The offset of the `}` that closes the `{` at `open`, or -1.
const closingBrace = (text: string, open: number, end: number): number => {
  let depth = 0;
  for (let index = open; index < end; index += 1) {
    if (text[index] === "{") {
      depth += 1;
    } else if (text[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
};

const parseJsDoc = (
  parser: Parser,
  text: string,
  range: { start: number; end: number }
): Node => {
  const jsDoc: Node = new Node("JSDoc", range.start, range.start);
  jsDoc.end = range.end;
  const tags: Node[] = [];
  const pattern = /(?<=^|[\s*])@([A-Za-z]+)/gu;
  const body = text.slice(range.start, range.end);
  for (const match of body.matchAll(pattern)) {
    const name = match[1] ?? "";
    const tagStart = range.start + match.index;
    const tag: Node = new Node(
      JSDOC_TAG_KINDS.get(name) ?? "JSDocTag",
      tagStart,
      tagStart
    );
    tag.end = tagStart + name.length + 1;
    let index = tag.end;
    while (index < range.end && (text[index] === " " || text[index] === "\t")) {
      index += 1;
    }
    if (text[index] === "{") {
      const close = closingBrace(text, index, range.end);
      const type =
        close === -1 ? undefined : parser.parseJsDocType(index, close);
      if (type) {
        const expression: Node = new Node("JSDocTypeExpression", index, index);
        expression.end = close + 1;
        expression.set("type", type);
        expression.link();
        tag.set("typeExpression", expression);
        tag.end = expression.end;
      }
    }
    tag.link();
    tags.push(tag);
  }
  jsDoc.setList("tags", tags);
  jsDoc.link();
  return jsDoc;
};

// Attach JSDoc comments to the nodes they document.
const attachJsDocs = (root: Node, parser: Parser, text: string): void => {
  const documented = new Set<number>();
  const stack: Node[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      break;
    }
    if (
      JSDOC_KINDS.has(node.kind) &&
      !documented.has(node.start) &&
      node.pos < node.start
    ) {
      documented.add(node.start);
      for (const range of jsDocRanges(text, node.pos, node.start)) {
        const jsDoc = parseJsDoc(parser, text, range);
        jsDoc.parent = node;
        node.jsDocs.push(jsDoc);
      }
    }
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const child = node.children[index];
      if (child) {
        stack.push(child);
      }
    }
  }
};

/** Parse a source file. The language follows the file extension. */
export const parseSourceFile = (
  text: string,
  path: string
): NodeOf<"SourceFile"> => {
  const parser = new Parser(text, path);
  const root = parser.parseSourceFile();
  if (text.includes("/**")) {
    attachJsDocs(root, parser, text);
  }
  root.file = new SourceText(text, path, parseSourceFile, bindSourceFile);
  return root;
};
