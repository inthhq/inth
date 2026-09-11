import { spawnSync } from "node:child_process";
import {
  cp,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { packageMarkdown } from "./docs-markdown.ts";

const repository = fileURLToPath(new URL("../../../", import.meta.url));

export const generateDocsArtifacts = async (
  output: string,
  mode: "bundle" | "site"
): Promise<void> => {
  const manifestUrl = new URL(import.meta.resolve("leadtype/package.json"));
  const manifest = z
    .object({ bin: z.string() })
    .parse(JSON.parse(await readFile(manifestUrl, "utf-8")));
  const generated = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL(manifest.bin, manifestUrl)),
      "generate",
      ...(mode === "bundle"
        ? ["--bundle"]
        : ["--base-url", "https://inth.com"]),
      "--src",
      repository,
      "--out",
      output,
    ],
    {
      cwd: repository,
      encoding: "utf-8",
      timeout: 60_000,
    }
  );
  if (generated.status !== 0) {
    throw new Error(
      generated.stderr || generated.stdout || "Docs generation failed."
    );
  }
};

export const generatePackageDocs = async (
  destination = path.join(repository, "packages/cli")
): Promise<void> => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "inth-docs-"));
  try {
    await generateDocsArtifacts(temporary, "bundle");
    const topics = path.join(temporary, "docs/cli");
    const names = await readdir(topics);
    await Promise.all(
      names.map(async (name) => {
        const file = path.join(topics, name);
        await writeFile(file, packageMarkdown(await readFile(file, "utf-8")));
      })
    );
    // Replace only generated topics, preserving the existing authored guides.
    await rm(path.join(destination, "docs/cli"), {
      force: true,
      recursive: true,
    });
    await cp(temporary, destination, { recursive: true });
  } finally {
    await rm(temporary, { force: true, recursive: true });
  }
};

if (import.meta.main) {
  await generatePackageDocs();
}
