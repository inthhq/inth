// What `inth mobile setup` writes and prints for a mobile app.
//
// Expo gets the config plugin entry and a provider file. Bare React Native gets
// the provider file and the exact Info.plist and AndroidManifest.xml entries to
// add. Swift and Android apps get printed steps only: nothing here edits an
// Xcode project, a Gradle file or a native manifest.

import { CliError } from "../../cli-error.ts";
import { JsonDocument } from "../../mcp-json.ts";
import { REACT_NATIVE_PACKAGE } from "./detect.ts";
import type { MobileProject } from "./detect.ts";

/**
 * The config plugin's specifier, as app.json names it. The React Native
 * package owns this name; change it here when that package is renamed.
 */
export const EXPO_PLUGIN = "@c15t/react-native/expo-plugin";

/**
 * The native artifact version the Android steps print.
 * test/mobile/setup.test.ts compares it with packages/android/gradle.properties.
 */
export const ANDROID_SDK_VERSION = "3.0.0-alpha.1";

/** Consent categories the native cores know, in their order. */
export const MOBILE_CATEGORIES = [
  "necessary",
  "functionality",
  "experience",
  "measurement",
  "marketing",
];

/** What a mobile setup needs. */
export interface MobileSetupOptions {
  /** The Inth project URL, in its normal form. */
  backendUrl: string;
  /** Always starts with necessary. */
  categories: string[];
  privacyPolicyUrl: string;
}

/** A file the setup writes. */
export interface PlannedFile {
  /** Relative to the project root, with forward slashes. */
  path: string;
  contents: string;
  /** "create" or "update". */
  action: string;
}

/** Files to write, and the steps the developer still has to take. */
export interface MobileSetupPlan {
  files: PlannedFile[];
  steps: string[];
  /** Files left alone, with the reason. */
  skipped: string[];
}

/** What the project already has, read before planning. */
export interface ProjectFiles {
  /** app.json contents, or "" when there is none. */
  appJson: string;
  /** A dynamic config such as app.config.ts, which setup does not edit, or "". */
  dynamicConfig: string;
  /** Whether a src directory exists. */
  hasSrc: boolean;
  /** Whether the provider file already exists. */
  providerExists: boolean;
  /** The root component the app renders, such as app/_layout.tsx. */
  rootComponent: string;
  /** The install command for a package, such as npm install. */
  installCommand: string;
}

/** No root component was found, so the step names the provider by its path. */
export const UNKNOWN_ROOT_COMPONENT = "your root component";

/**
 * Where the guides are. The mobile SDKs are a private prerelease and their
 * pages are not published yet, so the steps point at copies a developer has:
 * the Markdown the React Native package bundles, or the SDK source.
 */
const RN_DOCS = `node_modules/${REACT_NATIVE_PACKAGE}/docs`;
const SOURCE_DOCS = "packages/sdk/docs";

const quote = (value: string): string => JSON.stringify(value);

/**
 * The Expo config plugin entry, as JSON text.
 * @param options The setup answers.
 * @param unit One level of indentation.
 * @param base The indentation of the line the entry starts on.
 * @returns A two-element JSON array: the plugin name and its options.
 */
export const expoPluginEntry = (
  options: MobileSetupOptions,
  unit = "\t",
  base = ""
): string => {
  const inner = `${base}${unit}`;
  return [
    "[",
    `${inner}${quote(EXPO_PLUGIN)},`,
    `${inner}{`,
    `${inner}${unit}"backendURL": ${quote(options.backendUrl)},`,
    `${inner}${unit}"consentCategories": [${options.categories.map(quote).join(", ")}]`,
    `${inner}}`,
    `${base}]`,
  ].join("\n");
};

const invalidAppJson = (detail: string): CliError =>
  new CliError(
    "invalid_config",
    `app.json ${detail}. Repair it, or add the plugin entry by hand.`
  );

const parseAppJson = (source: string): JsonDocument => {
  try {
    return new JsonDocument(source);
  } catch {
    throw invalidAppJson("is not a JSON object");
  }
};

