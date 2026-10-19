// A TypeScript syntax tree with the parts of the ts-morph API the c15t
// codemods use. Scriptc cannot compile ts-morph or the TypeScript compiler,
// so the parser in `parser.ts` builds these nodes instead. Node kinds use the
// compiler's SyntaxKind names, so ported codemods compare the same strings.

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

/** A declared name: an import, variable, function, class, parameter or type. */
export class SyntaxSymbol {
  name: string;
  declarations: SyntaxNode[] = [];
  references: SyntaxNode[] = [];
  // True for import bindings, which ts-morph reports as aliases.
  alias = false;

  constructor(name: string) {
    this.name = name;
  }

  getName(): string {
    return this.name;
  }

  getDeclarations(): SyntaxNode[] {
    return this.declarations;
  }
}

/** One edit to a file's text. */
export interface TextChange {
  start: number;
  end: number;
  text: string;
}

const EMPTY: SyntaxNode[] = [];

const isNameTextKind = (kind: string): boolean =>
  kind === "Identifier" ||
  kind === "PrivateIdentifier" ||
  kind === "StringLiteral" ||
  kind === "NumericLiteral" ||
  kind === "NoSubstitutionTemplateLiteral";

/** A syntax tree node. Field and method names follow ts-morph. */
export class SyntaxNode {
  kind: string;
  pos: number;
  start: number;
  end = 0;
  parent: SyntaxNode | undefined = undefined;
  children: SyntaxNode[] = [];
  fields = new Map<string, SyntaxNode>();
  lists = new Map<string, SyntaxNode[]>();
  flags = 0;
  // Identifier text, cooked literal value, operator, or declaration keyword.
  value = "";
  symbol: SyntaxSymbol | undefined = undefined;
  // The value a shorthand property reads, when this node is one.
  valueSymbol: SyntaxSymbol | undefined = undefined;
  // Only set on the SourceFile node.
  file: SourceText | undefined = undefined;

  constructor(kind: string, pos: number, start: number) {
    this.kind = kind;
    this.pos = pos;
    this.start = start;
  }

  // Tree construction, used by the parser.

  set(name: string, child: SyntaxNode | undefined): void {
    if (child) {
      this.fields.set(name, child);
    }
  }

  setList(name: string, list: SyntaxNode[]): void {
    this.lists.set(name, list);
  }

  field(name: string): SyntaxNode | undefined {
    return this.fields.get(name);
  }

  list(name: string): SyntaxNode[] {
    return this.lists.get(name) ?? EMPTY;
  }

  has(flag: number): boolean {
    return (this.flags & flag) !== 0;
  }

  /** Link children to this node in source order. */
  link(): void {
    const children: SyntaxNode[] = [];
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
    this.children = children;
  }

  // Text and position.

  getKind(): string {
    return this.kind;
  }

  getKindName(): string {
    return this.kind;
  }

  getSourceFile(): SyntaxNode {
    let node: SyntaxNode = this;
    while (node.parent) {
      node = node.parent;
    }
    return node;
  }

  private source(): SourceText {
    const file = this.getSourceFile().file;
    if (!file) {
      throw new Error("Node is not part of a source file.");
    }
    return file;
  }

  getText(): string {
    return this.source().text.slice(this.start, this.end);
  }

  getFullText(): string {
    return this.source().text.slice(this.pos, this.end);
  }

