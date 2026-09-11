import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { expect, test } from "vitest";

import { verifyPackageDocs, verifySiteDocs } from "./docs-checks.ts";
import { markdownLinks, packageMarkdown } from "./docs-markdown.ts";
import { generateDocsArtifacts, generatePackageDocs } from "./generate-docs.ts";

test("package links retain anchors and leave external links unchanged", () => {
  expect(
    packageMarkdown(
      "[Auth](./authentication#sign-out) [Web](https://inth.com/docs/cli) [File](./existing.md)"
    )
  ).toBe(
    "[Auth](./authentication.md#sign-out) [Web](https://inth.com/docs/cli) [File](./existing.md)\n"
  );
});

test("regeneration removes stale topics and preserves authored guides", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "inth-docs-test-"));
  try {
    await mkdir(path.join(directory, "docs/cli"), { recursive: true });
    await writeFile(path.join(directory, "docs/cli/removed.md"), "Old topic");
    await writeFile(
      path.join(directory, "docs/authentication.md"),
      "Authored guide"
    );
    await generatePackageDocs(directory);
    await verifyPackageDocs(directory);
    expect(
      await readFile(path.join(directory, "docs/authentication.md"), "utf-8")
    ).toBe("Authored guide");
    const index = path.join(directory, "docs/cli/index.md");
    const content = await readFile(index, "utf-8");
    await writeFile(index, `${content}\n[Missing page](README.md)\n`);
    await expect(verifyPackageDocs(directory)).rejects.toThrow();
    await writeFile(
      index,
      `${content}\n[Auth][auth]\n\n[auth]: ./missing.md\n`
    );
    await expect(verifyPackageDocs(directory)).rejects.toThrow();
    await writeFile(
      index,
      `${content}\n[Auth][auth]\n[Web][web]\n\n[auth]: ./authentication.md\n[web]: https://example.com/missing\n`
    );
    await verifyPackageDocs(directory);
    await writeFile(index, content);
    await rm(path.join(directory, "docs/cli/authentication.md"));
    await expect(verifyPackageDocs(directory)).rejects.toThrow();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}, 30_000);

test("reference links are rewritten without changing metadata or code examples", () => {
  const content =
    '---\ntitle: Authentication\n---\n[Auth][auth]\n\n[auth]: ./authentication#sign-out "Sign out"\n\n```md\n[example]: ./missing\n```\n';
  const bundled = packageMarkdown(content);
  expect(bundled).toContain("---\ntitle: Authentication\n---\n");
  expect(bundled).toContain('[auth]: ./authentication.md#sign-out "Sign out"');
  expect(bundled).toContain("[example]: ./missing");
  expect(markdownLinks(bundled)).toEqual(["./authentication.md#sign-out"]);
});

test("link parsing handles titles and ignores fenced and inline examples", () => {
  const content =
    '[Auth](<./authentication.md> "Sign in")\n\n[Guide][guide]\n\n[guide]:\n  <./getting-started.md> "Get started"\n\n`[inline](./missing.md)`\n\n```md\n[example]: ./missing.md\n```\n';
  expect(markdownLinks(content)).toEqual([
    "./authentication.md",
    "./getting-started.md",
  ]);
});

test("web discovery includes every guide and rejects a missing LLM index", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "inth-site-docs-test-")
  );
  try {
    await generateDocsArtifacts(directory, "site");
    await verifySiteDocs(directory);
    await writeFile(path.join(directory, "llms.txt"), "# Inth CLI\n");
    await expect(verifySiteDocs(directory)).rejects.toThrow(
      "Missing llms.txt entry"
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}, 30_000);
