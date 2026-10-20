import { runTransform } from "./runner.ts";
import type { CodemodRunOptions, CodemodRunResult } from "./runner.ts";
import {
  applyEdits,
  importedBinding,
  lineIndent,
  toTextEdit,
} from "./source-edits.ts";
import type { TextEdit } from "./source-edits.ts";
import { Node, SyntaxKind } from "./syntax/index.ts";
import type * as Syntax from "./syntax/index.ts";

/** Entries that exported `useConsentManager` before v3.0.0-alpha.3. */
const SOURCE_SPECIFIERS = new Set([
  "@c15t/react",
  "@c15t/react/headless",
  "@c15t/nextjs",
  "@c15t/nextjs/headless",
  "@c15t/tanstack-start",
  "@c15t/tanstack-start/headless",
  "c15t/react",
  "c15t/react/headless",
  "c15t/next",
  "c15t/next/headless",
  "c15t/tanstack-start",
  "c15t/tanstack-start/headless",
]);

const HEADLESS_SUFFIX = "/headless";

/** Fields that map to one selector or action hook call. */
const HOOK_FIELDS = new Map(
  Object.entries({
    activeUI: { expression: "useActiveUI() ?? 'none'", hook: "useActiveUI" },
    branding: { expression: "useBranding() ?? 'c15t'", hook: "useBranding" },
    consents: { expression: "useConsents()", hook: "useConsents" },
    effectivePermissions: {
      expression: "useEffectivePermissions()",
      hook: "useEffectivePermissions",
    },
    explicitChoice: {
      expression: "useExplicitChoice()",
      hook: "useExplicitChoice",
    },
    iab: { expression: "useIABSnapshot()", hook: "useIABSnapshot" },
    model: { expression: "useModel() ?? 'opt-in'", hook: "useModel" },
    noticeDismissal: {
      expression: "useNoticeDismissal()",
      hook: "useNoticeDismissal",
    },
    policyBanner: {
      expression: "usePromptPresentation()",
      hook: "usePromptPresentation",
    },
    policyDialog: {
      expression: "usePreferencesPresentation()",
      hook: "usePreferencesPresentation",
    },
    policyRule: { expression: "usePolicyRule()", hook: "usePolicyRule" },
    policyScopeMode: {
      expression: "usePolicyScopeMode()",
      hook: "usePolicyScopeMode",
    },
    privacySignals: {
      expression: "usePrivacySignals()",
      hook: "usePrivacySignals",
    },
    promptRequirement: {
      expression: "usePromptRequirement()",
      hook: "usePromptRequirement",
    },
    resolution: {
      expression: "usePolicyResolution()",
      hook: "usePolicyResolution",
    },
    restrictions: { expression: "useRestrictions()", hook: "useRestrictions" },
    setActiveUI: { expression: "useSetActiveUI()", hook: "useSetActiveUI" },
    subscribeToConsentChanges: {
      expression: "useSubscribeToConsentChanges()",
      hook: "useSubscribeToConsentChanges",
    },
    updateConsentCategories: {
      expression: "useRegisterConsentCategories()",
      hook: "useRegisterConsentCategories",
    },
    vendorChoice: { expression: "useVendorChoice()", hook: "useVendorChoice" },
    vendors: { expression: "useDeclaredVendors()", hook: "useDeclaredVendors" },
  })
);

/** Fields that become properties of one `useConsentDraft()` destructuring. */
const DRAFT_FIELDS = new Map(
  Object.entries({
    draftIsStale: "isStale",
    resetDraft: "reset",
    selectedConsentTypes: "values",
    selectedConsents: "values",
    selectedVendors: "vendors",
    setSelectedConsent: "set",
    setSelectedVendor: "setVendor",
  })
);

/** What to use instead of a field the codemod cannot rewrite. */
const MANUAL_HINTS = new Map(
  Object.entries({
    consentCategories: "useConsentDraft().displayedCategories",
    consentInfo: "useExplicitChoice()",
    consentTypes:
      "useConsentDraft().displayedCategories, with labels from useTranslations().consentTypes",
    getDisplayedConsents:
      "useConsentDraft().displayedCategories, with labels from useTranslations().consentTypes",
    getDisplayedVendors: "useDeclaredVendors() filtered by category",
    has: "useConsent(category), one call per category at the top of the component",
    hasConsented: "useExplicitChoice() !== null",
    identifyUser: "useIdentify()",
    manager: "nothing; it was always null in v3",
    optOutDirectives:
      "nothing; GPC is no longer stored, read the live signal with usePrivacySignals()",
    saveConsents:
      "useHeadlessConsentUI().saveCustomPreferences('all' | 'none'), or with no argument for the draft",
    setConsent: "useSaveConsents(), called with { [category]: value }",
    translationConfig: "useTranslations() for the active strings",
  })
);

