import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { markdownLinks } from "./docs-markdown.ts";

const source = fileURLToPath(new URL("../../../docs/cli/", import.meta.url));

export const verifyPackageDocs = async (directory: string): Promise<void> => {
  const names = await readdir(source);
  const topics = names
    .filter((name) => name.endsWith(".mdx"))
    .map((name) => name.replace(/\.mdx$/u, ".md"));
  const bundled = await readdir(path.join(directory, "docs/cli"));
  assert.deepEqual(
    bundled.toSorted(),
    topics.toSorted(),
    "The package must contain every current topic and no stale pages."
  );
  const index = await readFile(path.join(directory, "AGENTS.md"), "utf-8");
  const skill = await readFile(path.join(directory, "SKILL.md"), "utf-8");
  assert.ok(
    skill.includes("./AGENTS.md"),
    "The skill must point to the local index."
  );
  await Promise.all(
    topics.map(async (topic) => {
      assert.ok(
        index.includes(`./docs/cli/${topic}`),
        `Missing index entry: ${topic}`
      );
      const file = path.join(directory, "docs/cli", topic);
      const content = await readFile(file, "utf-8");
      assert.ok(content.trim().length > 0, `Empty topic: ${topic}`);
      await Promise.all(
        markdownLinks(content).map(async (link) => {
          if (/^(?:[a-z]+:|#|\/\/)/iu.test(link)) {
            return;
          }
          const [target] = link.split("#");
          assert.ok(target, `Empty link in ${topic}`);
          await access(
            path.resolve(path.dirname(file), decodeURIComponent(target))
          );
        })
      );
    })
  );
};

export const verifySiteDocs = async (directory: string): Promise<void> => {
  const metadata = z
    .object({
      baseUrl: z.literal("https://inth.com"),
      pages: z.array(
        z.object({
          absoluteUrl: z.string(),
          description: z.string().min(1),
          markdownAbsoluteUrl: z.string(),
          relativePath: z.string(),
          title: z.string().min(1),
          urlPath: z.string(),
        })
      ),
    })
    .parse(
      JSON.parse(
        await readFile(
          path.join(directory, "docs/agent-readability.json"),
          "utf-8"
        )
      )
    );
  const names = await readdir(source);
  const expectedPaths = names
    .filter((name) => name.endsWith(".mdx"))
    .map((name) => `cli/${name.slice(0, -4)}`);
  assert.deepEqual(
    metadata.pages.map((page) => page.relativePath).toSorted(),
    expectedPaths.toSorted()
  );
  const [llms, full, sitemap, searchText] = await Promise.all(
    ["llms.txt", "llms-full.txt", "sitemap.xml", "docs/search-index.json"].map(
      (file) => readFile(path.join(directory, file), "utf-8")
    )
  );
  assert.ok(llms && full && sitemap && searchText);
  const search = z
    .object({ documents: z.array(z.tuple([z.string()]).rest(z.unknown())) })
    .parse(JSON.parse(searchText));
  await Promise.all(
    metadata.pages.map(async (page) => {
      const route =
        page.relativePath === "cli/index"
          ? "/docs/cli"
          : `/docs/${page.relativePath}`;
      assert.equal(page.urlPath, route);
      assert.equal(page.absoluteUrl, `https://inth.com${route}`);
      assert.equal(page.markdownAbsoluteUrl, `https://inth.com${route}.md`);
      assert.ok(
        markdownLinks(llms).some(
          (url) =>
            new URL(url, metadata.baseUrl).href === page.markdownAbsoluteUrl
        ),
        `Missing llms.txt entry: ${route}`
      );
      assert.ok(
        full.includes(page.title),
        `Missing full-context topic: ${route}`
      );
      assert.ok(
        sitemap.includes(`<loc>${page.absoluteUrl}</loc>`),
        `Missing sitemap URL: ${route}`
      );
      assert.ok(
        search.documents.some(([url]) => url === route),
        `Missing search entry: ${route}`
      );
      const mirror = await readFile(
        path.join(directory, "docs", `${page.relativePath}.md`),
        "utf-8"
      );
      assert.ok(
        mirror.replaceAll(/\s+/gu, " ").includes(page.description),
        `Missing Markdown metadata: ${route}`
      );
    })
  );
};