const lineIndent = (source: string, offset: number): string => {
  const start = source.slice(0, offset).lastIndexOf("\n") + 1;
  return /^[ \t]*/u.exec(source.slice(start))?.[0] ?? "";
};

/** The indentation of the first indented key, without its quote. */
const firstKeyIndent = (source: string): string =>
  /^[ \t]+"/mu.exec(source)?.[0].slice(0, -1) ?? "";

const indentUnit = (source: string): string => {
  const indent = firstKeyIndent(source);
  if (indent === "") {
    return "\t";
  }
  return indent.startsWith("\t") ? "\t" : indent;
};

/** The string a plugins element names: itself, or the first item of an array. */
const pluginName = (document: JsonDocument, index: number): string => {
  const node = document.nodes[index];
  const named =
    node?.kind === "array"
      ? document.nodes.find((item) => item.parent === index)
      : node;
  if (!named || named.kind !== "string") {
    return "";
  }
  // SAFETY: The scanner validated a complete JSON string at this exact span.
  return JSON.parse(
    document.source.slice(named.valueStart, named.end)
  ) as string;
};

const isInthPlugin = (name: string): boolean =>
  name === EXPO_PLUGIN || name === REACT_NATIVE_PACKAGE;

/** The plugins array with `entry` appended. */
const appendPlugin = (
  document: JsonDocument,
  plugins: number,
  options: MobileSetupOptions,
  unit: string
): string => {
  const { source } = document;
  const array = document.nodes[plugins];
  if (!array) {
    throw invalidAppJson("has no plugins array");
  }
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const children = document.nodes.filter((item) => item.parent === plugins);
  const last = children.at(-1);
  const span = source.slice(array.valueStart, array.end);
  if (last && span.includes("\n")) {
    const indent = lineIndent(source, last.valueStart);
    const entry = expoPluginEntry(options, unit, indent);
    return `${source.slice(0, last.end)},${newline}${indent}${entry}${source.slice(last.end)}`;
  }
  // An empty or one-line array is rewritten with one element per line.
  const outer = lineIndent(source, array.valueStart);
  const inner = `${outer}${unit}`;
  const elements = [
    ...children.map((child) => source.slice(child.valueStart, child.end)),
    expoPluginEntry(options, unit, inner),
  ];
  const rewritten = `[${newline}${elements.map((element) => `${inner}${element}`).join(`,${newline}`)}${newline}${outer}]`;
  return `${source.slice(0, array.valueStart)}${rewritten}${source.slice(array.end)}`;
};

/** Nested JSON text for a value inserted under `parent`, as JsonDocument.insert places it. */
const insertedBase = (document: JsonDocument, parent: number): string => {
  const node = document.nodes[parent];
  const unit = firstKeyIndent(document.source) || "  ";
  return `${lineIndent(document.source, node?.valueStart ?? 0)}${unit}`;
};

const newAppJson = (options: MobileSetupOptions): string =>
  `{\n\t"expo": {\n\t\t"plugins": [\n\t\t\t${expoPluginEntry(options, "\t", "\t\t\t")}\n\t\t]\n\t}\n}\n`;

/**
 * Add the plugin entry to app.json, keeping everything else as written.
 * @param raw The current file, or "" when there is none.
 * @param options The setup answers.
 * @param overwrite Replace an existing Inth plugin entry instead of keeping it.
 * @returns The new file, or "" when an Inth entry exists and is kept.
 * @throws {CliError} invalid_config when app.json is not a JSON object, or
 * when expo is not an object or expo.plugins is not an array.
 */
