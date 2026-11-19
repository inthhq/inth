import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
// eslint-disable-next-line unicorn/import-style -- Matches the native sources.
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { parseArguments } from "../../src/arguments.ts";
import type { CliError } from "../../src/cli-error.ts";
import { helpCommands } from "../../src/help.ts";
import type { MobileSetupArguments } from "../../src/mobile.ts";
import {
  detectMobileProject,
  detectNativePlatforms,
} from "../../src/native/mobile/detect.ts";
import { isPrivacyPolicyUrl } from "../../src/native/mobile/privacy-policy-url.ts";
import {
  activityEntry,
  ANDROID_SDK_VERSION,
  androidManifestEntries,
  composeEntry,
  EXPO_PLUGIN,
  expoPluginEntry,
  infoPlistEntries,
  KOTLIN_INSTALL_IMPORTS,
  KOTLIN_PRIVACY_SETTINGS,
  kotlinInstall,
  kotlinString,
  mergeExpoAppJson,
  providerImport,
  SWIFT_PRIVACY_SETTINGS,
  swiftConfiguration,
  swiftString,
  swiftUIEntry,
  uiKitEntry,
} from "../../src/native/mobile/scaffold.ts";
import type { MobileSetupOptions } from "../../src/native/mobile/scaffold.ts";
import {
  DEFAULT_CATEGORIES,
  mobileSetupMessage,
  runMobileSetup,
} from "../../src/native/mobile/setup.ts";
import type { MobileSetupResult } from "../../src/native/mobile/setup.ts";
import { telemetryCommand } from "../../src/telemetry.ts";

const REPO = join(import.meta.dirname, "../../../..");
const PRIVACY_URL = "https://app.example/privacy";

const SWIFT_SNIPPETS =
  "packages/swift/Tests/InthAppleTests/CLISnippetTests.swift";
const KOTLIN_SNIPPETS =
  "packages/android/inth-android/src/test/kotlin/com/inth/android/CliSnippetTest.kt";
const SWIFT_ENTRY_SNIPPETS =
  "packages/swift/Tests/InthConsentUITests/cli-entry-snippet-tests.swift";
const KOTLIN_ENTRY_SNIPPETS =
  "packages/android/inth-consent-ui/src/test/kotlin/com/inth/consentui/cli-entry-snippet-test.kt";
const ANDROID_PROPERTIES = "packages/android/gradle.properties";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

