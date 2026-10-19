import { readdirSync, readFileSync } from "node:fs";
// eslint-disable-next-line unicorn/import-style -- Matches the native sources.
import { extname, join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import type { SyntaxNode } from "../src/native/c15t-codemods/syntax/node.ts";
import { parseSourceFile } from "../src/native/c15t-codemods/syntax/parser.ts";

// The codemod parser stands in for the TypeScript compiler, which Scriptc
// cannot compile. These tests hold it to the compiler's tree: the same node
// kinds at the same offsets. Tokens the codemods never read as nodes
// (punctuation, modifiers and keyword operators) are left out on both sides.
const SKIPPED_KINDS = new Set([
  "AbstractKeyword",
  "AccessorKeyword",
  "AssertsKeyword",
  "AsyncKeyword",
  "AwaitKeyword",
  "ConstKeyword",
  "DeclareKeyword",
  "DefaultKeyword",
  "ExportKeyword",
  "InKeyword",
  "InstanceOfKeyword",
  "OutKeyword",
  "OverrideKeyword",
  "PrivateKeyword",
  "ProtectedKeyword",
  "PublicKeyword",
  "ReadonlyKeyword",
  "StaticKeyword",
  "SyntaxList",
]);

// `ts.SyntaxKind` maps some values to range markers such as `FirstStatement`.
const KIND_NAMES = new Map<number, string>();
for (const [name, value] of Object.entries(ts.SyntaxKind)) {
  if (
    typeof value === "number" &&
    !/^(?:First|Last)/u.test(name) &&
    !KIND_NAMES.has(value)
  ) {
    KIND_NAMES.set(value, name);
  }
}

const compared = (kind: string): boolean =>
  !kind.endsWith("Token") && !SKIPPED_KINDS.has(kind);

const scriptKind = (path: string): ts.ScriptKind => {
  switch (extname(path).toLowerCase()) {
    case ".tsx": {
      return ts.ScriptKind.TSX;
    }
    case ".jsx": {
      return ts.ScriptKind.JSX;
    }
    case ".js":
    case ".mjs":
    case ".cjs": {
      return ts.ScriptKind.JS;
    }
    default: {
      return ts.ScriptKind.TS;
    }
  }
};

const compilerTree = (text: string, path: string): string[] => {
  const source = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(path)
  );
  const lines: string[] = [];
  const visit = (node: ts.Node): void => {
    const kind = KIND_NAMES.get(node.kind);
    if (kind !== undefined && compared(kind)) {
      lines.push(`${kind} ${node.pos} ${node.getStart(source)} ${node.end}`);
    }
    ts.forEachChild(node, visit, (nodes) => {
      for (const child of nodes) {
        visit(child);
      }
    });
  };
  visit(source);
  return lines;
};

const codemodTree = (text: string, path: string): string[] => {
  const lines: string[] = [];
  const visit = (node: SyntaxNode): void => {
    if (compared(node.kind)) {
      lines.push(`${node.kind} ${node.pos} ${node.start} ${node.end}`);
    }
    for (const child of node.children) {
      visit(child);
    }
  };
  visit(parseSourceFile(text, path));
  return lines;
};

const expectCompilerTree = (text: string, path = "input.tsx"): void => {
  expect(codemodTree(text, path)).toEqual(compilerTree(text, path));
};

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:ts|tsx)$/u.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));

describe("c15t codemod parser", () => {
  it.each([
    ["generic arrow in TSX", "const pick = <Value,>(value: Value) => value;"],
    ["satisfies and as const", "export const x = { a: 1 } satisfies X as const;"],
    [
      "JSX with entities and expressions",
      'const a = <A.B x="&amp;" {...rest} y={<>{c}</>}>text {d} more</A.B>;',
    ],
    ["regex after an operator", "const r = a / b / /c[/]d/giu.test(e);"],
    [
      "template literal types",
      "type T<Name extends string> = `on${Capitalize<Name>}`;",
    ],
    [
      "conditional and mapped types",
      "type M<T> = { readonly [K in keyof T as `x${K & string}`]-?: T[K] extends (infer U)[] ? U : never };",
    ],
    [
      "decorated class members",
      "@sealed class A<T> extends B<T> implements C { @log() static #x?: T; declare y: string; accessor z = 1; constructor(readonly a: string) { super(); } static { init(); } }",
    ],
    [
      "overloads and abstract members",
      "abstract class A { abstract f(): void; g(a: string): void; g(a: number): void; g(a: unknown) {} }",
    ],
    [
      "imports and exports",
      'import type A, { type B, C as D } from "a"; import * as E from "e" with { type: "json" }; export { F as "g" } from "f"; export * as H from "h"; export default class {}',
    ],
    [
      "dynamic import and import.meta",
      'const m = await import("./m.ts"); const u = import.meta.url;',
    ],
    ["for await and labels", "outer: for await (const x of xs) { continue outer; }"],
    ["optional chaining and calls", "a?.b?.[c]?.(d)!.e<F>(g);"],
    ["unicode escapes in names", "const \\u0061b = 1; ab;"],
    ["Flow nullable types", "let a: ?string; let b: Array<?>;"],
    ["namespaces and enums", "declare global { namespace A.B { enum C { D = 1, E } } }"],
    [
      "type predicates and assertions",
      "function f(x: unknown): asserts x is string {} const g = (y: unknown): y is number => true;",
    ],
    ["comments and JSDoc", "/** @type {import('a').B} */\n// note\nconst x = 1; /* end */"],
    [
      "object literal members",
      "const o = { a, b: 1, [c]: 2, ...d, get e() { return 1; }, set e(v) {}, async *f() {} };",
    ],
  ])("parses %s like the compiler", (_name, text) => {
    expectCompilerTree(text);
  });

  it("parses JSX only in TSX and JavaScript files", () => {
    expectCompilerTree("const x = <T>y;", "input.ts");
    expectCompilerTree("const pick = <Value>(value: Value) => value;", "input.ts");
    expectCompilerTree("const x = <div>y</div>;", "input.jsx");
  });

  it("matches the compiler on the CLI's own sources", () => {
    const root = join(import.meta.dirname, "..");
    const files = ["src", "test", "scripts"].flatMap((directory) =>
      sourceFiles(join(root, directory))
    );
    expect(files.length).toBeGreaterThan(100);
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(codemodTree(text, file), file).toEqual(compilerTree(text, file));
    }
  });
});