export const mergeExpoAppJson = (
  raw: string,
  options: MobileSetupOptions,
  overwrite: boolean
): string => {
  if (raw.trim() === "") {
    return newAppJson(options);
  }
  const document = parseAppJson(raw);
  const unit = indentUnit(raw);
  const expo = document.child(0, "expo");
  if (expo < 0) {
    const base = insertedBase(document, 0);
    return document.insert(
      0,
      "expo",
      `{\n${base}${unit}"plugins": [\n${base}${unit}${unit}${expoPluginEntry(options, unit, `${base}${unit}${unit}`)}\n${base}${unit}]\n${base}}`
    );
  }
  if (document.nodes[expo]?.kind !== "object") {
    throw invalidAppJson('has an "expo" value that is not an object');
  }
  const plugins = document.child(expo, "plugins");
  if (plugins < 0) {
    const base = insertedBase(document, expo);
    return document.insert(
      expo,
      "plugins",
      `[\n${base}${unit}${expoPluginEntry(options, unit, `${base}${unit}`)}\n${base}]`
    );
  }
  if (document.nodes[plugins]?.kind !== "array") {
    throw invalidAppJson('has an "expo.plugins" value that is not an array');
  }
  const existing = document.nodes.findIndex(
    (node, index) =>
      node.parent === plugins && isInthPlugin(pluginName(document, index))
  );
  const node = document.nodes[existing];
  if (!node) {
    return appendPlugin(document, plugins, options, unit);
  }
  if (!overwrite) {
    return "";
  }
  const entry = expoPluginEntry(
    options,
    unit,
    lineIndent(raw, node.valueStart)
  );
  return `${raw.slice(0, node.valueStart)}${entry}${raw.slice(node.end)}`;
};

/**
 * The provider file. ConsentProvider with the privacy policy opens the native
 * prompt by itself when the policy asks for one, and a Privacy settings button
 * stays reachable afterwards.
 * @param typescript Write TypeScript instead of JavaScript.
 * @returns The file contents.
 */
export const providerSource = (typescript: boolean): string => {
  const props = typescript
    ? ": { children: ReactNode; privacyPolicyURL: string }"
    : "";
  const types = typescript ? "import type { ReactNode } from 'react';\n" : "";
  return `// Generated by \`inth mobile setup\`. The native consent engine reads its backend and
// categories from the build configuration; this file only attaches to it.
import { ConsentProvider, presentPreferences } from '${REACT_NATIVE_PACKAGE}';
${types}import { Button } from 'react-native';

/**
 * Render your app inside this, once, above navigation. The provider opens the
 * consent prompt when the policy asks for one; pass autoPresent={false} to
 * ConsentProvider to open it yourself.
 */
export const PrivacyApp = ({ children, privacyPolicyURL }${props}) => (
\t<ConsentProvider privacyPolicyURL={privacyPolicyURL}>
\t\t{children}
\t\t<Button
\t\t\ttitle="Privacy settings"
\t\t\tonPress={() => {
\t\t\t\tvoid presentPreferences(privacyPolicyURL);
\t\t\t}}
\t\t/>
\t</ConsentProvider>
);
`;
};

const xml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** The Info.plist entries a bare app adds. */
export const infoPlistEntries = (options: MobileSetupOptions): string =>
  [
    "<key>com.c15t.backend.url</key>",
    `<string>${xml(options.backendUrl)}</string>`,
    "<key>com.c15t.categories</key>",
    "<array>",
    ...options.categories.map((category) => `\t<string>${category}</string>`),
    "</array>",
  ].join("\n");

/** The application meta-data a bare app adds to AndroidManifest.xml. */
export const androidManifestEntries = (options: MobileSetupOptions): string =>
  [
    `<meta-data android:name="com.c15t.BACKEND_URL" android:value="${xml(options.backendUrl)}" />`,
    `<meta-data android:name="com.c15t.CATEGORIES" android:value="${options.categories.join(", ")}" />`,
  ].join("\n");

/** The provider file's path, relative to the project root. */
export const providerPath = (typescript: boolean, hasSrc: boolean): string =>
  `${hasSrc ? "src/" : ""}c15t/privacy-app.${typescript ? "tsx" : "jsx"}`;

/** `target` relative to the directory `from`, both with forward slashes. */
const relativePath = (from: string, target: string): string => {
  const source = from.split("/").filter(Boolean);
  const destination = target.split("/").filter(Boolean);
  let shared = 0;
  while (
    shared < source.length &&
    shared < destination.length &&
    source[shared] === destination[shared]
  ) {
    shared += 1;
  }
  const up = source.slice(shared).map(() => "..");
  return [...up, ...destination.slice(shared)].join("/");
};