/** Writes `files` into a fresh directory and returns its path. */
const project = (files: Record<string, string>): string => {
  const root = mkdtempSync(join(tmpdir(), "inth-mobile-"));
  roots.push(root);
  for (const [name, contents] of Object.entries(files)) {
    const target = join(root, name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }
  return root;
};

const pkg = (dependencies: Record<string, string>): string =>
  JSON.stringify({ dependencies, name: "app" });

const read = (root: string, file: string): string =>
  readFileSync(join(root, file), "utf-8");

/** The parsed `inth mobile setup` arguments, with a privacy policy unless given. */
const parsed = (args: string[]): MobileSetupArguments => {
  const result = parseArguments([
    "mobile",
    "setup",
    ...args,
    ...(args.includes("--privacy-policy-url")
      ? []
      : ["--privacy-policy-url", PRIVACY_URL]),
  ]);
  if (!result.mobile) {
    throw new Error("mobile setup arguments were not parsed");
  }
  return result.mobile;
};

const setup = (cwd: string, args: string[]): MobileSetupResult =>
  runMobileSetup(parsed(args), cwd);

const failure = (run: () => void): CliError => {
  try {
    run();
  } catch (error) {
    // SAFETY: Every failure these tests provoke is a CliError.
    return error as CliError;
  }
  throw new Error("Expected the command to fail.");
};

const options = (backendUrl: string): MobileSetupOptions => ({
  backendUrl,
  categories: DEFAULT_CATEGORIES,
  privacyPolicyUrl: PRIVACY_URL,
});

interface AppJson {
  expo: { name?: string; plugins: (string | [string, PluginProps])[] };
}
interface PluginProps {
  projectUrl: string;
  consentCategories: string[];
}

// SAFETY: The tests parse app.json files that setup wrote or the test supplied.
const appJson = (text: string): AppJson => JSON.parse(text) as AppJson;

interface ExpoPluginModules {
  resolveParams: (props: PluginProps | { projectUrl: string }) => {
    projectUrl: string;
    dryRun: boolean;
  };
  ANDROID_META: { backendUrl: string; categories: string };
  IOS_PLIST_KEY: { projectUrl: string; categories: string };
}

/**
 * The Expo plugin's own rules, which setup has to agree with. Loaded at run
 * time because the CLI does not type-check the React Native package's source.
 */
const expoPlugin = async (): Promise<ExpoPluginModules> => {
  const load = (file: string) =>
    import(
      pathToFileURL(join(REPO, "packages/react-native/src/expo-plugin", file))
        .href
    );
  const [params, constants] = await Promise.all([
    load("params.ts"),
    load("constants.ts"),
  ]);
  // SAFETY: The two plugin modules export these names with these shapes.
  return { ...params, ...constants } as ExpoPluginModules;
};

/** The lines between the `inth-cli-snippet:<name>` markers in a native test, dedented. */
const nativeSnippet = (file: string, name: string): string => {
  const lines = read(REPO, file).split("\n");
  const start = lines.findIndex((line) =>
    line.includes(`inth-cli-snippet:${name}:start`)
  );
  const end = lines.findIndex((line) =>
    line.includes(`inth-cli-snippet:${name}:end`)
  );
  expect(start, `${name} markers in ${file}`).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const block = lines.slice(start + 1, end);
  const indent = Math.min(
    ...block.map((line) => /^[\t ]*/u.exec(line)?.[0].length ?? 0)
  );
  return block.map((line) => line.slice(indent)).join("\n");
};

describe("inth mobile setup arguments", () => {
  it("parses the setup flags, including leading shared flags", () => {
    expect(
      parseArguments([
        "--json",
        "mobile",
        "setup",
        "--backend-url",
        "https://a.inth.app",
        "--privacy-policy-url=https://app.example/privacy",
        "--categories",
        "marketing",
        "--overwrite",
        "--dry-run",
        "--non-interactive",
      ])
    ).toMatchObject({
      argument: "setup",
      command: "mobile",
      json: true,
      mobile: {
        backendUrl: "https://a.inth.app",
        categories: "marketing",
        dryRun: true,
        overwrite: true,
        privacyPolicyUrl: "https://app.example/privacy",
      },
      nonInteractive: true,
    });
  });

  it("refuses unknown options, extra words, and modes", () => {
    expect(() => parseArguments(["mobile"])).toThrow(
      "Usage: inth mobile setup"
    );
    expect(() => parseArguments(["mobile", "setup", "hosted"])).toThrow(
      "Usage: inth mobile setup"
    );
    expect(() =>
      parseArguments(["mobile", "setup", "--mode", "offline"])
    ).toThrow('Unknown option "--mode"');
    expect(() =>
      parseArguments(["mobile", "setup", "--backend-url", "--dry-run"])
    ).toThrow("Provide a value for --backend-url.");
    expect(() =>
      parseArguments([
        "mobile",
        "setup",
        "--categories",
        "a",
        "--categories",
        "b",
      ])
    ).toThrow("Use --categories only once.");
    expect(parseArguments(["mobile", "--help"])).toMatchObject({
      command: "mobile",
      help: true,
    });
  });

  it("is documented as needing no sign-in, with both URLs required", () => {
    const [entry, ...rest] = helpCommands("mobile", "setup");
    expect(rest).toEqual([]);
    expect(entry).toMatchObject({ authentication: "none", scopes: [] });
    expect(
      entry?.options
        .filter((option) => option.required)
        .map((option) => option.name)
    ).toEqual(["backend-url", "privacy-policy-url"]);
    expect(
      telemetryCommand(
        parseArguments(["mobile", "setup", "--backend-url", "a.inth.app"])
      )
    ).toBe("mobile setup");
  });
});

describe("detectMobileProject", () => {
  it("tells Expo, bare React Native, native and web projects apart", () => {
    const expo = project({
      "package.json": pkg({ expo: "57.0.0", "react-native": "0.86.0" }),
      "tsconfig.json": "{}",
    });
    const bare = project({ "package.json": pkg({ "react-native": "0.86.0" }) });
    const swift = project({ "App.xcodeproj/project.pbxproj": "" });
    const both = project({ "Package.swift": "", "settings.gradle.kts": "" });
    const web = project({
      "package.json": pkg({ next: "16.0.0", react: "19.0.0" }),
    });

    expect(detectMobileProject(expo)).toMatchObject({
      installed: false,
      kind: "expo",
      typescript: true,
    });
    expect(detectMobileProject(bare)).toMatchObject({
      kind: "react-native",
      typescript: false,
    });
    expect(detectMobileProject(swift)).toMatchObject({
      kind: "native",
      platforms: ["ios"],
      root: swift,
    });
    expect(detectNativePlatforms(both)).toEqual(["ios", "android"]);
    expect(detectMobileProject(web)).toBeUndefined();
    expect(detectNativePlatforms(web)).toEqual([]);
  });

  it("refuses a directory with no mobile app and points websites at inth c15t", () => {
    const web = project({ "package.json": pkg({ next: "16.0.0" }) });

    const error = failure(() =>
      setup(web, ["--backend-url", "https://a.inth.app"])
    );

    expect(error.code).toBe("usage_error");
    expect(error.message).toContain("For a website, run inth c15t.");
  });
});

describe("the Expo plugin entry", () => {
  it("writes the project URL and the categories, which the plugin accepts", async () => {
    const entry = expoPluginEntry({
      backendUrl: "https://a.inth.app",
      categories: ["necessary", "measurement"],
      privacyPolicyUrl: PRIVACY_URL,
    });
    // SAFETY: The entry is a JSON array of the plugin name and its options.
    const parsedEntry = JSON.parse(entry) as [string, PluginProps];
    expect(parsedEntry).toEqual([
      EXPO_PLUGIN,
      {
        consentCategories: ["necessary", "measurement"],
        projectUrl: "https://a.inth.app",
      },
    ]);
    const { resolveParams } = await expoPlugin();
    expect(resolveParams(parsedEntry[1])).toMatchObject({
      dryRun: false,
      projectUrl: "https://a.inth.app",
    });
  });

  it("adds to app.json, keeps everything else as written, and keeps an existing entry", () => {
    const raw =
      '{\n  "expo": {\n    "name": "app",\n    "plugins": [\n      "expo-router"\n    ]\n  },\n  "extra": [1,2]\n}\n';
    const answers = options("https://a.inth.app");

    const merged = mergeExpoAppJson(raw, answers, false);

    expect(appJson(merged).expo.plugins).toEqual([
      "expo-router",
      [
        EXPO_PLUGIN,
        {
          consentCategories: DEFAULT_CATEGORIES,
          projectUrl: "https://a.inth.app",
        },
      ],
    ]);
    expect(merged).toContain(
      '      "expo-router",\n      [\n        "@inth/react-native/expo-plugin",\n        {\n          "projectUrl"'
    );
    expect(merged.endsWith('  "extra": [1,2]\n}\n')).toBe(true);
    expect(mergeExpoAppJson(merged, answers, false)).toBe("");
    const replaced = mergeExpoAppJson(
      merged,
      options("https://b.inth.app"),
      true
    );
    expect(appJson(replaced).expo.plugins).toEqual([
      "expo-router",
      [
        EXPO_PLUGIN,
        {
          consentCategories: DEFAULT_CATEGORIES,
          projectUrl: "https://b.inth.app",
        },
      ],
    ]);
  });

  it.each([
    ["no app.json", ""],
    ["no expo key", '{\n\t"name": "x"\n}\n'],
    ["no plugins", '{"expo":{"name":"x"}}'],
    ["an empty plugins array", '{"expo":{"plugins":[]}}'],
    [
      "a one-line plugins array",
      '{\n\t"expo": {\n\t\t"plugins": ["a", ["b", {}]]\n\t}\n}\n',
    ],
    ["the bare package name", '{"expo":{"plugins":["@inth/react-native"]}}'],
  ])("merges into %s", (_name, raw) => {
    const merged = mergeExpoAppJson(raw, options("https://a.inth.app"), true);
    const { plugins } = appJson(merged).expo;
    expect(plugins.at(-1)).toEqual([
      EXPO_PLUGIN,
      {
        consentCategories: DEFAULT_CATEGORIES,
        projectUrl: "https://a.inth.app",
      },
    ]);
    expect(plugins.filter((plugin) => plugin === "@inth/react-native")).toEqual(
      []
    );
  });

  it.each([
    ["not JSON", "{", "app.json is not a JSON object"],
    ["an array", "[]", "app.json is not a JSON object"],
    ["expo as a string", '{"expo":"x"}', '"expo" value that is not an object'],
    [
      "plugins as an object",
      '{"expo":{"plugins":{}}}',
      '"expo.plugins" value that is not an array',
    ],
  ])("refuses app.json that is %s", (_name, raw, message) => {
    const error = failure(() =>
      mergeExpoAppJson(raw, options("https://a.inth.app"), false)
    );
    expect(error.code).toBe("invalid_config");
    expect(error.message).toContain(message);
  });
});

describe("inth mobile setup in a mobile project", () => {
  it("configures an Expo app: plugin entry, provider file and next steps", () => {
    const root = project({
      "App.tsx": "export default () => null;\n",
      "app.json":
        '{\n\t"expo": {\n\t\t"name": "app",\n\t\t"slug": "app"\n\t}\n}\n',
      "package.json": pkg({ expo: "57.0.0", "react-native": "0.86.0" }),
      "tsconfig.json": "{}",
    });

    const result = setup(root, [
      "--backend-url",
      "https://your-project.inth.app/",
      "--categories",
      "marketing,measurement",
    ]);

    expect(result).toMatchObject({ applied: true, platform: "expo", root });
    expect(appJson(read(root, "app.json")).expo).toEqual({
      name: "app",
      plugins: [
        [
          EXPO_PLUGIN,
          {
            consentCategories: ["necessary", "measurement", "marketing"],
            projectUrl: "https://your-project.inth.app",
          },
        ],
      ],
      slug: "app",
    });
    const provider = read(root, "inth/privacy-app.tsx");
    expect(provider).toContain(
      "<InthProvider privacyPolicyUrl={privacyPolicyUrl}>"
    );
    expect(provider).toContain("void presentPreferences(privacyPolicyUrl);");
    expect(provider).toContain("import type { ReactNode } from 'react';");
    expect(provider).toContain("Generated by `inth mobile setup`.");
    const steps = result.steps.join("\n");
    expect(steps).toContain(
      `<PrivacyApp privacyPolicyUrl="${PRIVACY_URL}">, once, in App.tsx: import { PrivacyApp } from './inth/privacy-app';`
    );
    expect(steps).toContain("npm install /absolute/path/to/");
    expect(mobileSetupMessage(result)).toContain(
      "Wrote app.json\nWrote inth/privacy-app.tsx\n\nNext steps:\n1. Install"
    );
  });

  it("prints the entry for a dynamic app config instead of editing it", () => {
    const root = project({
      "app.config.ts": "export default {};\n",
      "package.json": pkg({ "@inth/react-native": "*", expo: "57.0.0" }),
      "pnpm-lock.yaml": "",
    });

    const result = setup(root, ["--backend-url", "acme.inth.app"]);

    expect(result.files.map((file) => file.path)).toEqual([
      "inth/privacy-app.jsx",
    ]);
    expect(result.steps[0]).toContain(
      'Add this entry to "plugins" in app.config.ts'
    );
    expect(result.steps[0]).toContain('"projectUrl": "https://acme.inth.app"');
    expect(result.steps.join("\n")).not.toContain("tarball");
    expect(read(root, "app.config.ts")).toBe("export default {};\n");
  });

  it("names the app's package manager in the install step", () => {
    const root = project({
      "package.json": JSON.stringify({
        dependencies: { expo: "57.0.0" },
        packageManager: "pnpm@11.0.0",
      }),
    });

    const result = setup(root, ["--backend-url", "a.inth.app", "--dry-run"]);

    expect(result.steps[0]).toContain("pnpm add /absolute/path/to/");
  });

  it("keeps an existing provider file without --overwrite", () => {
    const root = project({
      "inth/privacy-app.jsx": "mine",
      "package.json": pkg({ expo: "57.0.0" }),
    });

    const result = setup(root, ["--backend-url", "https://a.inth.app"]);

    expect(result.skipped).toEqual([
      "inth/privacy-app.jsx exists; pass --overwrite to replace it.",
    ]);
    expect(read(root, "inth/privacy-app.jsx")).toBe("mine");
    expect(
      setup(root, [
        "--backend-url",
        "https://a.inth.app",
        "--overwrite",
      ]).files.map((file) => `${file.action} ${file.path}`)
    ).toEqual(["update app.json", "update inth/privacy-app.jsx"]);
    expect(read(root, "inth/privacy-app.jsx")).toContain("PrivacyApp");
  });

  it("gives bare React Native the native entries to add, and edits no native file", async () => {
    const root = project({
      "ios/App/Info.plist": "<plist/>",
      "package.json": pkg({ "react-native": "0.86.0" }),
      "src/index.js": "",
    });

    const result = setup(root, [
      "--backend-url",
      "https://Acme.inth.app/",
      "--dry-run",
    ]);

    expect(result.applied).toBe(false);
    expect(result.files.map((file) => file.path)).toEqual([
      "src/inth/privacy-app.jsx",
    ]);
    const { ANDROID_META, IOS_PLIST_KEY } = await expoPlugin();
    const steps = result.steps.join("\n");
    expect(steps).toContain(
      `<key>${IOS_PLIST_KEY.projectUrl}</key>\n<string>https://acme.inth.app</string>`
    );
    expect(steps).toContain(
      `<meta-data android:name="${ANDROID_META.backendUrl}" android:value="https://acme.inth.app" />`
    );
    expect(steps).toContain(
      'android:value="necessary, measurement, marketing"'
    );
    expect(read(root, "ios/App/Info.plist")).toBe("<plist/>");
    expect(() => read(root, "src/inth/privacy-app.jsx")).toThrow();
    expect(mobileSetupMessage(result)).toContain(
      "Would write src/inth/privacy-app.jsx"
    );
  });

  it("prints only native keys the Expo plugin also writes", async () => {
    const answers = options("https://a.inth.app");
    const plistKeys = [
      ...infoPlistEntries(answers).matchAll(/<key>(?<key>[^<]+)<\/key>/gu),
    ].map((match) => match.groups?.key);
    const metaNames = [
      ...androidManifestEntries(answers).matchAll(
        /android:name="(?<name>[^"]+)"/gu
      ),
    ].map((match) => match.groups?.name);
    const { ANDROID_META, IOS_PLIST_KEY } = await expoPlugin();
    expect(plistKeys).toEqual([
      IOS_PLIST_KEY.projectUrl,
      IOS_PLIST_KEY.categories,
    ]);
    expect(metaNames).toEqual([
      ANDROID_META.backendUrl,
      ANDROID_META.categories,
    ]);
  });

  it("prints steps for Swift and Android apps and writes nothing", () => {
    const root = project({
      "App.xcodeproj/project.pbxproj": "unchanged",
      "settings.gradle.kts": "unchanged",
    });

    const result = setup(root, ["--backend-url", "https://a.inth.app"]);

    expect(result).toMatchObject({
      files: [],
      platform: "native",
      platforms: ["ios", "android"],
    });
    const steps = result.steps.join("\n");
    expect(steps).toContain("InthCore, InthApple and InthConsentUI");
    expect(steps).toContain(`com.inth:inth-android:${ANDROID_SDK_VERSION}`);
    expect(steps).toContain(
      "consentCategories = listOf(ConsentCategory.NECESSARY, ConsentCategory.MEASUREMENT, ConsentCategory.MARKETING)"
    );
    expect(read(root, "settings.gradle.kts")).toBe("unchanged");
  });

  it("gives the native screens the privacy policy and the chosen categories", () => {
    const root = project({ "Package.swift": "", "build.gradle.kts": "" });

    const steps = setup(root, [
      "--backend-url",
      "https://a.inth.app",
      "--categories",
      "measurement",
    ]).steps.join("\n");

    expect(steps).toContain("consentCategories: [.necessary, .measurement]\n");
    expect(steps).toContain(
      "consentCategories = listOf(ConsentCategory.NECESSARY, ConsentCategory.MEASUREMENT),"
    );
    expect(steps).toContain(
      `.inth(\n        InthAppleConfiguration(\n            backendURL: "https://a.inth.app",`
    );
    expect(steps).toContain(`privacyPolicyURL: URL(string: "${PRIVACY_URL}")!`);
    expect(steps).toContain("ConsentRootViewController(");
    expect(steps).toContain(`InthConsent(privacyPolicyUrl = "${PRIVACY_URL}")`);
    expect(steps).toContain(`attachConsent("${PRIVACY_URL}")`);
    expect(steps).toContain(`imports: ${KOTLIN_INSTALL_IMPORTS.join(", ")}`);
  });

  it("refuses missing or invalid answers before writing anything", () => {
    const root = project({
      "app.json": '{"expo":{}}',
      "package.json": pkg({ expo: "57.0.0" }),
    });

    expect(failure(() => setup(root, [])).message).toContain(
      "Provide --backend-url"
    );
    const noPolicy = failure(() =>
      runMobileSetup(
        parseArguments(["mobile", "setup", "--backend-url", "a.inth.app"])
          .mobile ?? parsed([]),
        root
      )
    );
    expect(noPolicy.code).toBe("usage_error");
    expect(noPolicy.message).toContain("--privacy-policy-url");
    for (const url of [
      "http://localhost:8787/privacy",
      "http://127.0.0.1/privacy",
      "https://user@app.example/privacy",
    ]) {
      const refused = failure(() =>
        setup(root, [
          "--backend-url",
          "https://a.inth.app",
          "--privacy-policy-url",
          url,
        ])
      );
      expect(refused.message, url).toContain(
        "--privacy-policy-url must be an https URL"
      );
    }
    expect(
      failure(() =>
        setup(root, [
          "--backend-url",
          "https://a.inth.app",
          "--categories",
          "ads",
        ])
      ).message
    ).toContain("Unknown categories: ads");
    expect(read(root, "app.json")).toBe('{"expo":{}}');
    expect(() => read(root, "inth/privacy-app.jsx")).toThrow();
  });
});

