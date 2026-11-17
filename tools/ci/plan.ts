// Selects the CI jobs a change needs. Adapted from the c15t repository's
// scripts/ci-plan.ts: a changed file selects the workspace that owns it, and
// every workspace that depends on that one through the pnpm workspace graph.
// Files outside every workspace either select a product by path or, when the
// path is unknown, select everything, so an unrecognized file never skips CI.
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";

export type Product = "cli" | "sdk" | "mobile";

export interface Workspace {
  dependencies: string[];
  directory: string;
  name: string;
  scripts: string[];
}

export interface Plan {
  android: boolean;
  cli: boolean;
  full: boolean;
  /** Mobile workspaces a web change reaches through the graph but does not run. */
  mobileReached: string[];
  reactNative: boolean;
  sdk: boolean;
  /** Selected `packages/sdk/*` directories with a test script. */
  sdkPackageTests: string[];
  /** Selected `packages/sdk/*` directories with a build script. */
  sdkPackages: string[];
  /** Selected SDK directories outside `packages/sdk` with a test script. */
  sdkWorkspaceTests: string[];
  /** Selected SDK directories with a check-types script. */
  sdkTypes: string[];
  swift: boolean;
}

const mobileWorkspaces = new Set([
  "benchmarks/mobile",
  "internals/doc-snippets/expo",
  "internals/fixtures/expo-dev",
  "internals/fixtures/react-native-bare",
  "packages/react-native",
]);

// The browser acceptance suite belongs to the browser groups, not to the
// package test jobs.
const excludedTests = new Set(["internals/fixtures/acceptance"]);

export const workspaceProduct = (directory: string): Product => {
  if (directory === "packages/cli" || directory.startsWith("npm/")) {
    return "cli";
  }
  return mobileWorkspaces.has(directory) ? "mobile" : "sdk";
};

/** Markdown never changes executable code; it only needs the lint jobs. */
export const isDocumentation = (file: string) =>
  /\.(?:md|mdx)$/u.test(file) ||
  file.startsWith("packages/sdk/docs/") ||
  /^packages\/sdk\/[^/]+\/readme\.json$/u.test(file);

// Root files that only the CLI jobs read. Everything else at the root, such
// as the lockfile, turbo.json, pnpm-workspace.yaml and .github/workflows,
// selects every product.
const cliRootFiles = [
  ".github/CODEOWNERS",
  ".github/ISSUE_TEMPLATE/",
  ".github/labels.yml",
  ".tegami/",
  "LICENSE",
  "NOTICE",
  "renovate.json",
  "docs/",
  "install.sh",
  "oxfmt.config.ts",
  "oxlint.config.ts",
  "tools/oxlint/",
  "vitest.config.ts",
];
const sdkRootFiles = ["oxfmt.sdk.config.ts", "oxlint.sdk.config.ts"];

const matches = (file: string, prefixes: string[]) =>
  prefixes.some((prefix) =>
    prefix.endsWith("/") ? file.startsWith(prefix) : file === prefix
  );

interface NativeSelection {
  android: boolean;
  reactNative: boolean;
  swift: boolean;
}

const noNative: NativeSelection = {
  android: false,
  reactNative: false,
  swift: false,
};
const allNative: NativeSelection = {
  android: true,
  reactNative: true,
  swift: true,
};

/** Which native toolchains a mobile path needs. */
export const nativeSelection = (file: string): NativeSelection => {
  // Codegen reads the specs and both native builds read the manifest.
  if (
    file.startsWith("packages/native-protocol/") ||
    file.startsWith("examples/native/") ||
    file.startsWith("packages/react-native/src/specs/") ||
    file === "packages/react-native/package.json"
  ) {
    return allNative;
  }
  if (file === "Package.swift" || file.startsWith("packages/swift/")) {
    return { ...noNative, swift: true };
  }
  if (file.startsWith("packages/android/")) {
    return { ...noNative, android: true };
  }
  if (
    /^packages\/react-native\/(?:ios\/|Package\.swift$|C15tReactNative\.podspec$|vendor\/)/u.test(
      file
    )
  ) {
    return { ...noNative, reactNative: true, swift: true };
  }
  if (file.startsWith("packages/react-native/android/")) {
    return { ...noNative, android: true, reactNative: true };
  }
  return noNative;
};

const isMobilePath = (file: string) =>
  file === "Package.swift" ||
  file.startsWith("packages/swift/") ||
  file.startsWith("packages/android/") ||
  file.startsWith("packages/native-protocol/") ||
  file.startsWith("examples/native/");