const SAVE_ARGUMENTS = new Map(
  Object.entries({
    all: "'all'",
    custom: "",
    necessary: "'none'",
  })
);

const TODO_PREFIX = "TODO(c15t v3): useConsentManager() was removed.";
const MANUAL_TODO = `${TODO_PREFIX} Migrate these fields by hand:`;

interface UseConsentManagerResult {
  changed: boolean;
  operations: number;
  summaries: string[];
}

interface Edit {
  node: Syntax.Node;
  text: string;
}

interface FieldPlan {
  statements: string[];
  hooks: Set<string>;
  headlessHooks: Set<string>;
  manual: { text: string; field: string }[];
  edits: Edit[];
  draftProperties: string[];
  usesDraftSave: boolean;
  usesMemo: boolean;
}

/** How this file calls React's `useMemo`, and whether it must import it. */
interface MemoCallee {
  callee: string;
  needsImport: boolean;
}

const toPascalCase = function toPascalCase(value: string): string {
  return value
    .split(/[^A-Za-z0-9]+/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
};

const bindingPropertyName = function bindingPropertyName(
  element: Syntax.BindingElement
): string | undefined {
  const propertyNameNode = element.getPropertyNameNode();
  if (!propertyNameNode) {
    const nameNode = element.getNameNode();
    return Node.isIdentifier(nameNode) ? nameNode.getText() : undefined;
  }
  if (Node.isIdentifier(propertyNameNode)) {
    return propertyNameNode.getText();
  }
  if (Node.isStringLiteral(propertyNameNode)) {
    return propertyNameNode.getLiteralText();
  }
  return undefined;
};

/** Every use of a binding other than its declaration. */
const usesOf = function usesOf(name: Syntax.Identifier): Syntax.Node[] {
  return name
    .findReferencesAsNodes()
    .filter(
      (reference) =>
        reference.getSourceFile() === name.getSourceFile() &&
        reference.getStart() !== name.getStart()
    );
};

/** The literal argument of each call, or `null` when a use is not a literal call. */
const literalCallArguments = function literalCallArguments(
  uses: Syntax.Node[]
): { call: Syntax.CallExpression; value: string }[] | null {
  const calls: { call: Syntax.CallExpression; value: string }[] = [];
  for (const use of uses) {
    const call = use.getParent();
    if (!Node.isCallExpression(call) || call.getExpression() !== use) {
      return null;
    }
    const args = call.getArguments();
    const [argument] = args;
    if (args.length !== 1 || !Node.isStringLiteral(argument)) {
      return null;
    }
    calls.push({ call, value: argument.getLiteralText() });
  }
  return calls;
};

const uniqueName = function uniqueName(
  sourceFile: Syntax.SourceFile,
  taken: Set<string>,
  base: string
): string {
  const text = sourceFile.getFullText();
  const isFree = (candidate: string) =>
    !taken.has(candidate) && !new RegExp(`\\b${candidate}\\b`, "u").test(text);
  let candidate = base;
  let suffix = 2;
  while (!isFree(candidate)) {
    candidate = `${base}${suffix}`;
    suffix += 1;
  }
  taken.add(candidate);
  return candidate;
};

const planHas = function planHas(
  sourceFile: Syntax.SourceFile,
  local: Syntax.Identifier,
  plan: FieldPlan,
  taken: Set<string>
): boolean {
  const calls = literalCallArguments(usesOf(local));
  if (!calls) {
    return false;
  }
  const names = new Map<string, string>();
  for (const { call, value } of calls) {
    let name = names.get(value);
    if (!name) {
      name = uniqueName(
        sourceFile,
        taken,
        `${local.getText()}${toPascalCase(value)}`
      );
      names.set(value, name);
      plan.statements.push(
        `const ${name} = useConsent(${JSON.stringify(value).replaceAll('"', "'")});`
      );
    }
    plan.edits.push({ node: call, text: name });
  }
  plan.hooks.add("useConsent");
  return true;
};

const planSave = function planSave(
  local: Syntax.Identifier,
  plan: FieldPlan
): boolean {
  const calls = literalCallArguments(usesOf(local));
  if (!calls || calls.some(({ value }) => !SAVE_ARGUMENTS.has(value))) {
    return false;
  }
  for (const { call, value } of calls) {
    const replacement = SAVE_ARGUMENTS.get(value) ?? "";
    plan.edits.push({
      node: call,
      text: `${call.getExpression().getText()}(${replacement})`,
    });
    if (value === "custom") {
      plan.usesDraftSave = true;
    }
  }
  const name = local.getText();
  plan.statements.push(
    `const { saveCustomPreferences${name === "saveCustomPreferences" ? "" : `: ${name}`} } = useHeadlessConsentUI();`
  );
  plan.headlessHooks.add("useHeadlessConsentUI");
  return true;
};

/**
 * `policyCategories` was memoized, so effects and memoized children that
 * depend on it did not rerun on unrelated renders. Keep it stable.
 */
const planPolicyCategories = function planPolicyCategories(
  sourceFile: Syntax.SourceFile,
  name: string,
  plan: FieldPlan,
  taken: Set<string>,
  memo: MemoCallee
): void {
  const scope = uniqueName(sourceFile, taken, `${name}Scope`);
  plan.statements.push(
    `const ${scope} = usePolicyCategories();`,
    `const ${name} = ${memo.callee}(() => ['necessary', ...${scope}], [${scope}]);`
  );
  plan.hooks.add("usePolicyCategories");
  plan.usesMemo = true;
};

const planElement = function planElement(
  sourceFile: Syntax.SourceFile,
  element: Syntax.BindingElement,
  plan: FieldPlan,
  taken: Set<string>,
  memo: MemoCallee
): void {
  const key = bindingPropertyName(element);
  const local = element.getNameNode();
  const keep = () =>
    plan.manual.push({
      field: key ?? element.getText(),
      text: element.getText(),
    });
  if (
    !key ||
    element.getDotDotDotToken() ||
    element.getInitializer() ||
    !Node.isIdentifier(local)
  ) {
    keep();
    return;
  }
  const name = local.getText();
  if (key === "policyCategories") {
    planPolicyCategories(sourceFile, name, plan, taken, memo);
    return;
  }
  const field = HOOK_FIELDS.get(key);
  if (field) {
    plan.statements.push(`const ${name} = ${field.expression};`);
    plan.hooks.add(field.hook);
    return;
  }
  const property = DRAFT_FIELDS.get(key);
  if (property) {
    plan.draftProperties.push(
      property === name ? property : `${property}: ${name}`
    );
    return;
  }
  if (key === "has" && planHas(sourceFile, local, plan, taken)) {
    return;
  }
  if (key === "saveConsents" && planSave(local, plan)) {
    return;
  }
  keep();
};

const manualComment = function manualComment(
  fields: string[],
  indent: string
): string {
  const lines = fields.map((field) => {
    const hint = MANUAL_HINTS.get(field) ?? "no direct v3 replacement";
    return `${indent}// - ${field}: ${hint}`;
  });
  return [`// ${MANUAL_TODO}`, ...lines].join("\n");
};

interface CallContext {
  sourceFile: Syntax.SourceFile;
  localName: string;
  edits: TextEdit[];
  hooks: Set<string>;
  headlessHooks: Set<string>;
  summaries: string[];
  memo: MemoCallee;
  usesMemo: boolean;
}

/** Marks a call the codemod cannot destructure, leaving it in place. */
const markCall = function markCall(
  call: Syntax.CallExpression,
  context: CallContext
): boolean {
  const anchor =
    call.getFirstAncestorByKind(SyntaxKind.VariableStatement) ??
    call.getFirstAncestorByKind(SyntaxKind.ExpressionStatement);
  if (!anchor || anchor.getFullText().includes(TODO_PREFIX)) {
    return false;
  }
  context.edits.push({
    end: anchor.getStart(),
    start: anchor.getStart(),
    text: `// ${TODO_PREFIX} Read each field through its own hook; see the v3 upgrade guide.\n${lineIndent(anchor)}`,
  });
  context.summaries.push("TODO: useConsentManager() without destructuring");
  return true;
};

/** The statements that replace one `useConsentManager()` destructuring. */
const replacementLines = function replacementLines(
  plan: FieldPlan,
  indent: string,
  localName: string
): string[] {
  const lines: string[] = [];
  if (plan.draftProperties.length > 0 || plan.usesDraftSave) {
    lines.push(
      `// ${TODO_PREFIX} Its draft and save now come from separate hooks. Render the components that edit and save choices inside one <ConsentDraftProvider> so they share a draft.`
    );
  }
  if (plan.draftProperties.length > 0) {
    lines.push(
      `const { ${[...new Set(plan.draftProperties)].join(", ")} } = useConsentDraft();`
    );
    plan.hooks.add("useConsentDraft");
  }
  lines.push(...plan.statements);
  if (plan.manual.length > 0) {
    lines.push(
      manualComment(
        plan.manual.map(({ field }) => field),
        indent
      ),
      `const { ${plan.manual.map(({ text }) => text).join(", ")} } = ${localName}();`
    );
  }
  return lines;
};

const planCall = function planCall(
  call: Syntax.CallExpression,
  context: CallContext
): boolean {
  const declaration = call.getParentIfKind(SyntaxKind.VariableDeclaration);
  const list = declaration?.getParentIfKind(SyntaxKind.VariableDeclarationList);
  const statement = list?.getParentIfKind(SyntaxKind.VariableStatement);
  const pattern = declaration?.getNameNode();
  if (
    !declaration ||
    !list ||
    !statement ||
    list.getDeclarations().length !== 1 ||
    declaration.getTypeNode() ||
    !Node.isObjectBindingPattern(pattern)
  ) {
    return markCall(call, context);
  }
  // A residual call from an earlier run already carries its TODO.
  if (statement.getFullText().includes(MANUAL_TODO)) {
    return false;
  }

  const plan: FieldPlan = {
    draftProperties: [],
    edits: [],
    headlessHooks: new Set(),
    hooks: new Set(),
    manual: [],
    statements: [],
    usesDraftSave: false,
    usesMemo: false,
  };
  const taken = new Set<string>();
  for (const element of pattern.getElements()) {
    if (!Node.isBindingElement(element)) {
      continue;
    }
    planElement(context.sourceFile, element, plan, taken, context.memo);
  }
  const indent = lineIndent(statement);
  const keyword = list.getDeclarationKind();
  const replacement = replacementLines(plan, indent, context.localName)
    .map((line) =>
      keyword === "const" ? line : line.replace(/^const /u, `${keyword} `)
    )
    .join(`\n${indent}`);

  context.edits.push(
    ...plan.edits.map(({ node, text }) => toTextEdit(node, text)),
    toTextEdit(statement, replacement)
  );
  for (const hook of plan.hooks) {
    context.hooks.add(hook);
  }
  for (const hook of plan.headlessHooks) {
    context.headlessHooks.add(hook);
  }
  context.usesMemo ||= plan.usesMemo;
  const mapped = [...plan.hooks, ...plan.headlessHooks];
  if (mapped.length > 0) {
    context.summaries.push(`useConsentManager -> ${mapped.join(", ")}`);
  }
  for (const { field } of plan.manual) {
    context.summaries.push(`TODO: ${field}`);
  }
  return true;
};

const findMemoCallee = function findMemoCallee(
  sourceFile: Syntax.SourceFile
): MemoCallee {
  const reactImports = sourceFile
    .getImportDeclarations()
    .filter(
      (declaration) =>
        declaration.getModuleSpecifierValue() === "react" &&
        !declaration.isTypeOnly()
    );
  for (const declaration of reactImports) {
    const named = declaration
      .getNamedImports()
      .find((specifier) => specifier.getName() === "useMemo");
    if (named && !named.isTypeOnly()) {
      return {
        callee: named.getAliasNode()?.getText() ?? "useMemo",
        needsImport: false,
      };
    }
  }
  for (const declaration of reactImports) {
    const react =
      declaration.getNamespaceImport() ?? declaration.getDefaultImport();
    if (react) {
      return { callee: `${react.getText()}.useMemo`, needsImport: false };
    }
  }
  return { callee: "useMemo", needsImport: true };
};

const findImport = function findImport(
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

const addNamedImports = function addNamedImports(
  sourceFile: Syntax.SourceFile,
  specifier: string,
  names: Set<string>,
  after: Syntax.ImportDeclaration,
  quote: string
): void {
  const existing = findImport(sourceFile, specifier);
  const present = new Set(
    existing?.getNamedImports().map((named) => named.getName())
  );
  const missing = [...names].filter((name) => !present.has(name)).toSorted();
  if (missing.length === 0) {
    return;
  }
  if (existing) {
    existing.addNamedImports(missing);
    return;
  }
  sourceFile.insertStatements(
    after.getChildIndex() + 1,
    `import { ${missing.join(", ")} } from ${quote}${specifier}${quote};`
  );
};

/**
 * Adds the replacement hook imports and drops the `useConsentManager` import
 * once no reference to it is left.
 */
const updateImports = function updateImports(
  sourceFile: Syntax.SourceFile,
  specifier: string,
  quote: string,
  context: CallContext
): void {
  const base = specifier.endsWith(HEADLESS_SUFFIX)
    ? specifier.slice(0, -HEADLESS_SUFFIX.length)
    : specifier;
  // The edits re-parsed the file; find the import again.
  const currentImport = sourceImports(sourceFile).find(
    (named) => localNameOf(named) === context.localName
  );
  const current = currentImport?.getImportDeclaration();
  if (!current || !currentImport) {
    return;
  }
  const currentBinding = importedBinding(currentImport);
  const stillUsed = sourceFile
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .some(
      (identifier) =>
        !identifier.getFirstAncestorByKind(SyntaxKind.ImportDeclaration) &&
        currentBinding.isReference(identifier)
    );
  addNamedImports(sourceFile, base, context.hooks, current, quote);
  addNamedImports(
    sourceFile,
    `${base}${HEADLESS_SUFFIX}`,
    context.headlessHooks,
    current,
    quote
  );
  if (context.usesMemo && context.memo.needsImport) {
    addNamedImports(sourceFile, "react", new Set(["useMemo"]), current, quote);
  }
  if (!stillUsed) {
    currentImport.remove();
    if (
      current.getNamedImports().length === 0 &&
      !current.getDefaultImport() &&
      !current.getNamespaceImport()
    ) {
      current.remove();
    }
  }
};

/** The name a `useConsentManager` import binds in the file. */
const localNameOf = function localNameOf(
  named: Syntax.ImportSpecifier
): string {
  return named.getAliasNode()?.getText() ?? named.getName();
};

/** Every value import of `useConsentManager` from a c15t entry. */
const sourceImports = function sourceImports(
  sourceFile: Syntax.SourceFile
): Syntax.ImportSpecifier[] {
  return sourceFile
    .getImportDeclarations()
    .filter(
      (candidate) =>
        SOURCE_SPECIFIERS.has(candidate.getModuleSpecifierValue()) &&
        !candidate.isTypeOnly()
    )
    .flatMap((candidate) => candidate.getNamedImports())
    .filter(
      (named) => named.getName() === "useConsentManager" && !named.isTypeOnly()
    );
};

/** Migrates the calls of one `useConsentManager` import. */
const transformImport = function transformImport(
  sourceFile: Syntax.SourceFile,
  namedImport: Syntax.ImportSpecifier,
  summaries: string[]
): number {
  const declaration = namedImport.getImportDeclaration();
  const specifier = declaration.getModuleSpecifierValue();
  const quote = declaration.getModuleSpecifier().getText().charAt(0);
  const context: CallContext = {
    edits: [],
    headlessHooks: new Set(),
    hooks: new Set(),
    localName: localNameOf(namedImport),
    memo: findMemoCallee(sourceFile),
    sourceFile,
    summaries,
    usesMemo: false,
  };
  const imported = importedBinding(namedImport);
  let operations = 0;
  for (const call of sourceFile.getDescendantsOfKind(
    SyntaxKind.CallExpression
  )) {
    if (imported.isReference(call.getExpression()) && planCall(call, context)) {
      operations += 1;
    }
  }
  if (operations === 0) {
    return 0;
  }
  applyEdits(sourceFile, context.edits);

  updateImports(sourceFile, specifier, quote, context);
  return operations;
};

const transformSourceFile = function transformSourceFile(
  sourceFile: Syntax.SourceFile
): UseConsentManagerResult {
  const summaries: string[] = [];
  let operations = 0;
  // Each import's edits re-parse the file, so find the next one again.
  for (const localName of sourceImports(sourceFile).map(localNameOf)) {
    const namedImport = sourceImports(sourceFile).find(
      (named) => localNameOf(named) === localName
    );
    if (namedImport) {
      operations += transformImport(sourceFile, namedImport, summaries);
    }
  }
  return { changed: operations > 0, operations, summaries };
};

/**
 * Rewrites `useConsentManager()` destructuring to the v3 selector, draft and
 * headless hooks. Fields with no one-call replacement stay on a residual
 * `useConsentManager()` call under a TODO comment, so the build points at
 * them.
 *
 * @param options - Codemod execution options.
 * @returns Changed files and non-fatal per-file errors.
 */
export const runUseConsentManagerToHooksCodemod =
  function runUseConsentManagerToHooksCodemod(
    options: CodemodRunOptions
  ): Promise<CodemodRunResult> {
    return runTransform(options, transformSourceFile);
  };

export type { CodemodRunOptions, CodemodRunResult } from "./runner.ts";
