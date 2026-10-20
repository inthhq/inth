import { dependenciesOf, readPackageJson, usesUmbrella } from "./manifest.ts";
import type { PackageJson } from "./manifest.ts";
import { runTransform } from "./runner.ts";
import type { CodemodRunOptions, CodemodRunResult } from "./runner.ts";
import {
  addTodo,
  applyEdits,
  findProperty,
  localDeclarationsOf,
  moduleSpecifiersOf,
  propertyRemoval,
  referencesOf,
  sourceNameOf,
  toTextEdit,
  UNCHANGED,
  unwrapExpression,
} from "./source-edits.ts";
import type { TextEdit, TransformResult } from "./source-edits.ts";
import { Node, SyntaxKind } from "./syntax/index.ts";
import type * as Syntax from "./syntax/index.ts";

/** v2 React entries of `@c15t/dev-tools`. v3 serves every name they exported from the framework's `/devtools` entry. */
const OLD_ENTRIES = new Set([
  "@c15t/dev-tools/react",
  "@c15t/dev-tools/tanstack",
]);

/** Components and the plugin factory that took a store `namespace` in v2. */
const NAMESPACE_TAKERS = new Set([
  "C15TDevTools",
  "C15tTanStackDevtoolsPanel",
  "DevTools",
  "c15tDevtools",
  "c15tDevtoolsPlugin",
]);

/** Store helpers the v2 `@c15t/dev-tools` root exported and v3 removed. */
const REMOVED_ROOT = new Set([
  "createDevToolsPanel",
  "createStoreConnector",
  "getC15tStore",
  "isC15tStoreAvailable",
  "StoreConnector",
  "StoreConnectorOptions",
]);

const REMOVED_ROOT_TODO = (name: string) =>
  `${name} was removed. Dev tools read the consent engine; render DevTools inside the provider, or call createDevTools({ kernel }).`;

/** Picks the `/devtools` entry that matches how the app installs c15t. */
const devtoolsEntryFor = async function devtoolsEntryFor(
  projectRoot: string,
  manifest: PackageJson | null
): Promise<string> {
  const dependencies = dependenciesOf(manifest);
  const usesNext =
    dependencies.next !== undefined ||
    dependencies["@c15t/nextjs"] !== undefined;
  if (await usesUmbrella(projectRoot, dependencies)) {
    return usesNext ? "c15t/next/devtools" : "c15t/react/devtools";
  }
  return usesNext ? "@c15t/nextjs/devtools" : "@c15t/react/devtools";
};

/** The module each name comes from, for `sourceNameOf`. */
const modulesFor = (
  names: ReadonlySet<string>,
  modules: readonly string[]
): ReadonlyMap<string, readonly string[]> =>
  new Map([...names].map((name) => [name, modules] as const));

const TAKER_MODULES = modulesFor(NAMESPACE_TAKERS, [...OLD_ENTRIES]);
const REMOVED_ROOT_MODULES = modulesFor(REMOVED_ROOT, ["@c15t/dev-tools"]);

/**
 * Drops `namespace` from the JSX element or call that `tag` names, as in
 * `<DevTools namespace="…" />`, `<D.DevTools namespace="…" />` or
 * `c15tDevtools({ namespace })`.
 */
const planNamespaceProp = function planNamespaceProp(
  tag: Syntax.Node,
  edits: TextEdit[]
): number {
  const parent = tag.getParent();
  if (
    (Node.isJsxOpeningElement(parent) ||
      Node.isJsxSelfClosingElement(parent)) &&
    parent.getTagNameNode() === tag
  ) {
    const attribute = parent.getAttribute("namespace");
    if (!attribute) {
      return 0;
    }
    edits.push(propertyRemoval(attribute));
    return 1;
  }
  if (!(Node.isCallExpression(parent) && parent.getExpression() === tag)) {
    return 0;
  }
  const [argument] = parent.getArguments();
  const object = argument && unwrapExpression(argument);
  const property =
    object && Node.isObjectLiteralExpression(object)
      ? findProperty(object, "namespace")
      : undefined;
  if (!property) {
    return 0;
  }
  edits.push(propertyRemoval(property));
  return 1;
};