/**
 * The specifier the root component imports the provider with, relative to
 * the root component's own directory: app/_layout.tsx imports
 * ../c15t/privacy-app.
 * @param rootComponent The root component's path, or UNKNOWN_ROOT_COMPONENT.
 * @param providerFile The provider file's path.
 * @returns A relative module specifier without the extension.
 */
export const providerImport = (
  rootComponent: string,
  providerFile: string
): string => {
  const target = providerFile.replace(/\.[jt]sx$/u, "");
  if (rootComponent === UNKNOWN_ROOT_COMPONENT) {
    return `./${target}`;
  }
  const slash = rootComponent.lastIndexOf("/");
  const relative = relativePath(
    slash === -1 ? "" : rootComponent.slice(0, slash),
    target
  );
  return relative.startsWith(".") ? relative : `./${relative}`;
};

const wrapStep = (
  files: ProjectFiles,
  providerFile: string,
  url: string
): string =>
  files.rootComponent === UNKNOWN_ROOT_COMPONENT
    ? `Render your app inside <PrivacyApp privacyPolicyURL="${url}">, once, in your root component. It is exported from ${providerFile}.`
    : `Render your app inside <PrivacyApp privacyPolicyURL="${url}">, once, in ${files.rootComponent}: import { PrivacyApp } from '${providerImport(files.rootComponent, providerFile)}';`;

const expoConfigPlan = (
  options: MobileSetupOptions,
  files: ProjectFiles,
  overwrite: boolean,
  plan: MobileSetupPlan
): void => {
  if (files.dynamicConfig !== "") {
    plan.steps.push(
      `Add this entry to "plugins" in ${files.dynamicConfig} (inth does not edit a dynamic config):\n${expoPluginEntry(options, "  ")}`
    );
    return;
  }
  const merged = mergeExpoAppJson(files.appJson, options, overwrite);
  if (merged === "") {
    plan.skipped.push(
      "app.json already has an Inth plugin entry; pass --overwrite to replace it."
    );
    return;
  }
  plan.files.push({
    action: files.appJson === "" ? "create" : "update",
    contents: merged,
    path: "app.json",
  });
};

/**
 * Plan the setup for an Expo or bare React Native app.
 * @param project From detectMobileProject.
 * @param options The setup answers.
 * @param files What the project already has.
 * @param overwrite Replace an existing plugin entry and provider file.
 * @returns The files to write and the remaining steps.
 */
export const planReactNativeSetup = (
  project: MobileProject,
  options: MobileSetupOptions,
  files: ProjectFiles,
  overwrite: boolean
): MobileSetupPlan => {
  const plan: MobileSetupPlan = { files: [], skipped: [], steps: [] };
  if (!project.installed) {
    plan.steps.push(
      `Install the ${REACT_NATIVE_PACKAGE} tarball you were given (the mobile SDK is a private prerelease): ${files.installCommand} /absolute/path/to/c15t-react-native.tgz`
    );
  }
  const providerFile = providerPath(project.typescript, files.hasSrc);
  if (project.kind === "expo") {
    expoConfigPlan(options, files, overwrite, plan);
  }
  if (files.providerExists && !overwrite) {
    plan.skipped.push(
      `${providerFile} exists; pass --overwrite to replace it.`
    );
  } else {
    plan.files.push({
      action: files.providerExists ? "update" : "create",
      contents: providerSource(project.typescript),
      path: providerFile,
    });
  }
  plan.steps.push(wrapStep(files, providerFile, options.privacyPolicyUrl));
  if (project.kind === "expo") {
    plan.steps.push(
      `Android resolves the native SDK from the private Maven repository you were given. Add it with the plugin's androidMavenRepository option. See ${RN_DOCS}/frameworks/react-native/expo.md.`,
      "Build a native app: npx expo prebuild, then npx expo run:ios or npx expo run:android. Expo Go cannot load the native module."
    );
    return plan;
  }
  plan.steps.push(
    `iOS: add these entries inside the root <dict> of your app target's Info.plist, then run pod install in ios/.\n${infoPlistEntries(options)}`,
    `Android: add the private Maven repository you were given to android/build.gradle (${RN_DOCS}/frameworks/react-native/bare.md, Set up Android), and these entries inside <application> in android/app/src/main/AndroidManifest.xml:\n${androidManifestEntries(options)}`,
    "Rebuild both apps; native configuration needs a new binary."
  );
  return plan;
};

