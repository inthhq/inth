// Packs every SDK package that publishes to npm and checks each tarball as
// the registry would receive it, without publishing anything. Build the SDK
// first, then run `pnpm sdk:pack`. Pass `--out <dir>` to keep the tarballs,
// numbered in publish order, for the first publish by hand
// (.tegami/sdk/README.md).
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

import { readManifest, sdkPackages, sdkRepo } from "./sdk-release.ts";
import type { Manifest } from "./sdk-release.ts";

/** The sections a consumer's install reads. */
const installedFields = [
  "dependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

/** `packages` sorted so each comes after the ones it installs. */
export const publishOrder = <T extends { manifest: Manifest }>(
  packages: T[]
) => {
  const byName = new Map(packages.map((entry) => [entry.manifest.name, entry]));
  const order: T[] = [];
  const visit = (entry: T, trail: string[]) => {
    const { name } = entry.manifest;
    if (order.includes(entry)) {
      return;
    }
    if (trail.includes(name)) {
      throw new Error(`Dependency cycle: ${[...trail, name].join(" -> ")}`);
    }
    for (const dependency of installedFields
      .flatMap((field) => Object.keys(entry.manifest[field] ?? {}))
      .toSorted()) {
      const sibling = byName.get(dependency);
      if (sibling) {
        visit(sibling, [...trail, name]);
      }
    }
    order.push(entry);
  };
  for (const entry of packages.toSorted((a, b) =>
    a.manifest.name < b.manifest.name ? -1 : 1
  )) {
    visit(entry, []);
  }
  return order;
};

/** The npm dist-tag for `version`: its prerelease id, or none for `latest`. */
const distTagFor = (version = "") =>
  /^[^-+]*-(?<id>[^.+]+)/u.exec(version)?.groups?.id;

/** Paths the manifest's entry points and package imports name. */
const entryTargets = (manifest: Manifest) => {
  const fields = [manifest.main, manifest.module, manifest.types]
    .filter((field) => field !== undefined)
    .map((field) => (field.startsWith("./") ? field : `./${field}`));
  // Every "./" string in exports or imports that is a value, not a key.
  const exported = [
    ...JSON.stringify([manifest.exports, manifest.imports]).matchAll(
      /"(?<target>\.\/[^"]*)"(?!\s*:)/gu
    ),
  ].map((match) => match.groups?.target ?? "");
  return [
    ...new Set(
      [...fields, ...exported].map((target) => path.posix.normalize(target))
    ),
  ];
};

export interface PackedPackage {
  /** The manifest inside the tarball. */
  manifest: Manifest;
  /** Every path in the tarball, relative to its package folder. */
  files: string[];
  /** Text of the JavaScript and declaration files, by path. */
  code: Map<string, string>;
}

export interface Expectations {
  /** The workspace manifest the tarball was packed from. */
  source: Manifest;
  /** The version of each package that publishes with it. */
  versions: Map<string, string>;
  /** Names of the workspace's private packages. */
  privateNames: Set<string>;
}

/** What is wrong with a manifest's publish settings, or an empty list. */
export const settingProblems = (manifest: Manifest, source = manifest) => {
  const tag = distTagFor(manifest.version);
  return [
    ...(manifest.name === source.name && manifest.version === source.version
      ? []
      : [
          `packed as ${manifest.name}@${manifest.version}, expected ${source.name}@${source.version}`,
        ]),
    ...(manifest.publishConfig?.access === "public"
      ? []
      : ['publishConfig.access is not "public"']),
    // npm refuses a publish with provenance from another repository. npm
    // itself writes the git+https form.
    ...([
      `https://github.com/${sdkRepo}.git`,
      `git+https://github.com/${sdkRepo}.git`,
    ].includes(manifest.repository?.url ?? "")
      ? []
      : [`repository.url does not name https://github.com/${sdkRepo}.git`]),
    ...(manifest.publishConfig?.tag === tag
      ? []
      : [
          tag
            ? `publishConfig.tag is not "${tag}"`
            : `publishConfig.tag is set, but ${manifest.version} publishes to "latest"`,
        ]),
  ];
};

