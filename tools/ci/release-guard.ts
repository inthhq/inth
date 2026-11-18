// Refuses an SDK or mobile release while it would publish Inth artifacts.
// The SDK, React Native, Swift and Android release workflows run this before
// any publish step. They stay off until the packages carry Inth names and the
// owner sets the product's release variable and registry credentials.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export type ReleaseProduct = "android" | "react-native" | "sdk" | "swift";

const inthName = /^(?:inth$|@inth\/)/u;

const readJson = (file: string) => {
  const manifest: { name: string; private?: boolean } = JSON.parse(
    readFileSync(file, "utf-8")
  );
  return manifest;
};

/** The names this product would publish, as the registry would see them. */
export const releaseNames = (root: string, product: ReleaseProduct) => {
  if (product === "sdk") {
    const directory = path.join(root, "packages/sdk");
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => {
        try {
          return [readJson(path.join(directory, entry.name, "package.json"))];
        } catch {
          return [];
        }
      })
      .filter((manifest) => !manifest.private)
      .map((manifest) => manifest.name);
  }
  if (product === "react-native") {
    return [
      readJson(path.join(root, "packages/react-native/package.json")).name,
    ];
  }
  if (product === "android") {
    const publishing = readFileSync(
      path.join(root, "packages/android/gradle/publishing.gradle"),
      "utf-8"
    );
    return [...publishing.matchAll(/^group = '(?<group>[^']+)'/gmu)].map(
      (match) => match.groups?.group ?? ""
    );
  }
  const manifest = readFileSync(path.join(root, "Package.swift"), "utf-8");
  return [...manifest.matchAll(/\.library\(name: "(?<name>[^"]+)"/gu)].map(
    (match) => match.groups?.name ?? ""
  );
};

/** Why this release must not run, or an empty list when it may. */
export const releaseRefusals = (
  root: string,
  product: ReleaseProduct,
  enabled: string
) => {
  const refusals: string[] = [];
  if (enabled !== "true") {
    refusals.push(
      `The ${product} release is disabled. Set the repository variable for it to "true" once its packages carry Inth names and its registry credentials exist.`
    );
  }
  const names = releaseNames(root, product);
  if (names.length === 0) {
    refusals.push(`Found nothing to publish for ${product}.`);
  }
  const legacy = names.filter(
    (name) =>
      inthName.test(name) ||
      name.startsWith("com.inth") ||
      name.toLowerCase().startsWith("inth")
  );
  if (legacy.length > 0) {
    refusals.push(
      `These still carry inth names and must not publish from this repository: ${legacy.join(", ")}.`
    );
  }
  return refusals;
};

const isReleaseProduct = (value: string): value is ReleaseProduct =>
  ["android", "react-native", "sdk", "swift"].includes(value);

if (import.meta.main) {
  const [product = ""] = process.argv.slice(2);
  if (!isReleaseProduct(product)) {
    throw new Error(
      "Usage: node tools/ci/release-guard.ts <sdk|react-native|swift|android>"
    );
  }
  const refusals = releaseRefusals(
    process.cwd(),
    product,
    process.env.RELEASE_ENABLED ?? ""
  );
  for (const refusal of refusals) {
    process.stderr.write(`::error::${refusal}\n`);
  }
  process.exitCode = refusals.length > 0 ? 1 : 0;
}
