import { runTransform } from "./runner.ts";
import type { CodemodRunOptions, CodemodRunResult } from "./runner.ts";
import { moduleSpecifiersOf } from "./source-edits.ts";
import type { SourceFile, StringLiteral } from "./syntax/index.ts";

const OLD_PACKAGE = "@c15t/scripts";
const NEW_PACKAGE = "@c15t/integrations";

const transformSourceFile = (sourceFile: SourceFile) => {
  let operations = 0;
  const rename = (literal: StringLiteral) => {
    const value = literal.getLiteralValue();
    if (value === OLD_PACKAGE || value.startsWith(`${OLD_PACKAGE}/`)) {
      literal.setLiteralValue(
        `${NEW_PACKAGE}${value.slice(OLD_PACKAGE.length)}`
      );
      operations += 1;
    }
  };

  for (const literal of moduleSpecifiersOf(sourceFile)) {
    rename(literal);
  }
  return {
    changed: operations > 0,
    operations,
    summaries: operations > 0 ? [`${OLD_PACKAGE} -> ${NEW_PACKAGE}`] : [],
  };
};

/**
 * Renames vendor package imports in JavaScript and TypeScript sources for v3.
 *
 * @param options Codemod execution options.
 * @returns Source changes and per-file errors. Dependencies are updated separately.
 */
export const runScriptsToIntegrationsCodemod = (
  options: CodemodRunOptions
): Promise<CodemodRunResult> => runTransform(options, transformSourceFile);
