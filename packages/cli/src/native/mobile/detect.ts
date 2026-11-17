// Finds the Expo, bare React Native, Swift or Android project that
// `inth mobile setup` runs in, from that project or any directory inside it.

import { existsSync, readdirSync, readFileSync } from "node:fs";
// eslint-disable-next-line unicorn/import-style -- Scriptc requires named node:path imports.
import { dirname, join, resolve } from "node:path";

import { dependencyNames } from "../../c15t.ts";
import type { PackageManifest } from "../../c15t.ts";

/** The React Native package the setup installs and configures. */
export const REACT_NATIVE_PACKAGE = "@c15t/react-native";

/** An Expo or bare React Native app, or a Swift or Android app. */
export interface MobileProject {
  /** "expo", "react-native" or "native". */
  kind: string;
  root: string;
  /** For a native app: "ios", "android" or both. */
  platforms: string[];
  /** Whether tsconfig.json exists, which picks .tsx over .jsx. */
  typescript: boolean;
  /** Whether the React Native package is already a dependency. */
  installed: boolean;
  /** The package.json packageManager field, such as pnpm@11.0.0. */
  packageManager: string;
}

const IOS_MARKERS = [/\.xcodeproj$/u, /\.xcworkspace$/u, /^Package\.swift$/u];
/** Markers that name a whole project, not one module inside it. */
const PROJECT_MARKERS = [...IOS_MARKERS, /^settings\.gradle(?:\.kts)?$/u];
const ANDROID_MARKERS = [
  /^settings\.gradle(?:\.kts)?$/u,
  /^build\.gradle(?:\.kts)?$/u,
  /^gradlew$/u,
];
const MAX_DEPTH = 10;

const entriesOf = (directory: string): string[] => {
  try {
    return readdirSync(directory);
  } catch {
    return [];
  }
};

const matchesAny = (entries: string[], markers: RegExp[]): boolean =>
  entries.some((entry) => markers.some((marker) => marker.test(entry)));

/**
 * The native platforms a directory without package.json builds for.
 *
 * Only the directory's own entries count: an Xcode project, a workspace or
 * Package.swift means iOS, and a Gradle build means Android. A directory with
 * a package.json returns none, so a web or React Native app never reads as a
 * native one.
 * @param directory The directory to look in.
 * @returns "ios", "android", both, or none.
 */
export const detectNativePlatforms = (directory: string): string[] => {
  if (existsSync(join(directory, "package.json"))) {
    return [];
  }
  const entries = entriesOf(directory);
  const platforms: string[] = [];
  if (matchesAny(entries, IOS_MARKERS)) {
    platforms.push("ios");
  }
  if (matchesAny(entries, ANDROID_MARKERS)) {
    platforms.push("android");
  }
  return platforms;
};

/**
 * The nearest Swift or Gradle project at or above `directory`, or "".
 *
 * The walk stops at the first package.json, because a JavaScript project
 * there owns the directory. An Xcode project, a workspace, Package.swift or a
 * Gradle settings file names a project, so the nearest one wins. A module's
 * own build.gradle is used only when no settings file is found above it, so
 * app/src/main resolves to the Gradle project, not to app/.
 * @param directory The directory the command runs in.
 * @returns The native project root, or "" when there is none.
 */
export const findNativeRoot = (directory: string): string => {
  let module = "";
  let current = resolve(directory);
  for (let depth = 0; depth <= MAX_DEPTH; depth += 1) {
    if (existsSync(join(current, "package.json"))) {
      return "";
    }
    const entries = entriesOf(current);
    if (matchesAny(entries, PROJECT_MARKERS)) {
      return current;
    }
    if (module === "" && matchesAny(entries, ANDROID_MARKERS)) {
      module = current;
    }
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return module;
};

/** The nearest directory at or above `directory` with a package.json, or "". */
const findPackageRoot = (directory: string): string => {
  let current = resolve(directory);
  for (let depth = 0; depth <= MAX_DEPTH; depth += 1) {
    if (existsSync(join(current, "package.json"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return "";
    }
    current = parent;
  }
  return "";
};

const readManifest = (root: string): PackageManifest => {
  try {
    // SAFETY: Scriptc checks the declared field types at this JSON boundary; dependency maps hold strings.
    return JSON.parse(
      readFileSync(join(root, "package.json"), "utf-8")
    ) as PackageManifest;
  } catch {
    return {};
  }
};

const reactNativeProject = (root: string): MobileProject | undefined => {
  const manifest = readManifest(root);
  const names = dependencyNames(manifest);
  let kind = "";
  if (names.includes("expo")) {
    kind = "expo";
  } else if (names.includes("react-native")) {
    kind = "react-native";
  }
  if (kind === "") {
    return undefined;
  }
  return {
    installed: names.includes(REACT_NATIVE_PACKAGE),
    kind,
    packageManager: manifest.packageManager ?? "",
    platforms: [],
    root,
    typescript: existsSync(join(root, "tsconfig.json")),
  };
};

/**
 * Find the mobile app `directory` belongs to.
 *
 * The nearest package.json wins when it depends on expo (Expo) or on
 * react-native (bare React Native), so ios/ and android/ inside a React Native
 * app resolve to the app. Otherwise the nearest Swift or Gradle project wins,
 * even inside a web project's folder.
 * @param directory The directory the command runs in.
 * @returns The project, or undefined when the directory is in no mobile app.
 */
export const detectMobileProject = (
  directory: string
): MobileProject | undefined => {
  const packageRoot = findPackageRoot(directory);
  const app = packageRoot === "" ? undefined : reactNativeProject(packageRoot);
  if (app) {
    return app;
  }
  const nativeRoot = findNativeRoot(directory);
  const platforms = nativeRoot === "" ? [] : detectNativePlatforms(nativeRoot);
  if (platforms.length === 0) {
    return undefined;
  }
  return {
    installed: false,
    kind: "native",
    packageManager: "",
    platforms,
    root: nativeRoot,
    typescript: false,
  };
};