describe("the provider import", () => {
  it("is relative to the root component", () => {
    expect(providerImport("App.tsx", "inth/privacy-app.tsx")).toBe(
      "./inth/privacy-app"
    );
    expect(providerImport("app/_layout.tsx", "inth/privacy-app.tsx")).toBe(
      "../inth/privacy-app"
    );
    expect(
      providerImport("src/app/_layout.tsx", "src/inth/privacy-app.tsx")
    ).toBe("../inth/privacy-app");
    expect(providerImport("app/_layout.tsx", "src/inth/privacy-app.tsx")).toBe(
      "../src/inth/privacy-app"
    );
  });

  it("names the import an Expo Router layout needs", () => {
    const root = project({
      "app/_layout.tsx": "export default () => null;\n",
      "package.json": pkg({ expo: "57.0.0", "expo-router": "6.0.0" }),
      "tsconfig.json": "{}",
    });
    const nested = project({
      "package.json": pkg({ expo: "57.0.0", "expo-router": "6.0.0" }),
      "src/app/_layout.tsx": "export default () => null;\n",
      "tsconfig.json": "{}",
    });

    const top = setup(root, ["--backend-url", "https://a.inth.app"]);
    const inSrc = setup(nested, ["--backend-url", "https://a.inth.app"]);

    expect(top.files.map((file) => file.path)).toContain(
      "inth/privacy-app.tsx"
    );
    expect(top.steps.join("\n")).toContain(
      "in app/_layout.tsx: import { PrivacyApp } from '../inth/privacy-app';"
    );
    expect(inSrc.files.map((file) => file.path)).toContain(
      "src/inth/privacy-app.tsx"
    );
    expect(inSrc.steps.join("\n")).toContain(
      "in src/app/_layout.tsx: import { PrivacyApp } from '../inth/privacy-app';"
    );
  });
});