const dependencyProblems = (
  manifest: Manifest,
  { versions, privateNames }: Expectations
) => {
  const problems: string[] = [];
  for (const field of [...installedFields, "devDependencies"] as const) {
    for (const [name, range] of Object.entries(manifest[field] ?? {})) {
      if (/^(?:workspace|catalog|link|file):/u.test(range)) {
        problems.push(`${field} keeps ${name}@${range}`);
      }
    }
  }
  for (const field of installedFields) {
    for (const [name, range] of Object.entries(manifest[field] ?? {})) {
      // pnpm packs a workspace: alias as npm:<target>@<version> under its key.
      const target = /^npm:(?<target>@?[^@]+)/u.exec(range)?.groups?.target;
      for (const named of new Set([name, target ?? name])) {
        if (privateNames.has(named)) {
          problems.push(`${field} names the private package ${named}`);
        }
      }
      const sibling = versions.get(name);
      if (sibling && range.replace(/^[\^~]/u, "") !== sibling) {
        problems.push(
          `${field} asks for ${name}@${range}, which publishes ${sibling}`
        );
      }
    }
  }
  return problems;
};

const wildcard = (target: string) =>
  new RegExp(
    `^${target
      .split("*")
      .map((part) => part.replaceAll(/[.+?^${}()|[\]\\]/gu, "\\$&"))
      .join(".+")}$`,
    "u"
  );

/** Test code, which must stay out of a tarball. */
const testFile =
  /(?:^|\/)(?:__tests__|__mocks__)\/|\.(?:test|spec|stories)\.[^/]+$/u;

