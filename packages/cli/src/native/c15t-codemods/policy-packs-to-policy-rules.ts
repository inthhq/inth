import { runTransform } from "./runner.ts";
import type { CodemodRunOptions, CodemodRunResult } from "./runner.ts";
import {
  addTodo,
  applyEdits,
  moveSpecifiers,
  referencesOf,
  renamedSpecifierText,
  toTextEdit,
  UNCHANGED,
} from "./source-edits.ts";
import type {
  SpecifierMove,
  TextEdit,
  TransformResult,
} from "./source-edits.ts";
import { Node, SyntaxKind } from "./syntax/index.ts";
import type * as Syntax from "./syntax/index.ts";

/**
 * v2 entries that exported `policyPackPresets`, and the v3 entry that
 * exports `policyRulePresets` for the same install. The React and Next.js
 * entries no longer export presets.
 */
const PRESET_ENTRIES = new Map(
  Object.entries({
    "@c15t/backend": "@c15t/backend",
    "@c15t/nextjs": "@c15t/core",
    "@c15t/nextjs/headless": "@c15t/core",
    "@c15t/react": "@c15t/core",
    "@c15t/react/headless": "@c15t/core",
    "@c15t/schema": "@c15t/schema",
    "@c15t/schema/types": "@c15t/schema/types",
    c15t: "c15t",
    "c15t/next": "c15t",
    "c15t/next/headless": "c15t",
    "c15t/react": "c15t",
    "c15t/react/headless": "c15t",
  })
);

const RENAMES = new Map(
  Object.entries({
    PolicyPackPresets: "PolicyRulePresets",
    policyPackPresets: "policyRulePresets",
  })
);

const METHOD_RENAMES = new Map(
  Object.entries({
    worldNoBanner: "worldOptOutNoPrompt",
  })
);

/** Rewrites `presets.worldNoBanner` and `const { worldNoBanner } = presets`. */
const planMethodRenames = function planMethodRenames(
  references: Syntax.Node[],
  edits: TextEdit[]
): number {
  let operations = 0;
  for (const reference of references) {
    const parent = reference.getParent();
    if (
      Node.isPropertyAccessExpression(parent) &&
      parent.getExpression() === reference
    ) {
      const next = METHOD_RENAMES.get(parent.getName());
      if (next) {
        edits.push(toTextEdit(parent.getNameNode(), next));
        operations += 1;
      }
      continue;
    }
    if (
      Node.isVariableDeclaration(parent) &&
      parent.getInitializer() === reference
    ) {
      const pattern = parent.getNameNode();
      if (!Node.isObjectBindingPattern(pattern)) {
        continue;
      }
      for (const element of pattern.getElements()) {
        const key = (
          element.getPropertyNameNode() ?? element.getNameNode()
        ).getText();
        const next = METHOD_RENAMES.get(key);
        if (!next) {
          continue;
        }
        edits.push(
          toTextEdit(
            element,
            element.getPropertyNameNode()
              ? element.getText().replace(key, next)
              : `${next}: ${key}`
          )
        );
        operations += 1;
      }
    }
  }
  return operations;
};

const transformSourceFile = function transformSourceFile(
  sourceFile: Syntax.SourceFile
): TransformResult {
  const edits: TextEdit[] = [];
  const summaries: string[] = [];
  let operations = 0;
  for (const declaration of sourceFile.getImportDeclarations()) {
    const entry = declaration.getModuleSpecifierValue();
    const target = PRESET_ENTRIES.get(entry);
    if (!target) {
      continue;
    }
    const moves = new Map<Syntax.Node, SpecifierMove>();
    for (const named of declaration.getNamedImports()) {
      const next = RENAMES.get(named.getName());
      if (!next) {
        continue;
      }
      const references = referencesOf(named);
      if (!named.getAliasNode()) {
        for (const reference of references) {
          edits.push(toTextEdit(reference, next));
        }
      }
      const methods = planMethodRenames(references, edits);
      operations += 1 + methods;
      summaries.push(`${named.getName()} -> ${next}`);
      if (methods > 0) {
        summaries.push("worldNoBanner -> worldOptOutNoPrompt");
      }
      if (target === entry) {
        edits.push(toTextEdit(named.getNameNode(), next));
      } else {
        moves.set(named, {
          target,
          text: renamedSpecifierText(named, next, false),
        });
      }
    }
    moveSpecifiers(declaration, moves, edits);
  }
  // `import * as c15t from 'c15t'` then `c15t.policyPackPresets.worldNoBanner()`.
  for (const access of sourceFile.getDescendantsOfKind(
    SyntaxKind.PropertyAccessExpression
  )) {
    const next = RENAMES.get(access.getName());
    const namespace = access.getExpression();
    if (!next || !Node.isIdentifier(namespace)) {
      continue;
    }
    const declaration = namespace
      .getSymbol()
      ?.getDeclarations()
      .find((imported) => Node.isNamespaceImport(imported))
      ?.getFirstAncestorByKind(SyntaxKind.ImportDeclaration);
    const entry = declaration?.getModuleSpecifierValue();
    const target = entry === undefined ? undefined : PRESET_ENTRIES.get(entry);
    if (!(declaration && entry && target)) {
      continue;
    }
    let renamed = 0;
    if (target === entry) {
      edits.push(toTextEdit(access.getNameNode(), next));
      summaries.push(`${access.getName()} -> ${next}`);
      renamed = 1;
    } else if (
      // The entry no longer exports presets, so the access can't stay.
      addTodo(
        declaration,
        `${access.getText()}: ${entry} no longer exports presets. Import ${next} from ${target}.`,
        edits
      )
    ) {
      summaries.push(`TODO: ${access.getName()}`);
      renamed = 1;
    }
    const methods = planMethodRenames([access], edits);
    operations += renamed + methods;
    if (methods > 0) {
      summaries.push("worldNoBanner -> worldOptOutNoPrompt");
    }
  }
  if (edits.length === 0) {
    return UNCHANGED;
  }
  applyEdits(sourceFile, edits);
  return { changed: true, operations, summaries: [...new Set(summaries)] };
};

/**
 * Renames `policyPackPresets` to `policyRulePresets` and `worldNoBanner()`
 * to `worldOptOutNoPrompt()`, the v3 preset with the same behaviour. Imports
 * from React and Next.js entries move to the headless engine entry, which is
 * the only client entry that exports them in v3.
 *
 * @param options - Codemod execution options.
 * @returns Changed files and non-fatal per-file errors.
 */
export const runPolicyPacksToPolicyRulesCodemod =
  function runPolicyPacksToPolicyRulesCodemod(
    options: CodemodRunOptions
  ): Promise<CodemodRunResult> {
    return runTransform(options, transformSourceFile);
  };