describe("the Swift and Kotlin the steps print", () => {
  it("is exactly the code the native tests compile", () => {
    const hosted = options("https://your-project.inth.app");
    expect(swiftConfiguration(hosted)).toBe(
      nativeSnippet(SWIFT_SNIPPETS, "hosted")
    );
    expect(kotlinInstall(hosted)).toBe(
      nativeSnippet(KOTLIN_SNIPPETS, "hosted")
    );
    expect(swiftUIEntry(swiftConfiguration(hosted), PRIVACY_URL)).toBe(
      nativeSnippet(SWIFT_ENTRY_SNIPPETS, "swiftui")
    );
    expect(uiKitEntry(swiftConfiguration(hosted), PRIVACY_URL)).toBe(
      nativeSnippet(SWIFT_ENTRY_SNIPPETS, "uikit")
    );
    expect(SWIFT_PRIVACY_SETTINGS).toBe(
      nativeSnippet(SWIFT_ENTRY_SNIPPETS, "privacy-settings")
    );
    expect(composeEntry(PRIVACY_URL)).toBe(
      nativeSnippet(KOTLIN_ENTRY_SNIPPETS, "compose")
    );
    expect(activityEntry(PRIVACY_URL)).toBe(
      nativeSnippet(KOTLIN_ENTRY_SNIPPETS, "activity")
    );
    expect(KOTLIN_PRIVACY_SETTINGS).toBe(
      nativeSnippet(KOTLIN_ENTRY_SNIPPETS, "privacy-settings")
    );
    const source = read(REPO, KOTLIN_SNIPPETS);
    // The test sits in com.inth.android, so InthAndroid needs no import there.
    for (const entry of KOTLIN_INSTALL_IMPORTS.filter(
      (name) => name !== "com.inth.android.InthAndroid"
    )) {
      expect(source).toContain(`import ${entry}\n`);
    }
  });
});

