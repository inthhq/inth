import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { expect, test } from "vitest";

import { verifyPackageDocs } from "./docs-checks.ts";
import { generatePackageDocs, packageMarkdown } from "./generate-docs.ts";

test("package links retain anchors and leave external links unchanged", () => {
  expect(
    packageMarkdown(
      "[Auth](./authentication#sign-out) [Web](https://inth.com/docs/cli) [File](./existing.md)"
    )
  ).toBe(
    "[Auth](./authentication.md#sign-out) [Web](https://inth.com/docs/cli) [File](./existing.md)"
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
    await writeFile(index, content);
    await rm(path.join(directory, "docs/cli/authentication.md"));
    await expect(verifyPackageDocs(directory)).rejects.toThrow();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}, 30_000);