const ownerOf = (file: string, workspaces: Workspace[]) =>
  workspaces
    .filter(
      (workspace) =>
        workspace.directory !== "" && file.startsWith(`${workspace.directory}/`)
    )
    .toSorted((left, right) => right.directory.length - left.directory.length)
    .at(0);

/** The workspaces that depend on any of `names`, directly or not. */
export const dependents = (
  names: Iterable<string>,
  workspaces: Workspace[]
) => {
  const affected = new Set(names);
  let previous = -1;
  while (previous !== affected.size) {
    previous = affected.size;
    for (const workspace of workspaces) {
      if (workspace.dependencies.some((name) => affected.has(name))) {
        affected.add(workspace.name);
      }
    }
  }
  return affected;
};

const directoriesWith = (
  workspaces: Workspace[],
  script: string,
  include: (directory: string) => boolean
) =>
  workspaces
    .filter(
      (workspace) =>
        workspace.scripts.includes(script) &&
        include(workspace.directory) &&
        !excludedTests.has(workspace.directory)
    )
    .map((workspace) => workspace.directory)
    .toSorted();

const isSdkPackage = (directory: string) =>
  directory.startsWith("packages/sdk/");

const buildPlan = (
  selected: Workspace[],
  flags: Pick<
    Plan,
    "android" | "cli" | "full" | "reactNative" | "sdk" | "swift"
  >,
  mobileReached: string[]
): Plan => ({
  ...flags,
  mobileReached,
  sdkPackageTests: directoriesWith(selected, "test", isSdkPackage),
  sdkPackages: directoriesWith(selected, "build", isSdkPackage),
  sdkTypes: directoriesWith(selected, "check-types", () => true),
  sdkWorkspaceTests: directoriesWith(
    selected,
    "test",
    (directory) => !isSdkPackage(directory)
  ),
});

const sdkWorkspaces = (workspaces: Workspace[]) =>
  workspaces.filter(
    (workspace) =>
      workspace.directory !== "" &&
      workspaceProduct(workspace.directory) === "sdk"
  );

/** What a release or a manual run can ask for. `mobile` means all three. */
export type ProductOption = Product | "android" | "react-native" | "swift";

const productOptions = new Set<string>([
  "android",
  "cli",
  "mobile",
  "react-native",
  "sdk",
  "swift",
]);

/** Every job for the given products, as a release or a manual run needs. */
export const fullPlan = (
  workspaces: Workspace[],
  products: ProductOption[] = ["cli", "sdk", "mobile"]
): Plan => {
  const wants = (option: ProductOption) =>
    products.includes(option) || products.includes("mobile");
  const android = wants("android");
  const reactNative = wants("react-native");
  const swift = wants("swift");
  return buildPlan(
    products.includes("sdk") ? sdkWorkspaces(workspaces) : [],
    {
      android,
      cli: products.includes("cli"),
      full: true,
      reactNative,
      sdk: products.includes("sdk") || android || reactNative || swift,
      swift,
    },
    []
  );
};