describe("URLs in the printed Swift and Kotlin", () => {
  it("are escaped as string literals, not pasted raw", () => {
    const root = project({ "Package.swift": "", "build.gradle.kts": "" });

    // $ is valid in a URL and starts a template in Kotlin.
    const steps = setup(root, [
      "--backend-url",
      "https://a.inth.app",
      "--privacy-policy-url",
      "https://app.example/a$b",
    ]).steps.join("\n");

    expect(steps).toContain('backendURL: "https://a.inth.app",');
    expect(steps).toContain('backendUrl = "https://a.inth.app",');
    expect(steps).toContain(
      'privacyPolicyURL: URL(string: "https://app.example/a$b")!'
    );
    expect(steps).toContain(
      'InthConsent(privacyPolicyUrl = "https://app.example/a\\$b")'
    );
    expect(steps).toContain('attachConsent("https://app.example/a\\$b")');
  });

  it("escape a quote and a dollar in a configuration value", () => {
    const answers = options('https://example.com/"x$y');
    expect(swiftConfiguration(answers)).toContain(
      'backendURL: "https://example.com/\\"x$y",'
    );
    expect(kotlinInstall(answers)).toContain(
      'backendUrl = "https://example.com/\\"x\\$y",'
    );
  });

  it("escape backslashes and control characters too", () => {
    expect(swiftString('a\\b"c\n')).toBe('"a\\\\b\\"c\\n"');
    expect(kotlinString('a\\b"c$d\t')).toBe('"a\\\\b\\"c\\$d\\t"');
  });
});

