import { describe, expect, it } from "vitest";

import { SyntaxKind } from "../src/native/c15t-codemods/syntax/index.ts";
import { parseSourceFile } from "../src/native/c15t-codemods/syntax/parser.ts";

// The codemods edit through the ts-morph methods the parser's nodes copy.
// Each expected output here is what ts-morph 27.0.2 produced for the same
// edit, so the codemods keep upstream's whitespace and comment handling.

const parse = (text: string) => parseSourceFile(text, "input.ts");

const firstImport = (text: string) => {
  const source = parse(text);
  const [declaration] = source.getImportDeclarations();
  if (!declaration) {
    throw new Error("No import declaration in the source.");
  }
  return { declaration, source };
};

describe("c15t codemod edits", () => {
  it.each([
    [
      "the middle specifier",
      "import { a, b, c } from 'x';\nfoo();\n",
      1,
      "import { a, c } from 'x';\nfoo();\n",
    ],
    [
      "the first specifier",
      "import { a, b, c } from 'x';",
      0,
      "import { b, c } from 'x';",
    ],
    [
      "the last specifier",
      "import { a, b, c } from 'x';",
      2,
      "import { a, b } from 'x';",
    ],
    [
      "the only specifier",
      "import { a } from 'x';\nfoo();\n",
      0,
      "import { } from 'x';\nfoo();\n",
    ],
    [
      "the only specifier next to a default import",
      "import D, { a } from 'x';",
      0,
      "import D from 'x';",
    ],
    [
      "a middle specifier on its own line",
      "import {\n\ta,\n\tb,\n\tc,\n} from 'x';",
      1,
      "import {\n\ta,\n\tc,\n} from 'x';",
    ],
    [
      "a last specifier with no trailing comma",
      "import {\n\ta,\n\tb\n} from 'x';",
      1,
      "import {\n\ta\n} from 'x';",
    ],
    [
      "a repeated specifier",
      "import { a, a as a } from 'x';",
      1,
      "import { a } from 'x';",
    ],
    [
      "a specifier after a comment",
      "import { a, /* keep */ b } from 'x';",
      1,
      "import { a } from 'x';",
    ],
  ])("removes %s like ts-morph", (_name, text, index, expected) => {
    const { declaration, source } = firstImport(text);
    declaration.getNamedImports()[index]?.remove();
    expect(source.getFullText()).toBe(expected);
  });

  it.each([
    [
      "the first import",
      "import a from 'a';\nimport b from 'b';\n\nfoo();\n",
      0,
      "import b from 'b';\n\nfoo();\n",
    ],
    [
      "a middle import",
      "import a from 'a';\nimport b from 'b';\nimport c from 'c';\n",
      1,
      "import a from 'a';\nimport c from 'c';\n",
    ],
    [
      "the last import before a blank line",
      "'use client';\nimport a from 'a';\nimport b from 'b';\n\nfoo();\n",
      1,
      "'use client';\nimport a from 'a';\nfoo();\n",
    ],
    [
      "an import after a comment",
      "import a from 'a';\n// note\nimport b from 'b';\nfoo();\n",
      1,
      "import a from 'a';\n// note\nfoo();\n",
    ],
    ["the only import", "import a from 'a';\n\nfoo();\n", 0, "foo();\n"],
    [
      "an import with CRLF line endings",
      "import a from 'a';\r\nimport b from 'b';\r\nfoo();\r\n",
      0,
      "import b from 'b';\r\nfoo();\r\n",
    ],
  ])("removes %s like ts-morph", (_name, text, index, expected) => {
    const source = parse(text);
    source.getImportDeclarations()[index]?.remove();
    expect(source.getFullText()).toBe(expected);
  });

  it.each([
    ["a default import", "import D from 'x';", "import D, { a, b } from 'x';"],
    ["a side-effect import", "import 'x';", "import { a, b } from 'x';"],
    ["empty braces", "import {} from 'x';", "import { a, b } from 'x';"],
    ["named imports", "import { z } from 'x';", "import { z, a, b } from 'x';"],
    [
      "multiline named imports",
      'import {\n\tz,\n} from "x";\n',
      'import {\n\tz, a, b } from "x";\n',
    ],
  ])("adds named imports to %s like ts-morph", (_name, text, expected) => {
    const { declaration, source } = firstImport(text);
    declaration.addNamedImports(["a", "b"]);
    expect(source.getFullText()).toBe(expected);
  });

  it("refuses to add named imports to a namespace import, like ts-morph", () => {
    const { declaration } = firstImport("import * as N from 'x';");
    expect(() => {
      declaration.addNamedImports(["a"]);
    }).toThrow();
  });

  const IMPORT = "import { h } from 'h';";

  it.each([
    [
      "after two imports",
      "import a from 'a';\nimport b from 'b';\n\nfoo();\n",
      2,
      `import a from 'a';\nimport b from 'b';\n${IMPORT}\n\nfoo();\n`,
    ],
    ["into an empty file", "", 0, `${IMPORT}\n`],
    ["at the start", "foo();\n", 0, `${IMPORT}\nfoo();\n`],
    [
      "at the start, before a directive",
      "'use client';\nfoo();\n",
      0,
      `${IMPORT}\n'use client';\nfoo();\n`,
    ],
    [
      "at the start, before a comment",
      "// note\nfoo();\n",
      0,
      `${IMPORT}\n// note\nfoo();\n`,
    ],
    ["at the end", "import a from 'a';", 1, `import a from 'a';\n${IMPORT}`],
    ["before an indented statement", "a;\n\tfoo", 1, `a;\n${IMPORT}\n\tfoo`],
    [
      "into a CRLF file",
      "import a from 'a';\r\nfoo();\r\n",
      1,
      `import a from 'a';\n${IMPORT}\r\nfoo();\r\n`,
    ],
    [
      "after a directive and an import",
      "'use client';\n\nimport a from 'a';\n\nexport const x = 1;\n",
      2,
      `'use client';\n\nimport a from 'a';\n${IMPORT}\n\nexport const x = 1;\n`,
    ],
  ])("inserts a statement %s like ts-morph", (_name, text, index, expected) => {
    const source = parse(text);
    source.insertStatements(index, IMPORT);
    expect(source.getFullText()).toBe(expected);
  });

  it("keeps the order of two inserts at one index", () => {
    const source = parse("foo();\n");
    source.insertStatements(0, "import { a } from 'a';");
    source.insertStatements(1, "import { b } from 'b';");
    expect(source.getFullText()).toBe(
      "import { a } from 'a';\nimport { b } from 'b';\nfoo();\n"
    );
  });

  it("sets a string literal's value and keeps its quotes", () => {
    const source = parse('import x from "@c15t/scripts/x";\n');
    const literal = source.getFirstDescendantByKind(SyntaxKind.StringLiteral);
    literal?.setLiteralValue("@c15t/integrations/x");
    expect(source.getFullText()).toBe(
      'import x from "@c15t/integrations/x";\n'
    );
  });
});
