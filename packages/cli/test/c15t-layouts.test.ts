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

it("generates executable JSX pages and an API handler with the configured suffix", async () => {
  await writeFile(
    path.join(directory, "next.config.mjs"),
    "export default { pageExtensions: ['page.jsx'] };\n"
  );
  const result = await runGenerationWorkflow(
    ["setup", "--framework", "next-pages", "--apply", "--skip-install"],
    context,
    { cwd: directory }
  );
  expect(result.created).toEqual(
    expect.arrayContaining([
      "pages/_app.page.jsx",
      "pages/index.page.jsx",
      "pages/api/c15t/[...c15t].page.jsx",
    ])
  );
  expect(await readdir(path.join(directory, "pages"))).toEqual([
    "_app.page.jsx",
    "api",
    "index.page.jsx",
  ]);
  await Promise.all(
    [
      "pages/_app.page.jsx",
      "pages/index.page.jsx",
      "pages/api/c15t/[...c15t].page.jsx",
    ].map(async (filename) => {
      const content = await readFile(path.join(directory, filename), "utf-8");
      expect(() => transformSync(content, { loader: "jsx" })).not.toThrow();
    })
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