describe("where setup looks for the project", () => {
  it("finds a mobile app from a subdirectory", () => {
    const root = project({
      "package.json": pkg({ expo: "57.0.0" }),
      "src/screens/home.tsx": "",
    });

    const result = setup(join(root, "src/screens"), [
      "--backend-url",
      "https://a.inth.app",
      "--dry-run",
    ]);

    expect(result).toMatchObject({ platform: "expo", root });
    expect(result.files.map((file) => file.path)).toContain(
      "src/inth/privacy-app.jsx"
    );
  });

  it("resolves ios/ inside a React Native app to the app, not a Swift project", () => {
    const root = project({
      "ios/App.xcodeproj/project.pbxproj": "",
      "package.json": pkg({ "react-native": "0.86.0" }),
    });

    expect(detectMobileProject(join(root, "ios"))).toMatchObject({
      kind: "react-native",
      root,
    });
  });

  it("finds a Swift or Gradle project from a directory inside it", () => {
    const parent = project({
      "MyApp/Package.swift": "",
      "MyApp/Sources/Feature/view.swift": "",
      "package.json": pkg({ next: "16.0.0" }),
    });
    const gradle = project({
      "app/build.gradle.kts": "",
      "app/src/main/AndroidManifest.xml": "",
      "settings.gradle.kts": "",
    });

    expect(
      detectMobileProject(join(parent, "MyApp/Sources/Feature"))
    ).toMatchObject({
      kind: "native",
      platforms: ["ios"],
      root: join(parent, "MyApp"),
    });
    // The Gradle project, not the app module that also has a build file.
    expect(detectMobileProject(join(gradle, "app/src/main"))).toMatchObject({
      platforms: ["android"],
      root: gradle,
    });
  });

  it("keeps a Swift app outside any package as its own root", () => {
    const parent = project({
      "MyApp/MyApp.xcodeproj/project.pbxproj": "",
      "package.json": pkg({ next: "16.0.0" }),
    });

    expect(detectMobileProject(join(parent, "MyApp"))).toMatchObject({
      root: join(parent, "MyApp"),
    });
  });
});

