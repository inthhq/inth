// The slice of ts-morph's API the codemods use, over the codemod parser. The
// codemods were written against ts-morph, which Scriptc cannot compile, so
// these names let them keep their shape.

import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";

import type { Node, NodeOf, SyntaxSymbol } from "./node.ts";
import { parseSourceFile } from "./parser.ts";

export { Node, SyntaxKind } from "./node.ts";

export type BindingElement = NodeOf<"BindingElement">;
export type CallExpression = NodeOf<"CallExpression">;
export type ExportDeclaration = NodeOf<"ExportDeclaration">;
export type ExportSpecifier = NodeOf<"ExportSpecifier">;
export type Identifier = NodeOf<"Identifier">;
export type ImportDeclaration = NodeOf<"ImportDeclaration">;
export type ImportSpecifier = NodeOf<"ImportSpecifier">;
export type NoSubstitutionTemplateLiteral =
  NodeOf<"NoSubstitutionTemplateLiteral">;
export type ObjectLiteralElementLike = Node;
export type ObjectLiteralExpression = NodeOf<"ObjectLiteralExpression">;
export type SourceFile = NodeOf<"SourceFile">;
export type StringLiteral = NodeOf<"StringLiteral">;
export type Symbol = SyntaxSymbol;
export type TypeNode = Node;

/** Parsed source files, keyed by path, as ts-morph's `Project` holds them. */
export class Project {
  private files = new Map<string, SourceFile>();

  getSourceFile(path: string): SourceFile | undefined {
    return this.files.get(path);
  }

  addSourceFileAtPath(path: string): SourceFile {
    const source = parseSourceFile(readFileSync(path, "utf-8"), path);
    this.files.set(path, source);
    return source;
  }
}

/** Write a source file's current text back to its path. */
export const saveSourceFile = async (source: SourceFile): Promise<void> => {
  await writeFile(source.getFilePath(), source.getFullText(), "utf-8");
};