  getStart(): number {
    return this.start;
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

  getStartLineNumber(): number {
    const { text } = this.source();
    let line = 1;
    for (let index = 0; index < this.start; index += 1) {
      if (text.charCodeAt(index) === 10) {
        line += 1;
      }
    }
    return line;
  }

  getFilePath(): string {
    return this.source().path;
  }

  // Navigation.

  getParent(): SyntaxNode | undefined {
    return this.parent;
  }

  getParentOrThrow(): SyntaxNode {
    if (!this.parent) {
      throw new Error(`${this.kind} has no parent.`);
    }
    return this.parent;
  }

  getParentIfKind(kind: string): SyntaxNode | undefined {
    return this.parent?.kind === kind ? this.parent : undefined;
  }

  getChildren(): SyntaxNode[] {
    return this.children;
  }

  /** The list in the parent that holds this node, such as its siblings. */
  getParentList(): SyntaxNode[] | undefined {
    if (!this.parent) {
      return undefined;
    }
    for (const list of this.parent.lists.values()) {
      if (list.includes(this)) {
        return list;
      }
    }
    return undefined;
  }

  getChildIndex(): number {
    const list = this.getParentList();
    if (list) {
      return list.indexOf(this);
    }
    return this.parent ? this.parent.children.indexOf(this) : 0;
  }

  getStatements(): SyntaxNode[] {
    return this.list("statements");
  }

  getAncestors(): SyntaxNode[] {
    const ancestors: SyntaxNode[] = [];
    let node = this.parent;
    while (node) {
      ancestors.push(node);
      node = node.parent;
    }
    return ancestors;
  }

  getFirstAncestor(
    predicate: (node: SyntaxNode | undefined) => boolean
  ): SyntaxNode | undefined {
    let node = this.parent;
    while (node) {
      if (predicate(node)) {
        return node;
      }
      node = node.parent;
    }
    return undefined;
  }

  getFirstAncestorByKind(kind: string): SyntaxNode | undefined {
    let node = this.parent;
    while (node) {
      if (node.kind === kind) {
        return node;
      }
      node = node.parent;
    }
    return undefined;
  }

  getDescendants(): SyntaxNode[] {
    const found: SyntaxNode[] = [];
    const stack: SyntaxNode[] = [];
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

  getDescendantsOfKind(kind: string): SyntaxNode[] {
    return this.getDescendants().filter((node) => node.kind === kind);
  }

  getFirstDescendantByKind(kind: string): SyntaxNode | undefined {
    return this.getDescendants().find((node) => node.kind === kind);
  }

  // Common accessors.

  getExpression(): SyntaxNode {
    const expression = this.field("expression");
    if (!expression) {
      throw new Error(`${this.kind} has no expression.`);
    }
    return expression;
  }

  getExpressionIfExists(): SyntaxNode | undefined {
    return this.field("expression");
  }

  getNameNode(): SyntaxNode {
    const node =
      this.kind === "ImportSpecifier" || this.kind === "ExportSpecifier"
        ? (this.field("propertyName") ?? this.field("name"))
        : this.field("name");
    if (!node) {
      throw new Error(`${this.kind} has no name.`);
    }
    return node;
  }

  getName(): string {
    if (this.kind === "Identifier" || this.kind === "PrivateIdentifier") {
      return this.value;
    }
    const name =
      this.kind === "ImportSpecifier" || this.kind === "ExportSpecifier"
        ? (this.field("propertyName") ?? this.field("name"))
        : this.field("name");
    if (!name) {
      return "";
    }
    return isNameTextKind(name.kind) && name.kind !== "StringLiteral"
      ? name.getText()
      : name.getText();
  }

  getAliasNode(): SyntaxNode | undefined {
    return this.field("propertyName") ? this.field("name") : undefined;
  }

  getPropertyNameNode(): SyntaxNode | undefined {
    return this.field("propertyName");
  }

  getInitializer(): SyntaxNode | undefined {
    return this.field("initializer");
  }

  getInitializerOrThrow(): SyntaxNode {
    const initializer = this.field("initializer");
    if (!initializer) {
      throw new Error(`${this.kind} has no initializer.`);
    }
    return initializer;
  }

  getArguments(): SyntaxNode[] {
    return this.list("arguments");
  }

  getTypeArguments(): SyntaxNode[] {
    return this.list("typeArguments");
  }

  getProperties(): SyntaxNode[] {
    return this.list("properties");
  }

  getElements(): SyntaxNode[] {
    return this.list("elements");
  }

  getAttributes(): SyntaxNode[] {
    return this.field("attributes")?.list("properties") ?? EMPTY;
  }

  getAttribute(name: string): SyntaxNode | undefined {
    return this.getAttributes().find(
      (attribute) =>
        attribute.kind === "JsxAttribute" &&
        attribute.field("name")?.getText() === name
    );
  }

  getTagNameNode(): SyntaxNode {
    const tag = this.field("tagName");
    if (!tag) {
      throw new Error(`${this.kind} has no tag name.`);
    }
    return tag;
  }

  getLeft(): SyntaxNode {
    const left = this.field("left");
    if (!left) {
      throw new Error(`${this.kind} has no left side.`);
    }
    return left;
  }

  getRight(): SyntaxNode {
    const right = this.field("right");
    if (!right) {
      throw new Error(`${this.kind} has no right side.`);
    }
    return right;
  }

  getOperatorText(): string {
    return this.value;
  }

  getCondition(): SyntaxNode | undefined {
    return this.field("condition");
  }

  getWhenTrue(): SyntaxNode {
    const node = this.field("whenTrue");
    if (!node) {
      throw new Error(`${this.kind} has no true branch.`);
    }
    return node;
  }

  getWhenFalse(): SyntaxNode {
    const node = this.field("whenFalse");
    if (!node) {
      throw new Error(`${this.kind} has no false branch.`);
    }
    return node;
  }

  getTypeNode(): SyntaxNode | undefined {
    return this.field("type");
  }

  getTypeName(): SyntaxNode {
    const name = this.field("typeName");
    if (!name) {
      throw new Error(`${this.kind} has no type name.`);
    }
    return name;
  }

  getLiteral(): SyntaxNode {
    const literal = this.field("literal");
    if (!literal) {
      throw new Error(`${this.kind} has no literal.`);
    }
    return literal;
  }

  getArgument(): SyntaxNode {
    const argument = this.field("argument");
    if (!argument) {
      throw new Error(`${this.kind} has no argument.`);
    }
    return argument;
  }

  getBody(): SyntaxNode | undefined {
    return this.field("body");
  }

  getParameters(): SyntaxNode[] {
    return this.list("parameters");
  }

  getDeclarations(): SyntaxNode[] {
    return this.list("declarations");
  }

  getDeclarationList(): SyntaxNode | undefined {
    return this.field("declarationList");
  }

  getDeclarationKind(): string {
    return this.value;
  }

  getDotDotDotToken(): SyntaxNode | undefined {
    return this.has(NodeFlags.DotDotDot) ? this : undefined;
  }

  // Imports and exports.

  getImportDeclarations(): SyntaxNode[] {
    return this.getStatements().filter(
      (statement) => statement.kind === "ImportDeclaration"
    );
  }

  getExportDeclarations(): SyntaxNode[] {
    return this.getStatements().filter(
      (statement) => statement.kind === "ExportDeclaration"
    );
  }

  getModuleSpecifier(): SyntaxNode | undefined {
    return this.field("moduleSpecifier");
  }

  getModuleSpecifierValue(): string | undefined {
    const specifier = this.field("moduleSpecifier");
    return specifier && isNameTextKind(specifier.kind)
      ? specifier.value
      : undefined;
  }

  getImportClause(): SyntaxNode | undefined {
    return this.field("importClause");
  }

  getNamedBindings(): SyntaxNode | undefined {
    return this.field("namedBindings");
  }

  getNamedImports(): SyntaxNode[] {
    const bindings = this.field("importClause")?.field("namedBindings");
    return bindings?.kind === "NamedImports" ? bindings.list("elements") : EMPTY;
  }

  getDefaultImport(): SyntaxNode | undefined {
    return this.field("importClause")?.field("name");
  }

  getNamespaceImport(): SyntaxNode | undefined {
    const bindings = this.field("importClause")?.field("namedBindings");
    return bindings?.kind === "NamespaceImport"
      ? bindings.field("name")
      : undefined;
  }

  getNamedExports(): SyntaxNode[] {
    const clause = this.field("exportClause");
    return clause?.kind === "NamedExports" ? clause.list("elements") : EMPTY;
  }

  hasNamedExports(): boolean {
    return this.field("exportClause")?.kind === "NamedExports";
  }

  getImportDeclaration(): SyntaxNode {
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

  /** Replace a string literal's value, keeping its quote style. */
  setLiteralValue(value: string): SyntaxNode {
    const quote = this.getText().startsWith('"') ? '"' : "'";
    const escaped = value
      .replaceAll("\\", "\\\\")
      .replaceAll(quote, `\\${quote}`)
      .replaceAll("\n", "\\n");
    this.getSourceFile().applyChanges([
      { end: this.end, start: this.start, text: `${quote}${escaped}${quote}` },
    ]);
    return this;
  }

  // Symbols.

  getSymbol(): SyntaxSymbol | undefined {
    return this.symbol;
  }

  getValueSymbol(): SyntaxSymbol | undefined {
    return this.valueSymbol;
  }

  getShorthandAssignmentValueSymbol(): SyntaxSymbol | undefined {
    return this.valueSymbol;
  }

  /** Identifiers in this file that refer to the same declaration. */
  findReferencesAsNodes(): SyntaxNode[] {
    const symbol = this.symbol ?? this.field("name")?.symbol;
    if (!symbol) {
      return EMPTY;
    }
    return symbol.references.filter(
      (reference) =>
        symbol.alias ||
        !symbol.declarations.some(
          (declaration) => declaration.field("name") === reference
        ) ||
        symbol.declarations[0]?.field("name") !== reference
    );
  }

  // Source file edits. Each edit reparses the file, so nodes read before an
  // edit are stale afterwards.

  applyChanges(changes: TextChange[]): void {
    const root = this.getSourceFile();
    const file = root.source();
    const sorted = [...changes].sort(
      (left, right) => right.start - left.start || right.end - left.end
    );
    let { text } = file;
    for (const change of sorted) {
      text = text.slice(0, change.start) + change.text + text.slice(change.end);
    }
    root.replaceWithText(text);
  }

  replaceWithText(text: string): SyntaxNode {
    if (this.parent) {
      const start = this.start;
      const root = this.getSourceFile();
      root.applyChanges([{ end: this.end, start, text }]);
      return root;
    }
    const file = this.source();
    const parsed = file.reparse(text, file.path);
    file.text = text;
    this.fields = parsed.fields;
    this.lists = parsed.lists;
    this.end = parsed.end;
    this.link();
    return this;
  }

  insertText(position: number, text: string): SyntaxNode {
    this.getSourceFile().applyChanges([
      { end: position, start: position, text },
    ]);
    return this;
  }
}

/** The text and parser behind a source file node. */
export class SourceText {
  text: string;
  path: string;
  reparse: (text: string, path: string) => SyntaxNode;

  constructor(
    text: string,
    path: string,
    reparse: (text: string, path: string) => SyntaxNode
  ) {
    this.text = text;
    this.path = path;
    this.reparse = reparse;
  }
}