describe("backend URLs", () => {
  interface StrictCases {
    strict: {
      accept: { input: string; normalized: string }[];
      reject: { input: string; reason: string }[];
    };
  }
  // SAFETY: The shared fixture's shape is fixed by Swift, Kotlin and TypeScript tests.
  const fixture = JSON.parse(
    read(REPO, "packages/native-protocol/project-url/cases.json")
  ) as StrictCases;

  it("are normalised exactly as the Expo plugin normalises them", async () => {
    const { resolveParams } = await expoPlugin();
    const root = project({ "Package.swift": "" });
    for (const { input, normalized } of fixture.strict.accept) {
      expect(
        setup(root, ["--backend-url", input]).options.backendUrl,
        input
      ).toBe(normalized);
      expect(resolveParams({ projectUrl: input }).projectUrl, input).toBe(
        normalized
      );
    }
  });

  it("writes acme.inth.app as https://acme.inth.app", () => {
    const root = project({
      "app.json": '{"expo":{}}',
      "package.json": pkg({ expo: "57.0.0" }),
    });

    const result = setup(root, ["--backend-url", " Acme.inth.app/ "]);

    expect(result.options.backendUrl).toBe("https://acme.inth.app");
    const [plugin] = appJson(read(root, "app.json")).expo.plugins;
    expect(Array.isArray(plugin) ? plugin[1].projectUrl : "").toBe(
      "https://acme.inth.app"
    );
  });

  it("refuses a URL that is not an Inth project before writing app.json", () => {
    const root = project({
      "app.json": '{"expo":{}}',
      "package.json": pkg({ expo: "57.0.0" }),
    });

    for (const [url, detail] of [
      [
        "https://consent.example.com",
        "the host must be a project host under inth.app",
      ],
      ["http://localhost:8787", "the scheme must be https"],
      ["https://acme.inth.app/api/c15t", "it must not have a path"],
      ["https://u:p@acme.inth.app", "it must not carry a username or password"],
      ["https://acme.inth.app?x=1", "it must not have a query or a fragment"],
    ] as const) {
      const error = failure(() => setup(root, ["--backend-url", url]));
      expect(error.code, url).toBe("usage_error");
      expect(error.message, url).toBe(
        `--backend-url must be the project URL from your Inth dashboard, such as https://your-project.inth.app. Got "${url}": ${detail}.`
      );
    }
    expect(read(root, "app.json")).toBe('{"expo":{}}');
  });

  it("refuses the same URLs on every mobile platform", () => {
    const bare = project({ "package.json": pkg({ "react-native": "0.86.0" }) });
    const native = project({ "Package.swift": "", "build.gradle": "" });

    for (const root of [bare, native]) {
      expect(
        failure(() =>
          setup(root, ["--backend-url", "https://consent.example.com"])
        ).message
      ).toContain("--backend-url must be");
    }
  });
});

