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

const repository = fileURLToPath(new URL("../../../", import.meta.url));

// Site links omit extensions. Package links must name the generated files.
export const packageMarkdown = (content: string): string =>
  content.replaceAll(
    /\]\(\.\/(?<topic>[a-z-]+)(?<anchor>#[^)]*)?\)/gu,
    "](./$<topic>.md$<anchor>)"
  );

export const generatePackageDocs = async (
  destination = path.join(repository, "packages/cli")
): Promise<void> => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "inth-docs-"));
  try {
    const manifestUrl = new URL(import.meta.resolve("leadtype/package.json"));
    const manifest = z
      .object({ bin: z.string() })
      .parse(JSON.parse(await readFile(manifestUrl, "utf-8")));
    const generated = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL(manifest.bin, manifestUrl)),
        "generate",
        "--bundle",
        "--src",
        repository,
        "--out",
        temporary,
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
