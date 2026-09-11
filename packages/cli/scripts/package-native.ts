/* eslint-disable no-await-in-loop -- Assemble the small package before packing it. */
import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { generatePackageDocs } from "./generate-docs.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const target = z
  .object({
    arch: z.enum(["arm64", "x64"]),
    environment: z.enum(["development", "production"]),
    executable: z.enum(["inth", "inth.exe"]),
    platform: z.enum(["darwin", "linux", "win32"]),
  })
  .parse(
    JSON.parse(await readFile(path.join(root, "dist/target.json"), "utf-8"))
  );
if (target.environment !== "production") {
  throw new Error(
    "Cannot package a development build. Run pnpm build:production first."
  );
}
await generatePackageDocs();

const source = z
  .object({ description: z.string(), license: z.string(), version: z.string() })
  .parse(JSON.parse(await readFile(path.join(root, "package.json"), "utf-8")));
const name = `cli-${target.platform}-${target.arch}`;
const manifest = JSON.parse(
  await readFile(path.join(root, "../../npm", name, "package.json"), "utf-8")
);
const metadata = z.object({ version: z.string() }).parse(manifest);
if (metadata.version !== source.version) {
  throw new Error(`Version mismatch between @inth/cli and @inth/${name}.`);
}
const directory = path.join(root, "build", "packages", name);
await rm(directory, { force: true, recursive: true });
await mkdir(path.join(directory, "bin"), { recursive: true });
await cp(
  path.join(root, "dist", target.executable),
  path.join(directory, "bin", target.executable)
);
for (const file of [
  "README.md",
  "AGENT-USAGE.md",
  "AGENTS.md",
  "SKILL.md",
  "output.schema.json",
]) {
  await cp(path.join(root, file), path.join(directory, file));
}
await cp(path.join(root, "docs"), path.join(directory, "docs"), {
  recursive: true,
});
await cp(path.join(root, "../../LICENSE"), path.join(directory, "LICENSE"));
await cp(path.join(root, "vendor"), path.join(directory, "vendor"), {
  recursive: true,
});
await writeFile(
  path.join(directory, "package.json"),
  `${JSON.stringify(manifest, null, 2)}\n`
);
const output = path.join(root, "artifacts");
await mkdir(output, { recursive: true });
const packed = spawnSync("npm", ["pack", "--pack-destination", output], {
  cwd: directory,
  encoding: "utf-8",
  shell: process.platform === "win32",
  timeout: 60_000,
});
if (packed.status !== 0) {
  throw new Error(packed.stderr || packed.stdout);
}
console.log(packed.stdout.trim());
