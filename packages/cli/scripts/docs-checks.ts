import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
        [...content.matchAll(/\]\((?<target>[^\s)]+)\)/gu)].map(
          async (match) => {
            const [, link] = match;
            if (link && /^(?:[a-z]+:|#|\/\/)/iu.test(link)) {
              return;
            }
            const target = link?.split("#")[0];
            assert.ok(target, `Empty link in ${topic}`);
            await access(path.resolve(path.dirname(file), target));
          }
        )
      );
    })
  );
};
