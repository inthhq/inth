// The slice of ts-morph's API the codemods use, over the codemod parser. The
// codemods were written against ts-morph, which Scriptc cannot compile, so
// these names let them keep their shape.

import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";

import type { Node, SyntaxSymbol } from "./node.ts";
import { parseSourceFile } from "./parser.ts";

export { Node, SyntaxKind } from "./node.ts";

export type BindingElement = Node<"BindingElement">;
export type CallExpression = Node<"CallExpression">;
export type ExportDeclaration = Node<"ExportDeclaration">;
export type ExportSpecifier = Node<"ExportSpecifier">;
export type Identifier = Node<"Identifier">;
export type ImportDeclaration = Node<"ImportDeclaration">;
export type ImportSpecifier = Node<"ImportSpecifier">;
export type NoSubstitutionTemplateLiteral =
  Node<"NoSubstitutionTemplateLiteral">;
export type ObjectLiteralElementLike = Node;
export type ObjectLiteralExpression = Node<"ObjectLiteralExpression">;
export type SourceFile = Node<"SourceFile">;
export type StringLiteral = Node<"StringLiteral">;
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
