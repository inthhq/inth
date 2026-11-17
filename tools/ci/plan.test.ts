import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { createPlan, fullPlan, readWorkspaces } from "./plan.ts";

// The real workspace graph, so a moved or renamed package fails here.
const workspaces = readWorkspaces(
  fileURLToPath(new URL("../../", import.meta.url))
);

const selected = (files: string[]) => {
  const plan = createPlan(files, workspaces);
  return {
    android: plan.android,
    cli: plan.cli,
    full: plan.full,
    reactNative: plan.reactNative,
    sdk: plan.sdk,
    sdkTests: plan.sdkPackageTests.length + plan.sdkWorkspaceTests.length > 0,
    swift: plan.swift,
  };
};

const none = {
  android: false,
  cli: false,
  full: false,
  reactNative: false,
  sdk: false,
  sdkTests: false,
  swift: false,
};

describe("routing", () => {
  test("a CLI change runs the CLI jobs only", () => {
    expect(selected(["packages/cli/src/index.ts"])).toEqual({
      ...none,
      cli: true,
    });
    expect(selected(["npm/cli-linux-x64/package.json"])).toEqual({
      ...none,
      cli: true,
    });
    expect(selected(["docs/cli/install.mdx"])).toEqual({ ...none, cli: true });
  });

  test("a web SDK change runs the SDK jobs and not mobile", () => {
    const plan = createPlan(["packages/sdk/core/src/index.ts"], workspaces);
    expect(selected(["packages/sdk/core/src/index.ts"])).toEqual({
      ...none,
      sdk: true,
      sdkTests: true,
    });
    // Dependents of core run, and the change is still not a mobile one.
    expect(plan.sdkPackageTests).toContain("packages/sdk/react");
    expect(plan.sdkPackageTests).toContain("packages/sdk/nextjs");
    expect(plan.sdkTypes).toContain("examples/nextjs");
    expect(plan.mobileReached).toContain("@c15t/react-native");
  });

  test("a leaf SDK change does not select unrelated packages", () => {
    const plan = createPlan(["packages/sdk/vue/src/index.ts"], workspaces);
    expect(plan.sdkPackageTests).toContain("packages/sdk/vue");
    expect(plan.sdkPackageTests).not.toContain("packages/sdk/react");
    expect(plan.sdkPackageTests).not.toContain("packages/sdk/core");
  });

  test("SDK docs run the lint job without package tests", () => {
    expect(selected(["packages/sdk/docs/frameworks/react/index.mdx"])).toEqual({
      ...none,
      sdk: true,
    });
    expect(selected(["packages/sdk/react/README.md"])).toEqual({
      ...none,
      sdk: true,
    });
  });

  test("native sources run the toolchain they need", () => {
    expect(selected(["packages/swift/Sources/C15tCore/Kernel.swift"])).toEqual({
      ...none,
      sdk: true,
      swift: true,
    });
    expect(selected(["Package.swift"])).toEqual({
      ...none,
      sdk: true,
      swift: true,
    });
    expect(
      selected(["packages/android/c15t-core/src/main/kotlin/Kernel.kt"])
    ).toEqual({ ...none, android: true, sdk: true });
  });

  test("React Native changes run the React Native job", () => {
    expect(selected(["packages/react-native/src/index.ts"])).toEqual({
      ...none,
      reactNative: true,
      sdk: true,
    });
    expect(
      selected(["packages/react-native/ios/C15tReactNative/Bridge/Pump.swift"])
    ).toEqual({ ...none, reactNative: true, sdk: true, swift: true });
    expect(
      selected(["packages/react-native/android/c15t-react-native/build.gradle"])
    ).toEqual({ ...none, android: true, reactNative: true, sdk: true });
  });

  test("React Native Codegen specs run both native builds", () => {
    expect(selected(["packages/react-native/src/specs/NativeC15t.ts"])).toEqual(
      { ...none, android: true, reactNative: true, sdk: true, swift: true }
    );
  });

  test("the shared protocol runs web and mobile", () => {
    expect(selected(["packages/native-protocol/index.json"])).toEqual({
      ...none,
      android: true,
      reactNative: true,
      sdk: true,
      sdkTests: true,
      swift: true,
    });
  });

  test("root config and unknown files run everything", () => {
    for (const file of [
      "pnpm-lock.yaml",
      "turbo.json",
      "pnpm-workspace.yaml",
      "package.json",
      ".github/workflows/ci.yml",
      ".github/actions/setup-sdk/action.yml",
      "tools/ci/plan.ts",
      "something-new.ts",
    ]) {
      expect(selected([file]), file).toEqual({
        android: true,
        cli: true,
        full: true,
        reactNative: true,
        sdk: true,
        sdkTests: true,
        swift: true,
      });
    }
  });

  test("mixed changes select the union", () => {
    expect(
      selected(["packages/cli/src/index.ts", "packages/sdk/vue/src/index.ts"])
    ).toEqual({ ...none, cli: true, sdk: true, sdkTests: true });
  });
});

describe("full plans", () => {
  test("a CLI release selects the CLI only", () => {
    const plan = fullPlan(workspaces, ["cli"]);
    expect(plan).toMatchObject({
      android: false,
      cli: true,
      reactNative: false,
      sdk: false,
      sdkPackageTests: [],
      sdkTypes: [],
      swift: false,
    });
  });

  test("a full run covers every SDK package and no CLI or mobile workspace", () => {
    const plan = fullPlan(workspaces);
    expect(plan.sdkPackages).toContain("packages/sdk/core");
    expect(plan.sdkPackageTests).toContain("packages/sdk/react");
    expect(plan.sdkWorkspaceTests).not.toContain(
      "internals/fixtures/acceptance"
    );
    for (const list of [plan.sdkTypes, plan.sdkWorkspaceTests]) {
      expect(list).not.toContain("packages/react-native");
      expect(list).not.toContain("packages/cli");
      expect(list).not.toContain("benchmarks/mobile");
    }
  });
});