const kotlinCategories = (categories: string[]): string =>
  categories
    .map((category) => `ConsentCategory.${category.toUpperCase()}`)
    .join(", ");

const swiftCategories = (categories: string[]): string =>
  categories.map((category) => `.${category}`).join(", ");

const escapeCharacter = (character: string): string => {
  if (character === "\n") {
    return "\\n";
  }
  if (character === "\r") {
    return "\\r";
  }
  if (character === "\t") {
    return "\\t";
  }
  return `\\${character}`;
};

/**
 * `value` as a Swift string literal. A URL can carry a quote or backslash that
 * `new URL` accepts by percent-encoding, so it is escaped, never pasted raw.
 */
export const swiftString = (value: string): string =>
  `"${value.replaceAll(/["\\\n\r\t]/gu, escapeCharacter)}"`;

/** `value` as a Kotlin string literal, with $ escaped so it starts no template. */
export const kotlinString = (value: string): string =>
  `"${value.replaceAll(/["$\\\n\r\t]/gu, escapeCharacter)}"`;

const indentBlock = (text: string, prefix: string): string =>
  text
    .split("\n")
    .map((line, index) => (index === 0 ? line : `${prefix}${line}`))
    .join("\n");

/**
 * The Swift configuration: the project URL and the categories the app offers.
 * packages/swift/Tests/C15tAppleTests/CLISnippetTests.swift compiles this text
 * with the default categories, and test/mobile/setup.test.ts compares the two.
 */
export const swiftConfiguration = (options: MobileSetupOptions): string =>
  `C15tAppleConfiguration(
    backendURL: ${swiftString(options.backendUrl)},
    consentCategories: [${swiftCategories(options.categories)}]
)`;

/**
 * The SwiftUI entry point: the stock screens on the root view, which install
 * the engine from `configuration` and open the prompt when the policy asks
 * for one. packages/swift/Tests/C15tConsentUITests/cli-entry-snippet-tests.swift
 * compiles this text.
 */
export const swiftUIEntry = (
  configuration: string,
  privacyPolicyUrl: string
): string =>
  configuration === ""
    ? `ContentView()
    .c15tConsent(privacyPolicyURL: URL(string: ${swiftString(privacyPolicyUrl)})!)`
    : `ContentView()
    .c15tConsent(
        ${indentBlock(configuration, "        ")},
        privacyPolicyURL: URL(string: ${swiftString(privacyPolicyUrl)})!
    )`;

/** The UIKit entry point, ConsentRootViewController(root:configuration:privacyPolicyURL:). */
export const uiKitEntry = (
  configuration: string,
  privacyPolicyUrl: string
): string => {
  const configured =
    configuration === ""
      ? ""
      : `
    configuration: ${indentBlock(configuration, "    ")},`;
  return `window.rootViewController = ConsentRootViewController(
    root: UIHostingController(rootView: ContentView()),${configured}
    privacyPolicyURL: URL(string: ${swiftString(privacyPolicyUrl)})!
)`;
};

/** Opens privacy settings from the app's own control, on Apple platforms. */
export const SWIFT_PRIVACY_SETTINGS =
  "ConsentPrompt.current?.presentPreferences()";

/**
 * The Kotlin install, for Application.onCreate.
 * packages/android/c15t-android/src/test/kotlin/com/c15t/android/CliSnippetTest.kt
 * compiles this text with the default categories.
 */