const fileProblems = (packed: PackedPackage, source: Manifest) => {
  const fileSet = new Set(packed.files);
  // `files` entries are files or folders; a folder must contribute a file.
  const listed = (source.files ?? [])
    .filter((entry) => !entry.startsWith("!") && !/[*?[{]/u.test(entry))
    .filter((entry) => {
      const wanted = path.posix.normalize(entry);
      return (
        !fileSet.has(wanted) &&
        !packed.files.some((file) => file.startsWith(`${wanted}/`))
      );
    })
    .map((entry) => `files lists ${entry}, which is not in the tarball`);
  // A wildcard target such as dist/translations/*.js must match a file.
  const entries = entryTargets(packed.manifest)
    .filter((target) =>
      target.includes("*")
        ? !packed.files.some((file) => wildcard(target).test(file))
        : !fileSet.has(target)
    )
    .map((target) => `entry point ${target} is not in the tarball`);
  const tests = packed.files
    .filter((file) => testFile.test(file))
    .map((file) => `${file} is test code`);
  return [...listed, ...entries, ...tests];
};

const importProblems = (packed: PackedPackage, privateNames: Set<string>) => {
  // Import and require specifiers only: a private name may also be a word in
  // a string, such as the workspace root's "inth". Comments may come before
  // the specifier, as in import(/* webpackIgnore: true */ "name").
  const gap = String.raw`(?:\s|/\*[\s\S]*?\*/|//[^\n]*\n)*`;
  const importsPrivate = new RegExp(
    `(?:\\bfrom${gap}|\\bimport${gap}(?:\\(${gap})?|\\brequire${gap}\\(${gap})["'\`](?:${[
      ...privateNames,
    ]
      .map((name) => name.replaceAll(/[.*+?^${}()|[\]\\/]/gu, "\\$&"))
      .join("|")})(?:/[^"'\`]*)?["'\`]`,
    "u"
  );
  return [...packed.code].flatMap(([file, text]) => {
    const match = importsPrivate.exec(text);
    return match ? [`${file} imports the private package ${match[0]}`] : [];
  });
};

/** What is wrong with one packed package, or an empty list. */
export const tarballProblems = (
  packed: PackedPackage,
  expectations: Expectations
) => [
  ...settingProblems(packed.manifest, expectations.source),
  ...dependencyProblems(packed.manifest, expectations),
  ...fileProblems(packed, expectations.source),
  ...importProblems(packed, expectations.privateNames),
];

const codeFile = /\.(?:[cm]?js|d\.[cm]?ts)$/u;

const listFiles = (dir: string, prefix = ""): string[] =>
  readdirSync(path.join(dir, prefix), { withFileTypes: true }).flatMap(
    (entry) => {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      return entry.isDirectory() ? listFiles(dir, relative) : [relative];
    }
  );

/**
 * Packs `dir` into `out` with pnpm, which resolves `workspace:` ranges as
 * publish does. The tarball's name starts with `prefix`.
 */
const pack = (dir: string, out: string, prefix: string, scratch: string) => {
  execFileSync(
    "pnpm",
    ["pack", "--out", path.join(out, `${prefix}-%s-%v.tgz`)],
    {
      cwd: dir,
      stdio: ["ignore", "ignore", "inherit"],
    }
  );
  const tarball = readdirSync(out).find((name) =>
    name.startsWith(`${prefix}-`)
  );
  if (!tarball) {
    throw new Error(`pnpm pack wrote nothing for ${dir}`);
  }
  const file = path.join(out, tarball);
  const extracted = mkdtempSync(path.join(scratch, "unpacked-"));
  execFileSync("tar", ["-xzf", file, "-C", extracted]);
  const packageDir = path.join(extracted, "package");
  const files = listFiles(packageDir);
  const code = new Map(
    files
      .filter((name) => codeFile.test(name))
      .map((name) => [name, readFileSync(path.join(packageDir, name), "utf-8")])
  );
  return {
    file,
    packed: { code, files, manifest: readManifest(packageDir) },
  };
};

const workspacePrivateNames = (root: string) => {
  const listed: { name?: string; private?: boolean }[] = JSON.parse(
    execFileSync("pnpm", ["-r", "ls", "--depth", "-1", "--json"], {
      cwd: root,
      encoding: "utf-8",
      maxBuffer: 64 * 1024 * 1024,
    })
  );
  return new Set(
    listed
      .filter((entry) => entry.private && entry.name)
      .map((entry) => entry.name ?? "")
  );
};

const main = () => {
  const { values } = parseArgs({ options: { out: { type: "string" } } });
  const root = process.cwd();
  const packages = publishOrder(
    sdkPackages(root).filter(({ manifest }) => !manifest.private)
  );
  const versions = new Map(
    packages.map(({ manifest }) => [manifest.name, manifest.version ?? ""])
  );
  const privateNames = workspacePrivateNames(root);
  const failures: string[] = [];

  if (new Set(versions.values()).size !== 1) {
    failures.push(
      `The SDK packages do not share one version: ${[...versions].map(([name, version]) => `${name}@${version}`).join(", ")}`
    );
  }

  const scratch = mkdtempSync(path.join(tmpdir(), "inth-sdk-pack-"));
  const out = values.out
    ? path.resolve(values.out)
    : path.join(scratch, "tarballs");
  try {
    mkdirSync(out, { recursive: true });
    // The first publish loops over every tarball here, so a stale one from an
    // earlier version would publish too.
    if (readdirSync(out).length > 0) {
      throw new Error(`${out} is not empty. Pass a new or empty directory.`);
    }
    for (const [index, { dir, manifest }] of packages.entries()) {
      const { file, packed } = pack(
        dir,
        out,
        String(index + 1).padStart(2, "0"),
        scratch
      );
      const problems = tarballProblems(packed, {
        privateNames,
        source: manifest,
        versions,
      });
      const summary = `${manifest.name}@${packed.manifest.version}  ${path.basename(file)}  ${packed.files.length} files  ${(statSync(file).size / 1024).toFixed(0)} KiB`;
      process.stdout.write(
        `${problems.length > 0 ? "FAIL" : "ok  "}  ${summary}\n`
      );
      for (const problem of problems) {
        process.stdout.write(`      ${problem}\n`);
        failures.push(`${manifest.name}: ${problem}`);
      }
    }
  } finally {
    rmSync(scratch, { force: true, recursive: true });
  }

  process.stdout.write(
    `\nPublish order: ${packages.map(({ manifest }) => manifest.name).join(", ")}\n`
  );
  if (values.out) {
    process.stdout.write(`Tarballs: ${out}\n`);
  }
  if (failures.length > 0) {
    process.stderr.write(
      `\n${failures.length} problem(s). Nothing may publish until they are fixed.\n`
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `All ${packages.length} packages packed and passed for dist-tag "${distTagFor(packages[0]?.manifest.version) ?? "latest"}".\n`
  );
};

if (import.meta.main) {
  main();
}
