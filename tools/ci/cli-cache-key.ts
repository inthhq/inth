// Computes a content hash of every input that affects the native CLI build,
// test suite, and npm package so pull request CI can reuse verified artifacts
// when only non-CLI files changed. Uses Node built-ins only so it can run
// before `pnpm install`.
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CLI_IGNORED_DIRS = new Set([
  ".turbo",
  "artifacts",
  "build",
  "dist",
  "dist-bin",
  "node_modules",
]);

const CLI_IGNORED_PREFIXES = ["packages/cli/vendor/c15t-mobile/"];

const NPM_IGNORED_DIRS = new Set(["bin", "node_modules"]);

const toPosix = (filePath: string): string => filePath.replaceAll("\\", "/");

const walkFiles = (
  root: string,
  relativeDir: string,
  ignoredDirs: Set<string>,
  ignoredPrefixes: string[]
): string[] => {
  const dir = path.join(root, relativeDir);
  if (!existsSync(dir)) {
    return [];
  }
  const files: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true }).toSorted((a, b) =>
    a.name.localeCompare(b.name)
  );
  for (const entry of entries) {
    const relative = toPosix(path.join(relativeDir, entry.name));
    if (entry.isDirectory()) {
      if (
        ignoredDirs.has(entry.name) ||
        ignoredPrefixes.some((prefix) => `${relative}/`.startsWith(prefix))
      ) {
        continue;
      }
      files.push(...walkFiles(root, relative, ignoredDirs, ignoredPrefixes));
    } else if (entry.isFile()) {
      if (ignoredPrefixes.some((prefix) => relative.startsWith(prefix))) {
        continue;
      }
      files.push(relative);
    }
  }
  return files;
};

/**
 * Extracts only the CLI-relevant sections of `pnpm-lock.yaml`:
 * - the `packages/cli` importer entry (direct deps, devDeps, patch hashes, resolved catalog versions)
 * - every `@scriptc/*` package entry (compiler/LLVM/runtime binaries)
 *
 * Unrelated SDK or mobile dependency bumps in `pnpm-lock.yaml` do not change
 * the extracted text, so they do not bust the native CLI cache.
 */
export const extractCliLockfileInputs = (lockfileText: string): string => {
  const lines = lockfileText.split(/\r?\n/u);
  const sections: string[] = [];
  let inImporters = false;
  let inPackages = false;
  let capturing = false;

  for (const line of lines) {
    if (/^\S/u.test(line)) {
      inImporters = line === "importers:";
      inPackages = line === "packages:";
      capturing = false;
      continue;
    }

    if (inImporters && /^ {2}\S/u.test(line)) {
      capturing = line === "  packages/cli:" || line === "  'packages/cli':";
    } else if (inPackages && /^ {2}\S/u.test(line)) {
      capturing =
        line.startsWith("  '@scriptc/") || line.startsWith("  @scriptc/");
    }

    if (capturing) {
      sections.push(line);
    }
  }

  return sections.join("\n");
};

export interface CliCacheKeyOptions {
  root: string;
  env?: Record<string, string | undefined>;
}

export const computeCliCacheKey = ({
  root,
  env = {},
}: CliCacheKeyOptions): string => {
  const hash = createHash("sha256");

  const files = [
    ...walkFiles(root, "packages/cli", CLI_IGNORED_DIRS, CLI_IGNORED_PREFIXES),
    ...walkFiles(root, "npm", NPM_IGNORED_DIRS, []),
    ...walkFiles(root, "docs", new Set(["node_modules"]), []),
    ...walkFiles(root, "patches", new Set(), []),
  ];
  if (existsSync(path.join(root, ".node-version"))) {
    files.push(".node-version");
  }
  files.sort((a, b) => a.localeCompare(b));

  for (const relative of files) {
    hash.update(`file:${relative}\0`);
    hash.update(readFileSync(path.join(root, relative)));
    hash.update("\0");
  }

  const lockfilePath = path.join(root, "pnpm-lock.yaml");
  if (existsSync(lockfilePath)) {
    const extracted = extractCliLockfileInputs(
      readFileSync(lockfilePath, "utf-8")
    );
    hash.update("lockfile\0");
    hash.update(extracted);
    hash.update("\0");
  }

  const envKeys = ["SCRIPTC_CC", "SCRIPTC_TARGET", "ZIG_VERSION"] as const;
  for (const key of envKeys) {
    hash.update(`env:${key}=${env[key] ?? ""}\0`);
  }

  return hash.digest("hex").slice(0, 32);
};

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === import.meta.filename;

if (isMain) {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const digest = computeCliCacheKey({ env: process.env, root });
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `hash=${digest}\n`);
  }
  console.log(digest);
}