export const kotlinInstall = (options: MobileSetupOptions): string =>
  `C15tAndroid.install(this, NativeConfig(
    backendUrl = ${kotlinString(options.backendUrl)},
    consentCategories = listOf(${kotlinCategories(options.categories)}),
))`;

/** The Compose entry point, beside the app's content. */
export const composeEntry = (privacyPolicyUrl: string): string =>
  `C15tConsent(privacyPolicyUrl = ${kotlinString(privacyPolicyUrl)})`;

/** The entry point for an Activity with views, after setContentView. */
export const activityEntry = (privacyPolicyUrl: string): string =>
  `val consent = attachConsent(${kotlinString(privacyPolicyUrl)})
privacySettings.setOnClickListener { consent.presentPreferences() }`;

/** Opens privacy settings from the app's own control on Android. */
export const KOTLIN_PRIVACY_SETTINGS =
  "ConsentPrompt.current?.presentPreferences()";

/** The Kotlin imports kotlinInstall needs. */
export const KOTLIN_INSTALL_IMPORTS = [
  "com.c15t.android.C15tAndroid",
  "com.c15t.core.NativeConfig",
  "com.c15t.core.model.ConsentCategory",
];

/** The Kotlin imports the consent screen entry points need. */
export const KOTLIN_SCREEN_IMPORTS = [
  "com.c15t.consentui.C15tConsent",
  "com.c15t.consentui.ConsentPrompt",
  "com.c15t.consentui.attachConsent",
];

const swiftInstallStep = (options: MobileSetupOptions): string => {
  const url = options.privacyPolicyUrl;
  const configuration = swiftConfiguration(options);
  return `iOS: attach the consent screens. They install the engine at launch and open the prompt when the policy asks for one. With import C15tApple and import C15tConsentUI. SwiftUI, on your root view:\n${swiftUIEntry(configuration, url)}\nUIKit, as the window's root view controller:\n${uiKitEntry(configuration, url)}\nOpen privacy settings from your own control with ${SWIFT_PRIVACY_SETTINGS}.`;
};

const androidInstallStep = (options: MobileSetupOptions): string => {
  const url = options.privacyPolicyUrl;
  return `Android: in Application.onCreate, install the engine (imports: ${KOTLIN_INSTALL_IMPORTS.join(", ")}):\n${kotlinInstall(options)}\nThen show the consent screens, which open the prompt when the policy asks for one (imports: ${KOTLIN_SCREEN_IMPORTS.join(", ")}). In a Compose activity, beside your content:\n${composeEntry(url)}\nIn an Activity with views, after setContentView:\n${activityEntry(url)}\nOpen privacy settings from your own control with ${KOTLIN_PRIVACY_SETTINGS}. Add android.permission.INTERNET to the manifest.`;
};

/**
 * Steps for a Swift or Android app. Nothing is written: Xcode projects,
 * Gradle files and manifests stay the developer's to edit.
 * @param platforms From detectNativePlatforms.
 * @param options The setup answers.
 * @returns The steps, per platform.
 */
export const planNativeSetup = (
  platforms: string[],
  options: MobileSetupOptions
): MobileSetupPlan => {
  const steps: string[] = [];
  if (platforms.includes("ios")) {
    steps.push(
      "iOS: the Swift SDK is private source. In Xcode, choose File > Add Package Dependencies > Add Local and select your checkout of the Inth SDK source. Add the C15tCore, C15tApple and C15tConsentUI products to your app target.",
      swiftInstallStep(options)
    );
  }
  if (platforms.includes("android")) {
    steps.push(
      `Android: add the private Maven repository you were given to dependencyResolutionManagement.repositories in settings.gradle.kts, with includeGroup("com.c15t"), as ${SOURCE_DOCS}/frameworks/android/quickstart.mdx in the SDK source shows.`,
      `Android: add to app/build.gradle.kts:\nimplementation("com.c15t:c15t-android:${ANDROID_SDK_VERSION}")\nimplementation("com.c15t:c15t-consent-ui:${ANDROID_SDK_VERSION}")`,
      androidInstallStep(options)
    );
  }
  return { files: [], skipped: [], steps };
};
