import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { transformSync } from "esbuild";
import { afterEach, beforeEach, expect, it } from "vitest";

import { runGenerationWorkflow } from "../src/native/c15t-generation.ts";

let directory: string;
const context = { generation: { backendURL: "https://app.c15t.dev" } };

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "inth-c15t-layouts-"));
  await writeFile(
    path.join(directory, "package.json"),
    JSON.stringify({ dependencies: { nuxt: "3.20.0" } })
  );
});

afterEach(async () => {
  await rm(directory, { force: true, recursive: true });
});

it.each(["page.jsx", "page.js", "js"])(
  "generates executable pages and an API handler with %s",
  async (extension) => {
    await writeFile(
      path.join(directory, "next.config.mjs"),
      `export default { pageExtensions: ['${extension}'] };\n`
    );
    const result = await runGenerationWorkflow(
      ["setup", "--framework", "next-pages", "--apply", "--skip-install"],
      context,
      { cwd: directory }
    );
    expect(result.created).toEqual(
      expect.arrayContaining([
        `pages/_app.${extension}`,
        `pages/index.${extension}`,
        `pages/api/c15t/[...c15t].${extension}`,
      ])
    );
    expect(await readdir(path.join(directory, "pages"))).toEqual([
      `_app.${extension}`,
      "api",
      `index.${extension}`,
    ]);
    await Promise.all(
      [
        `pages/_app.${extension}`,
        `pages/index.${extension}`,
        `pages/api/c15t/[...c15t].${extension}`,
      ].map(async (filename) => {
        const content = await readFile(path.join(directory, filename), "utf-8");
        expect(() => transformSync(content, { loader: "jsx" })).not.toThrow();
      })
    );
  }
);

it.each([
  "// Keep the default pageExtensions\nexport default {};",
  "/* pageExtensions: ['ignored.tsx'] */\nexport default {};",
  "export default { docs: 'https://example.com/pageExtensions' };",
])(
  "uses default extensions when config only mentions them as text: %s",
  async (config) => {
    await writeFile(path.join(directory, "next.config.mjs"), config);
    const result = await runGenerationWorkflow(
      ["setup", "--framework", "next-pages", "--apply", "--skip-install"],
      context,
      { cwd: directory }
    );
    expect(result.created).toContain("pages/_app.tsx");
    expect(result.created).toContain("pages/api/c15t/[...c15t].ts");
    expect(
      await readFile(path.join(directory, "next.config.mjs"), "utf-8")
    ).toBe(config);
  }
);

it("reads a real extension property after comments without stripping URL strings", async () => {
  const config =
    "export default { docs: 'https://example.com/docs', pageExtensions: /* next pages */ [\n'page.js', // page.tsx is unused\n] };\n";
  await writeFile(path.join(directory, "next.config.mjs"), config);
  const result = await runGenerationWorkflow(
    ["setup", "--framework", "next-pages", "--apply", "--skip-install"],
    context,
    { cwd: directory }
  );
  expect(result.created).toContain("pages/_app.page.js");
  expect(result.created).toContain("pages/api/c15t/[...c15t].page.js");
  expect(await readFile(path.join(directory, "next.config.mjs"), "utf-8")).toBe(
    config
  );
});

it("keeps Nuxt 3 vendor config beside its root app and preserves environment merge guidance", async () => {
  await writeFile(
    path.join(directory, "app.vue"),
    "<template><NuxtPage /></template>\n"
  );
  await writeFile(path.join(directory, ".env"), "UNRELATED=secret\n");
  const result = await runGenerationWorkflow(
    ["setup", "--framework", "nuxt", "--apply", "--skip-install"],
    { generation: { ...context.generation, scripts: ["posthog"] } },
    { cwd: directory }
  );
  expect(result.created).toContain("app.config.ts");
  expect(result.plan.files.map((file) => file.path)).toContain("app.vue");
  expect(await readFile(path.join(directory, "app.vue"), "utf-8")).toBe(
    "<template><NuxtPage /></template>\n"
  );
  expect(
    result.plan.instructions.some((instruction) =>
      instruction.startsWith("Add to .env:")
    )
  ).toBe(true);
  expect(
    result.plan.instructions.some((instruction) =>
      instruction.includes("app/app.config.ts")
    )
  ).toBe(false);
});

it.each([
  [
    "next-pages",
    "next.config.mjs",
    "export default { pageExtensions: extensions };",
    "Cannot verify Next.js pageExtensions",
  ],
  [
    "nuxt",
    "nuxt.config.ts",
    "export default defineNuxtConfig({ srcDir: process.env.SOURCE });",
    "Cannot verify the Nuxt srcDir",
  ],
  [
    "next-pages",
    "next.config.mjs",
    "export default { pageExtensions: ['tsx'].map(extension => 'page.' + extension) };",
    "Cannot verify Next.js pageExtensions",
  ],
  [
    "nuxt",
    "nuxt.config.ts",
    "export default defineNuxtConfig({ srcDir: 'src' + '/app' });",
    "Cannot verify the Nuxt srcDir",
  ],
])(
  "rejects computed %s paths before creating files",
  async (framework, filename, config, message) => {
    await mkdir(path.join(directory, "src"));
    await writeFile(path.join(directory, filename), config);
    const before = await readdir(directory);
    await expect(
      runGenerationWorkflow(
        ["setup", "--framework", framework, "--apply", "--skip-install"],
        context,
        { cwd: directory }
      )
    ).rejects.toThrow(message);
    expect(await readdir(directory)).toEqual(before);
    expect(await readdir(path.join(directory, "src"))).toEqual([]);
  }
);
