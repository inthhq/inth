/* eslint-disable no-await-in-loop -- Dependency staging follows package resolution before the binary build. */
import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import { z } from "zod";

import { resolveManifest } from "./resolve-manifest.ts";

const packageSchema = z.object({
  dependencies: z.record(z.string(), z.string()).default({}),
  devDependencies: z.record(z.string(), z.string()).default({}),
  name: z.string(),
  optionalDependencies: z.record(z.string(), z.string()).default({}),
  version: z.string(),
});
const smoke = process.argv.includes("--smoke");
const authBench = process.argv.includes("--auth-bench");
const live = process.argv.includes("--live-auth");
const selector = process.argv.includes("--selector");
if (
  [smoke, live, authBench, selector].filter(Boolean).length > 1 ||
  process.argv
    .slice(2)
    .some(
      (argument) =>
        !["--smoke", "--live-auth", "--auth-bench", "--selector"].includes(
          argument
        )
    )
) {
  throw new Error(
    "Usage: build-yao.ts [--smoke | --live-auth | --auth-bench | --selector]"
  );
}
let binaryName = "inth";
let entryPoint = "experiments/node/inth.ts";
if (smoke) {
  binaryName = "inth-smoke";
  entryPoint = "scripts/fixtures/yao-smoke.ts";
}
if (live) {
  binaryName = "inth-live-auth";
  entryPoint = "scripts/fixtures/live-auth.ts";
}
if (authBench) {
  binaryName = "inth-auth-bench";
  entryPoint = "scripts/fixtures/auth-bench.ts";
}
if (selector) {
  binaryName = "inth-selector-bench";
  entryPoint = "test/fixtures/node-picker.ts";
}
const root = fileURLToPath(new URL("../", import.meta.url));
const staging = path.join(root, "build", "yao");
const output = path.join(
  root,
  "dist-bin",
  "yao",
  process.platform === "win32" ? `${binaryName}.exe` : binaryName
);
const platforms = new Map([
  ["darwin", "macos"],
  ["linux", "linux"],
  ["win32", "win"],
]);
const platform = platforms.get(process.platform);
if (!platform || !["arm64", "x64"].includes(process.arch)) {
  throw new Error(
    "Build on macOS, Linux, or Windows with an arm64 or x64 host and matching installed dependencies."
  );
}
// Pin the embedded runtime independently of the developer's installed Node version.
const target = `node24.20.0-${platform}-${process.arch}`;
const require = createRequire(import.meta.url);
const manifest = packageSchema.parse(
  JSON.parse(await readFile(path.join(root, "package.json"), "utf-8"))
);

const compile = spawnSync(
  process.execPath,
  [require.resolve("typescript/bin/tsc"), "-p", "tsconfig.build.json"],
  { cwd: root, stdio: "inherit" }
);
if (compile.status !== 0) {
  throw new Error("TypeScript build failed.");
}
await rm(staging, { force: true, recursive: true });
await mkdir(staging, { recursive: true });
await mkdir(path.dirname(output), { recursive: true });
await cp(path.join(root, "..", "..", "LICENSE"), path.join(staging, "LICENSE"));
// Bundle JavaScript dependencies while preserving lazy auth loading. Native addons stay external.
await build({
  absWorkingDir: root,
  banner: {
    js: 'import { createRequire as createNodeRequire } from "node:module"; const require = createNodeRequire(import.meta.url);',
  },
  bundle: true,
  entryPoints: {
    inth: entryPoint,
  },
  external: ["@napi-rs/keyring"],
  format: "esm",
  outdir: path.join(staging, "dist"),
  platform: "node",
  splitting: true,
  target: "node24",
});
const staged = new Map<string, string>();

const stage = async (filename: string): Promise<void> => {
  const source = path.dirname(filename);
  const dependency = packageSchema.parse(
    JSON.parse(await readFile(filename, "utf-8"))
  );
  const existing = staged.get(dependency.name);
  if (existing) {
    if (existing !== dependency.version) {
      throw new Error(
        `Conflicting runtime versions for ${dependency.name}; add nested staging before packaging this graph.`
      );
    }
    return;
  }
  staged.set(dependency.name, dependency.version);
  await cp(source, path.join(staging, "node_modules", dependency.name), {
    filter: (candidate) =>
      !["node_modules", "test", "tests", "__tests__"].includes(
        path.basename(candidate)
      ),
    recursive: true,
  });
  for (const name of Object.keys(dependency.dependencies)) {
    await stage(resolveManifest(name, source));
  }
  for (const name of Object.keys(dependency.optionalDependencies)) {
    let resolved: string;
    try {
      resolved = resolveManifest(name, source);
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "MODULE_NOT_FOUND"
      ) {
        continue;
      }
      throw error;
    }
    await stage(resolved);
  }
};
await stage(resolveManifest("@napi-rs/keyring", root));
// Preserve licenses for dependencies embedded by the bundler, including transitives.
const licenses = new Set<string>();
const copyLicenses = async (filename: string): Promise<void> => {
  const dependency = packageSchema.parse(
    JSON.parse(await readFile(filename, "utf-8"))
  );
  if (licenses.has(dependency.name)) {
    return;
  }
  licenses.add(dependency.name);
  const directory = path.dirname(filename);
  const destination = path.join(staging, "licenses", dependency.name);
  await mkdir(destination, { recursive: true });
  const names = await readdir(directory);
  for (const name of names.filter((candidate) =>
    /^(?:license|licence|copying|notice)/iu.test(candidate)
  )) {
    await cp(path.join(directory, name), path.join(destination, name), {
      recursive: true,
    });
  }
  for (const name of Object.keys(dependency.dependencies)) {
    await copyLicenses(resolveManifest(name, directory));
  }
};
for (const name of [
  "@clack/prompts",
  "@napi-rs/keyring",
  "proper-lockfile",
  "zod",
]) {
  await copyLicenses(resolveManifest(name, root));
}
if (
  ![...staged.keys()].some((name) =>
    name.startsWith(`@napi-rs/keyring-${process.platform}-${process.arch}`)
  )
) {
  throw new Error(
    "The host keyring addon is missing. Install dependencies for this platform before building."
  );
}
await writeFile(
  path.join(staging, "package.json"),
  JSON.stringify(
    {
      bin: "dist/inth.js",
      dependencies: {
        "@napi-rs/keyring": manifest.devDependencies["@napi-rs/keyring"],
      },
      license: "Apache-2.0",
      name: manifest.name,
      pkg: {
        assets: [
          "dist/**/*.js",
          "node_modules/**/*",
          "licenses/**/*",
          "LICENSE",
        ],
        bytecode: false,
        sea: true,
      },
      type: "module",
      version: manifest.version,
    },
    null,
    2
  )
);
const built = spawnSync(
  process.execPath,
  [
    require.resolve("@yao-pkg/pkg/lib-es5/bin.js"),
    ".",
    "--sea",
    "--target",
    target,
    "--output",
    output,
  ],
  { cwd: staging, stdio: "inherit" }
);
if (built.status !== 0) {
  throw new Error("yao-pkg build failed.");
}
console.log(`Built ${output}`);
