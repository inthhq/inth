import { describe, expect, test } from "vitest";

import {
  automaticUpdate,
  formatUpdateNotice,
  installMethod,
  latestFromDistTags,
  newerVersion,
  projectDirectory,
  registryOrigin,
  updateCheckDue,
  updateCommand,
  updateNoticeDue,
  updateNoticeMethod,
  UPDATE_CHECK_INTERVAL_MS,
} from "../src/update.ts";

describe("installMethod", () => {
  // Real paths from global and project installations of @inth/cli.
  test.each([
    ["/Users/a/.local/bin/inth", "standalone"],
    ["/opt/tools/inth", "standalone"],
    [
      "/opt/homebrew/lib/node_modules/@inth/cli/node_modules/@inth/cli-darwin-arm64/bin/inth",
      "npm",
    ],
    [
      "/home/a/.nvm/versions/node/v24.19.0/lib/node_modules/@inth/cli/node_modules/@inth/cli-linux-x64/bin/inth",
      "npm",
    ],
    [
      String.raw`C:\Users\a\AppData\Roaming\npm\node_modules\@inth\cli\node_modules\@inth\cli-win32-x64\bin\inth.exe`,
      "npm",
    ],
    [
      "/Users/a/Library/pnpm/global/5/.pnpm/@inth+cli-darwin-arm64@0.0.4/node_modules/@inth/cli-darwin-arm64/bin/inth",
      "pnpm",
    ],
    [
      "/Users/a/Library/pnpm/global/v11/6420-18d9c950f9c87750-0/node_modules/.pnpm/@inth+cli-darwin-arm64@0.0.4/node_modules/@inth/cli-darwin-arm64/bin/inth",
      "pnpm",
    ],
    [
      "/Users/a/Library/pnpm/store/v11/links/@inth/cli-darwin-arm64/0.0.4/820e125f/node_modules/@inth/cli-darwin-arm64/bin/inth",
      "pnpm-virtual-store",
    ],
    [
      "/work/site/node_modules/.pnpm-store/v10/links/@inth/cli-linux-x64/0.0.4/820e125f/node_modules/@inth/cli-linux-x64/bin/inth",
      "pnpm-virtual-store",
    ],
    [
      "/Users/a/.bun/install/global/node_modules/@inth/cli-darwin-arm64/bin/inth",
      "bun",
    ],
    [
      "/home/a/.config/yarn/global/node_modules/@inth/cli-linux-x64/bin/inth",
      "yarn",
    ],
    [
      String.raw`C:\Users\a\AppData\Local\Yarn\Data\global\node_modules\@inth\cli-win32-x64\bin\inth.exe`,
      "yarn",
    ],
    [
      "/Users/a/.npm/_npx/96e3974120fbfdc1/node_modules/@inth/cli-darwin-arm64/bin/inth",
      "temporary",
    ],
    [
      "/Users/a/Library/Caches/pnpm/dlx/f096fd1f/mummhdzw-2420/node_modules/.pacquet/@inth+cli-darwin-arm64@0.0.4/node_modules/@inth/cli-darwin-arm64/bin/inth",
      "temporary",
    ],
    [
      "/var/folders/3y/T/bunx-501-@inth/cli@latest/node_modules/@inth/cli-darwin-arm64/bin/inth",
      "temporary",
    ],
    ["/work/site/node_modules/@inth/cli-darwin-arm64/bin/inth", "project"],
    [
      "/work/site/node_modules/.pnpm/@inth+cli-darwin-arm64@0.0.4/node_modules/@inth/cli-darwin-arm64/bin/inth",
      "project",
    ],
  ])("classifies %s as %s", (executable, method) => {
    expect(installMethod(executable, true, () => false)).toBe(method);
  });

  test("keeps nested npm project installs project-local", () => {
    const nested =
      "/work/site/node_modules/@inth/cli/node_modules/@inth/cli-linux-x64/bin/inth";
    const projects = new Set(["/work/site"]);
    expect(
      installMethod(nested, true, (directory) => projects.has(directory))
    ).toBe("project");
    // A global prefix holds node_modules without a package.json beside it.
    expect(
      installMethod(
        "/usr/local/lib/node_modules/@inth/cli/node_modules/@inth/cli-linux-x64/bin/inth",
        true,
        (directory) => projects.has(directory)
      )
    ).toBe("npm");
  });

  test("treats every development build as development", () => {
    expect(installMethod("/Users/a/.local/bin/inth", false, () => false)).toBe(
      "development"
    );
  });

  test("names the project that owns a dependency installation", () => {
    expect(
      projectDirectory("/work/site/node_modules/@inth/cli-linux-x64/bin/inth")
    ).toBe("/work/site");
  });
});

