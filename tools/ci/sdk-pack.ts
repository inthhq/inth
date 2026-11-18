// Packs every SDK package that publishes to npm and checks each tarball as
// the registry would receive it, without publishing anything. Build the SDK
// first, then run `pnpm sdk:pack`. Pass `--out <dir>` to keep the tarballs,
// for example to publish those exact files by hand (.tegami/sdk/README.md).
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

/** The npm dist-tag every SDK prerelease publishes under. */
export const sdkDistTag = "alpha";

type Dependencies = Record<string, string>;

export interface Manifest {
  name: string;
  version?: string;
  private?: boolean;
  publishConfig?: { access?: string; tag?: string };
  files?: string[];
  main?: string;
  module?: string;
  types?: string;
  exports?: unknown;
  dependencies?: Dependencies;
  peerDependencies?: Dependencies;
  optionalDependencies?: Dependencies;
  devDependencies?: Dependencies;
}

/** The sections a consumer's install reads. */
const installedFields = [
  "dependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

const readManifest = (dir: string): Manifest =>
  JSON.parse(readFileSync(path.join(dir, "package.json"), "utf-8"));

/** The SDK packages that publish, as directory and manifest. */
export const sdkPackages = (root: string) => {
  const directory = path.join(root, "packages/sdk");
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(directory, entry.name))
    .filter((dir) => existsSync(path.join(dir, "package.json")))
    .map((dir) => ({ dir, manifest: readManifest(dir) }))
    .filter(({ manifest }) => !manifest.private);
};

/** Every package named in `manifest`'s install sections. */
const installedNames = (manifest: Manifest) =>
  installedFields.flatMap((field) => Object.keys(manifest[field] ?? {}));

/** Names in the order to publish them: each after the packages it names. */
export const publishOrder = (manifests: Manifest[]) => {
  const byName = new Map(
    manifests.map((manifest) => [manifest.name, manifest])
  );
  const order: string[] = [];
  const visit = (name: string, trail: string[]) => {
    if (order.includes(name)) {
      return;
    }
    if (trail.includes(name)) {
      throw new Error(`Dependency cycle: ${[...trail, name].join(" -> ")}`);
    }
    const manifest = byName.get(name);
    for (const dependency of manifest
      ? installedNames(manifest).toSorted()
      : []) {
      if (byName.has(dependency)) {
        visit(dependency, [...trail, name]);
      }
    }
    order.push(name);
  };
  for (const name of [...byName.keys()].toSorted()) {
    visit(name, []);
  }
  return order;
};

/** Paths the manifest's entry points name, wildcards left out. */
export const entryTargets = (manifest: Manifest) => {
  const fields = [manifest.main, manifest.module, manifest.types]
    .filter((field) => field !== undefined)
    .map((field) => (field.startsWith("./") ? field : `./${field}`));
  // Every "./" string in the exports map that is a value, not a subpath key.
  const exported = [
    ...JSON.stringify(manifest.exports ?? null).matchAll(
      /"(?<target>\.\/[^"]*)"(?!\s*:)/gu
    ),
  ].map((match) => match.groups?.target ?? "");
  return [
    ...new Set(
      [...fields, ...exported]
        .filter((target) => !target.includes("*"))
        .map((target) => path.posix.normalize(target))
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

const settingProblems = (manifest: Manifest, source: Manifest) => [
  ...(manifest.name === source.name && manifest.version === source.version
    ? []
    : [
        `packed as ${manifest.name}@${manifest.version}, expected ${source.name}@${source.version}`,
      ]),
  ...(manifest.publishConfig?.access === "public"
    ? []
    : ['publishConfig.access is not "public"']),
  ...(manifest.publishConfig?.tag === sdkDistTag
    ? []
    : [`publishConfig.tag is not "${sdkDistTag}"`]),
];

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
      if (privateNames.has(name)) {
        problems.push(`${field} names the private package ${name}`);
      }
      const sibling = versions.get(name);
      if (sibling && !range.includes(sibling)) {
        problems.push(
          `${field} asks for ${name}@${range}, which publishes ${sibling}`
        );
      }
    }
  }
  return problems;
};

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
  const entries = entryTargets(packed.manifest)
    .filter((target) => !fileSet.has(target))
    .map((target) => `entry point ${target} is not in the tarball`);
  return [...listed, ...entries];
};

const importProblems = (packed: PackedPackage, privateNames: Set<string>) => {
  if (privateNames.size === 0) {
    return [];
  }
  // Import and require specifiers only: a private name may also be a word in
  // a string, such as the workspace root's "inth".
  const importsPrivate = new RegExp(
    `(?:\\bfrom\\s*|\\bimport\\s*\\(?\\s*|\\brequire\\s*\\(\\s*)["'](?:${[
      ...privateNames,
    ]
      .map((name) => name.replaceAll(/[.*+?^${}()|[\]\\/]/gu, "\\$&"))
      .join("|")})(?:/[^"']*)?["']`,
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

/** Packs `dir` with pnpm, which resolves `workspace:` ranges as publish does. */
const pack = (dir: string, out: string, scratch: string) => {
  const destination = mkdtempSync(path.join(scratch, "pack-"));
  execFileSync("pnpm", ["pack", "--pack-destination", destination], {
    cwd: dir,
    stdio: ["ignore", "ignore", "inherit"],
  });
  const [tarball] = readdirSync(destination);
  if (!tarball) {
    throw new Error(`pnpm pack wrote nothing for ${dir}`);
  }
  const target = path.join(out, tarball);
  renameSync(path.join(destination, tarball), target);

  const extracted = mkdtempSync(path.join(scratch, "unpacked-"));
  execFileSync("tar", ["-xzf", target, "-C", extracted]);
  const packageDir = path.join(extracted, "package");
  const files = listFiles(packageDir);
  const code = new Map(
    files
      .filter((file) => codeFile.test(file))
      .map((file) => [file, readFileSync(path.join(packageDir, file), "utf-8")])
  );
  return {
    packed: { code, files, manifest: readManifest(packageDir) },
    size: statSync(target).size,
    tarball: target,
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
  const scratch = mkdtempSync(path.join(tmpdir(), "inth-sdk-pack-"));
  const out = values.out
    ? path.resolve(values.out)
    : path.join(scratch, "tarballs");
  mkdirSync(out, { recursive: true });

  const packages = sdkPackages(root);
  const byName = new Map(packages.map((entry) => [entry.manifest.name, entry]));
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

  const order = publishOrder(packages.map(({ manifest }) => manifest));
  try {
    for (const name of order) {
      const entry = byName.get(name);
      if (!entry) {
        continue;
      }
      const { packed, size, tarball } = pack(entry.dir, out, scratch);
      const problems = tarballProblems(packed, {
        privateNames,
        source: entry.manifest,
        versions,
      });
      const summary = `${name}@${packed.manifest.version}  ${path.basename(tarball)}  ${packed.files.length} files  ${(size / 1024).toFixed(0)} KiB`;
      process.stdout.write(
        `${problems.length > 0 ? "FAIL" : "ok  "}  ${summary}\n`
      );
      for (const problem of problems) {
        process.stdout.write(`      ${problem}\n`);
        failures.push(`${name}: ${problem}`);
      }
    }
  } finally {
    rmSync(scratch, { force: true, recursive: true });
  }

  process.stdout.write(`\nPublish order: ${order.join(", ")}\n`);
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
    `All ${order.length} packages packed and passed for dist-tag "${sdkDistTag}".\n`
  );
};

if (import.meta.main) {
  main();
}