// oxlint-disable-next-line complexity -- Each branch is one routing rule from the table in .github/CI.md.
export const createPlan = (files: string[], workspaces: Workspace[]): Plan => {
  const owners = new Set<string>();
  let cli = false;
  let sdk = false;
  let sdkAll = false;
  let native = { ...noNative };
  for (const file of files) {
    const owner = ownerOf(file, workspaces);
    const product = owner ? workspaceProduct(owner.directory) : undefined;
    native = {
      android: native.android || nativeSelection(file).android,
      reactNative: native.reactNative || nativeSelection(file).reactNative,
      swift: native.swift || nativeSelection(file).swift,
    };
    if (product === "cli") {
      cli = true;
    } else if (isDocumentation(file)) {
      // SDK and mobile docs need the SDK lint and format job only. Docs
      // outside both are linted by the CLI's root lint.
      if (product || isMobilePath(file) || file.startsWith("packages/sdk/")) {
        sdk = true;
      } else {
        cli = true;
      }
    } else if (owner) {
      owners.add(owner.name);
    } else if (file.startsWith("packages/native-protocol/")) {
      // Web packages read the shared protocol fixtures too.
      sdkAll = true;
    } else if (isMobilePath(file)) {
      sdk = true;
    } else if (matches(file, cliRootFiles)) {
      cli = true;
    } else if (matches(file, sdkRootFiles)) {
      sdk = true;
    } else {
      return fullPlan(workspaces);
    }
  }
  // Follow the graph from each changed workspace. A web SDK change can reach
  // @c15t/react-native through @c15t/core, but the mobile jobs run only for
  // mobile changes, so those workspaces are reported and not run.
  const mobileOwners = [...owners].filter((name) =>
    workspaces.some(
      (workspace) =>
        workspace.name === name &&
        workspaceProduct(workspace.directory) === "mobile"
    )
  );
  const affected = dependents(owners, workspaces);
  const mobileAffected = dependents(mobileOwners, workspaces);
  const selected = sdkAll
    ? sdkWorkspaces(workspaces)
    : workspaces.filter(
        (workspace) =>
          workspace.directory !== "" &&
          affected.has(workspace.name) &&
          workspaceProduct(workspace.directory) === "sdk"
      );
  const mobileReached = workspaces
    .filter(
      (workspace) =>
        affected.has(workspace.name) &&
        !mobileAffected.has(workspace.name) &&
        workspaceProduct(workspace.directory) === "mobile"
    )
    .map((workspace) => workspace.name)
    .toSorted();
  const reactNative = native.reactNative || mobileOwners.length > 0;
  const mobile = reactNative || native.swift || native.android;
  return buildPlan(
    selected,
    {
      android: native.android,
      cli,
      full: false,
      reactNative,
      sdk: sdk || mobile || selected.length > 0,
      swift: native.swift,
    },
    mobileReached
  );
};

const readManifest = (directory: string) => {
  const manifest: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    name: string;
    optionalDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  } = JSON.parse(readFileSync(path.join(directory, "package.json"), "utf-8"));
  return manifest;
};

/** The pnpm workspace, read without installing it. */
export const readWorkspaces = (root: string): Workspace[] => {
  const listed: { path: string }[] = JSON.parse(
    execFileSync("pnpm", ["ls", "--recursive", "--depth", "-1", "--json"], {
      cwd: root,
      encoding: "utf-8",
      maxBuffer: 64 * 1024 * 1024,
    })
  );
  return listed.map((entry) => {
    const manifest = readManifest(entry.path);
    return {
      dependencies: Object.keys({
        ...manifest.dependencies,
        ...manifest.devDependencies,
        ...manifest.optionalDependencies,
        ...manifest.peerDependencies,
      }),
      directory: path.relative(root, entry.path).split(path.sep).join("/"),
      name: manifest.name,
      scripts: Object.keys(manifest.scripts ?? {}),
    };
  });
};

const changedFiles = (base: string) =>
  execFileSync(
    "git",
    ["diff", "--no-renames", "--name-only", "-z", `${base}...HEAD`],
    { encoding: "utf-8" }
  )
    .split("\0")
    .filter(Boolean);

const isProductOption = (value: string): value is ProductOption =>
  productOptions.has(value);

const parseProducts = (value: string): ProductOption[] =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      if (isProductOption(item)) {
        return item;
      }
      throw new Error(
        `Unknown product "${item}". Use ${[...productOptions].join(", ")}.`
      );
    });

if (import.meta.main) {
  const root = process.cwd();
  const workspaces = readWorkspaces(root);
  const base = process.env.CI_DIFF_BASE ?? "";
  const products = parseProducts(process.env.CI_PRODUCTS ?? "");
  let plan: Plan;
  if (products.length > 0) {
    plan = fullPlan(workspaces, products);
  } else if (base === "" || /^0+$/u.test(base)) {
    plan = fullPlan(workspaces);
  } else {
    let files: string[] | undefined;
    try {
      files = changedFiles(base);
    } catch {
      // A force push can leave the previous tip out of the clone.
      process.stderr.write(
        `Cannot diff against ${base}; selecting a full run.\n`
      );
    }
    plan = files ? createPlan(files, workspaces) : fullPlan(workspaces);
  }
  const json = JSON.stringify(plan, null, 2);
  process.stdout.write(`${json}\n`);
  if (process.env.GITHUB_OUTPUT) {
    for (const [key, value] of Object.entries(plan)) {
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        `${key}=${JSON.stringify(value)}\n`
      );
    }
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## Selected checks\n\nBase: ${base || "full run"}${products.length > 0 ? `, products: ${products.join(", ")}` : ""}\n\n\`\`\`json\n${json}\n\`\`\`\n`
    );
  }
}