/**
 * The places that use a `namespace` taker from the v2 React entries: the
 * references of a named import, and `D.DevTools` after a namespace or
 * default import.
 */
const namespaceTakersOf = function namespaceTakersOf(
  sourceFile: Syntax.SourceFile
): Syntax.Node[] {
  const named = sourceFile
    .getImportDeclarations()
    .filter((declaration) =>
      OLD_ENTRIES.has(declaration.getModuleSpecifierValue())
    )
    .flatMap((declaration) => declaration.getNamedImports())
    .filter((specifier) => NAMESPACE_TAKERS.has(specifier.getName()))
    .flatMap((specifier) => referencesOf(specifier));
  const accessed = sourceFile
    .getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)
    .filter((access) => sourceNameOf(access, TAKER_MODULES) !== undefined);
  return [...named, ...accessed];
};

/** Marks removed store helpers imported by name or reached as `D.getC15tStore`. */
const planRemovedRoot = function planRemovedRoot(
  sourceFile: Syntax.SourceFile,
  edits: TextEdit[],
  summaries: Set<string>
): number {
  let operations = 0;
  const mark = (declaration: Syntax.Node, name: string) => {
    if (addTodo(declaration, REMOVED_ROOT_TODO(name), edits)) {
      summaries.add(`TODO: ${name}`);
      operations += 1;
    }
  };
  for (const declaration of sourceFile.getImportDeclarations()) {
    if (declaration.getModuleSpecifierValue() !== "@c15t/dev-tools") {
      continue;
    }
    for (const named of declaration.getNamedImports()) {
      if (REMOVED_ROOT.has(named.getName())) {
        mark(declaration, named.getName());
      }
    }
  }
  for (const access of sourceFile.getDescendantsOfKind(
    SyntaxKind.PropertyAccessExpression
  )) {
    const namespace = access.getExpression();
    const declaration =
      sourceNameOf(access, REMOVED_ROOT_MODULES) !== undefined &&
      Node.isIdentifier(namespace)
        ? localDeclarationsOf(namespace)[0]?.getFirstAncestorByKind(
            SyntaxKind.ImportDeclaration
          )
        : undefined;
    if (declaration) {
      mark(declaration, access.getName());
    }
  }
  return operations;
};

const transformWith = (entry: string) =>
  function transformSourceFile(sourceFile: Syntax.SourceFile): TransformResult {
    const edits: TextEdit[] = [];
    const summaries = new Set<string>();
    let operations = 0;
    // Imports, re-exports, `import()`, `require()`, mocks and import types.
    for (const literal of moduleSpecifiersOf(sourceFile)) {
      const specifier = literal.getLiteralValue();
      if (OLD_ENTRIES.has(specifier)) {
        const quote = literal.getText().charAt(0);
        edits.push(toTextEdit(literal, `${quote}${entry}${quote}`));
        summaries.add(`${specifier} -> ${entry}`);
        operations += 1;
      }
    }
    let removed = 0;
    for (const tag of namespaceTakersOf(sourceFile)) {
      removed += planNamespaceProp(tag, edits);
    }
    if (removed > 0) {
      summaries.add("removed namespace prop");
      operations += removed;
    }
    operations += planRemovedRoot(sourceFile, edits, summaries);
    if (edits.length === 0) {
      return UNCHANGED;
    }
    applyEdits(sourceFile, edits);
    return { changed: true, operations, summaries: [...summaries] };
  };

/**
 * Points `@c15t/dev-tools/react` and `@c15t/dev-tools/tanstack` imports at
 * the framework's `/devtools` entry, `c15t/next/devtools` in a Next.js app
 * and `c15t/react/devtools` otherwise, and removes the `namespace` prop v3
 * dropped. Removed store helpers get a `TODO(c15t v3)` comment.
 *
 * @param options - Codemod execution options.
 * @returns Changed files and non-fatal per-file errors.
 */
export const runDevToolsToC15tCodemod = async function runDevToolsToC15tCodemod(
  options: CodemodRunOptions
): Promise<CodemodRunResult> {
  const manifest = await readPackageJson(options.projectRoot);
  const entry = await devtoolsEntryFor(options.projectRoot, manifest);
  return runTransform(options, transformWith(entry));
};