describe("update commands", () => {
  test.each([
    ["npm", "npm install -g @inth/cli@latest"],
    ["pnpm", "pnpm add -g @inth/cli@latest"],
    ["bun", "bun add -g @inth/cli@latest"],
    ["yarn", "yarn global add @inth/cli@latest"],
  ] as const)("updates a global %s installation", (method, command) => {
    expect(automaticUpdate(method, "darwin")).toBe(true);
    expect(updateCommand(method, "darwin", "/unused")).toBe(command);
  });

  test("reruns the install script in the executable's directory", () => {
    expect(updateCommand("standalone", "linux", "/home/a/my tools/inth")).toBe(
      "curl -fsSL https://inth.com/cli/install.sh | INTH_INSTALL_DIR='/home/a/my tools' sh"
    );
  });

  test("leaves Windows, project, and temporary installations to the user", () => {
    expect(automaticUpdate("npm", "win32")).toBe(false);
    expect(updateCommand("standalone", "win32", "C:/inth.exe")).toBe(
      "npm install -g @inth/cli@latest"
    );
    expect(automaticUpdate("project", "linux")).toBe(false);
    expect(updateCommand("project", "linux", "/work/site")).toBe("");
    expect(automaticUpdate("temporary", "linux")).toBe(false);
    // Global installations and project dependencies share this location.
    expect(automaticUpdate("pnpm-virtual-store", "linux")).toBe(false);
    expect(updateCommand("pnpm-virtual-store", "linux", "/unused")).toBe("");
  });

  test("limits the launch notice to global installations", () => {
    expect(updateNoticeMethod("standalone")).toBe(true);
    expect(updateNoticeMethod("pnpm")).toBe(true);
    expect(updateNoticeMethod("project")).toBe(false);
    expect(updateNoticeMethod("temporary")).toBe(false);
    expect(updateNoticeMethod("pnpm-virtual-store")).toBe(false);
    expect(updateNoticeMethod("development")).toBe(false);
  });
});

describe("versions", () => {
  test.each([
    ["0.0.5", "0.0.4", true],
    ["0.1.0", "0.0.9", true],
    ["1.0.0", "0.99.99", true],
    ["0.0.10", "0.0.9", true],
    ["0.0.4", "0.0.4", false],
    ["0.0.3", "0.0.4", false],
    ["0.0.5", "0.0.5-beta.1", true],
    ["0.0.5-beta.1", "0.0.5", false],
    ["latest", "0.0.4", false],
    ["0.0.5", "dev", false],
  ])("treats %s as newer than %s: %s", (candidate, current, expected) => {
    expect(newerVersion(candidate, current)).toBe(expected);
  });

  test("reads the latest dist-tag and rejects other values", () => {
    expect(latestFromDistTags('{"latest":"0.0.5","next":"0.1.0-rc.1"}')).toBe(
      "0.0.5"
    );
    expect(latestFromDistTags('{"latest":"$(reboot)"}')).toBe("");
    expect(latestFromDistTags("not json")).toBe("");
  });

  test("accepts http and https registry mirrors only", () => {
    expect(registryOrigin()).toBe("https://registry.npmjs.org");
    expect(registryOrigin("https://npm.example.com/repo/")).toBe(
      "https://npm.example.com/repo"
    );
    expect(registryOrigin("file:///etc")).toBe("https://registry.npmjs.org");
  });
});

describe("update schedule", () => {
  const day = UPDATE_CHECK_INTERVAL_MS;

  test("checks at most once a day, and again after the clock moves backwards", () => {
    const state = { checkedAt: 10 * day, latest: "", notifiedAt: 0 };
    expect(updateCheckDue(state, 10 * day + day - 1)).toBe(false);
    expect(updateCheckDue(state, 11 * day)).toBe(true);
    expect(updateCheckDue(state, 9 * day)).toBe(true);
  });

  test("shows a notice once a day while a newer release exists", () => {
    const state = { checkedAt: 0, latest: "0.0.5", notifiedAt: 10 * day };
    expect(updateNoticeDue(state, "0.0.4", 10 * day + 1)).toBe(false);
    expect(updateNoticeDue(state, "0.0.4", 11 * day)).toBe(true);
    expect(updateNoticeDue(state, "0.0.5", 11 * day)).toBe(false);
  });

  test("formats the notice with the command to run", () => {
    expect(formatUpdateNotice("0.0.4", "0.0.5", "inth update")).toBe(
      "A new version of inth is available: 0.0.4 -> 0.0.5.\nRun `inth update` to update."
    );
  });
});