/**
 * The React Native presenter's own table, plus loopback http, which the
 * backend URL rule allows and the privacy policy rule does not.
 */
const PRIVACY_URL_CASES: [string, boolean][] = [
  ...[
    "https://example.com",
    "https://example.com/",
    "https://example.com/privacy",
    "https://EXAMPLE.com/Privacy",
    "https://sub.example.co.uk/legal/privacy.html",
    "https://example.com:8443/privacy",
    "https://example.com:1/p",
    "https://example.com:65535/p",
    "https://example.com/privacy?lang=en&v=2#cookies",
    "https://example.com/a%20b",
    "https://example.com/~user/(policy);v=1,2*!$'@:",
    "https://xn--bcher-kva.example/privacy",
    "https://192.168.0.1/privacy",
    "https://localhost",
  ].map((value): [string, boolean] => [value, true]),
  ...[
    "http://example.com/privacy",
    "http://localhost:8787/privacy",
    "http://127.0.0.1/privacy",
    "HTTPS://example.com",
    "example.com/privacy",
    "https:example.com",
    "",
    "https://",
    "https:///privacy",
    "https://example.com:bad",
    "https://example.com:/privacy",
    "https://example.com:0",
    "https://example.com:65536",
    "https://[",
    "https://[::1]/privacy",
    "https://bücher.example/privacy",
    "https://user@example.com/privacy",
    "https://-bad.example/privacy",
    "https://example..com/privacy",
    "https://example.com./privacy",
    " https://example.com",
    "https://example.com/privacy ",
    "https://example.com/privacy\n",
    "https://example.com/privacy policy",
    'https://example.com/"privacy"',
    "https://example.com/%zz",
    "https://example.com/a#b#c",
    "https://example.com\\privacy",
    "mailto:privacy@example.com",
    `https://${"a".repeat(60)}.${"b".repeat(60)}.${"c".repeat(60)}.${"d".repeat(60)}.${"e".repeat(20)}/p`,
  ].map((value): [string, boolean] => [value, false]),
];

interface Presenter {
  isPrivacyPolicyUrl: (value: string) => boolean;
}

describe("privacy policy URLs", () => {
  it.each(PRIVACY_URL_CASES)("%j: the CLI accepts it: %s", (value, ok) => {
    expect(isPrivacyPolicyUrl(value)).toBe(ok);
  });

  it("are accepted and refused exactly as the React Native presenter does", async () => {
    // SAFETY: The presenter module exports isPrivacyPolicyUrl(value: string): boolean.
    const presenter = (await import(
      pathToFileURL(
        join(REPO, "packages/react-native/src/provider/privacy-policy-url.ts")
      ).href
    )) as Presenter;
    for (const [value] of PRIVACY_URL_CASES) {
      expect(isPrivacyPolicyUrl(value), value).toBe(
        presenter.isPrivacyPolicyUrl(value)
      );
    }
  });
});

describe("the doc paths the steps print", () => {
  it("name pages that exist in the SDK docs", () => {
    const steps = [
      ...setup(project({ "package.json": pkg({ expo: "57.0.0" }) }), [
        "--backend-url",
        "https://a.inth.app",
      ]).steps,
      ...setup(project({ "package.json": pkg({ "react-native": "0.86.0" }) }), [
        "--backend-url",
        "https://a.inth.app",
        "--dry-run",
      ]).steps,
      ...setup(project({ "Package.swift": "", "build.gradle": "" }), [
        "--backend-url",
        "https://a.inth.app",
      ]).steps,
    ].join("\n");

    const bundled = [
      ...steps.matchAll(
        /node_modules\/@inth\/react-native\/docs\/(?<page>[\w/-]+)\.md/gu
      ),
    ].map((match) => match.groups?.page ?? "");
    const source = [
      ...steps.matchAll(/packages\/sdk\/docs\/(?<page>[\w/-]+)\.mdx/gu),
    ].map((match) => match.groups?.page ?? "");
    expect(bundled.length).toBeGreaterThan(0);
    expect(source.length).toBeGreaterThan(0);
    for (const page of [...bundled, ...source]) {
      expect(
        read(REPO, `packages/sdk/docs/${page}.mdx`).length,
        page
      ).toBeGreaterThan(0);
    }
  });
});

describe("the printed Android version", () => {
  it("matches the native release the steps point at", () => {
    expect(read(REPO, ANDROID_PROPERTIES)).toContain(
      `inth.native.version=${ANDROID_SDK_VERSION}\n`
    );
  });
});
