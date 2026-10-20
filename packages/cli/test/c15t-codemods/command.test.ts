import { mkdir, readFile } from "node:fs/promises";
// eslint-disable-next-line unicorn/import-style -- Matches the native sources.
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { parseArguments } from "../../src/arguments.ts";
import { helpCommands } from "../../src/help.ts";
import { runCodemods } from "../../src/native/c15t-codemods/command.ts";
import { telemetryCommand } from "../../src/telemetry.ts";
import { cleanupProjects, createProject } from "./helpers.ts";

const V2_APP = {
  "app/layout.tsx":
    'import { ConsentManagerProvider } from "@c15t/nextjs";\nexport const Layout = () => <ConsentManagerProvider options={{ mode: "c15t", backendURL: "https://x.c15t.dev" }} />;\n',
  "package.json": JSON.stringify({
    dependencies: { "@c15t/nextjs": "2.0.0" },
    name: "app",
  }),
};

describe("inth c15t codemods arguments", () => {
  it("routes codemods away from the project-backed c15t setup", () => {
    expect(
      parseArguments([
        "--json",
        "c15t",
        "codemods",
        "packages-to-c15t",
        "--dry-run",
        "--non-interactive",
      ])
    ).toMatchObject({
      argument: "codemods",
      c15tCodemods: { dryRun: true, list: false, names: ["packages-to-c15t"] },
      command: "c15t",
      json: true,
      nonInteractive: true,
    });
    expect(parseArguments(["c15t", "codemods"]).c15t).toBeUndefined();
  });

  it("reads codemods as a project name when it follows --project", () => {
    expect(
      parseArguments(["c15t", "--project", "codemods", "prompt"])
    ).toMatchObject({ c15t: { action: "prompt", project: "codemods" } });
  });

  it("rejects options codemods does not take", () => {
    expect(() =>
      parseArguments(["c15t", "codemods", "--project", "Website"])
    ).toThrow('Unknown option "--project"');
    expect(() =>
      parseArguments(["c15t", "codemods", "--list", "packages-to-c15t"])
    ).toThrow("--list takes no codemod names");
  });

  it("is documented as needing no sign-in", () => {
    const [codemods, ...rest] = helpCommands("c15t", "codemods").filter(
      (entry) => entry.action === "codemods"
    );
    expect(rest).toEqual([]);
    expect(codemods).toMatchObject({ authentication: "none", scopes: [] });
    expect(helpCommands("c15t")[0]?.action).toBe("");
    expect(
      telemetryCommand(parseArguments(["c15t", "codemods", "--list"]))
    ).toBe("c15t codemods");
    expect(telemetryCommand(parseArguments(["c15t", "prompt"]))).toBe("c15t");
  });
});

// Silences progress lines and returns the stderr spy.
const quiet = () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  return vi.spyOn(console, "error").mockImplementation(() => {});
};

describe("runCodemods", { timeout: 20_000 }, () => {
  afterEach(cleanupProjects);
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("finds the app from a subdirectory and lists the codemods", async () => {
    quiet();
    const root = await createProject(V2_APP);
    await mkdir(join(root, "app", "nested"));
    const listed = await runCodemods(
      { dryRun: false, list: true, names: [] },
      join(root, "app", "nested"),
      true
    );
    expect(listed).toMatchObject({
      declaredVersion: "2.0.0",
      kind: "codemods",
      targetVersion: "3.0.0",
    });
    expect("codemods" in listed && listed.codemods[0]).toMatchObject({
      applicable: true,
      id: "packages-to-c15t",
    });
  });

  it("runs named codemods in list order and writes only without --dry-run", async () => {
    const stderr = quiet();
    // packages-to-c15t moves imports only once c15t 3 is a dependency.
    const root = await createProject({
      ...V2_APP,
      "package.json": JSON.stringify({
        dependencies: { "@c15t/nextjs": "2.0.0", c15t: "3.1.0" },
        name: "app",
      }),
    });
    const layout = join(root, "app", "layout.tsx");
    const dry = await runCodemods(
      {
        dryRun: true,
        list: false,
        names: ["consent-provider-options", "packages-to-c15t"],
      },
      root,
      true
    );
    expect(
      "results" in dry &&
        dry.results.map((entry) => [entry.id, entry.result.changedFiles.length])
    ).toEqual([
      ["packages-to-c15t", 1],
      ["consent-provider-options", 1],
    ]);
    expect(await readFile(layout, "utf-8")).toBe(V2_APP["app/layout.tsx"]);
    // JSON mode keeps progress off stdout.
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining("Dry run: updated 1 file(s)")
    );

    await runCodemods(
      { dryRun: false, list: false, names: ["packages-to-c15t"] },
      root,
      true
    );
    expect(await readFile(layout, "utf-8")).toContain('from "c15t/next"');
  });

  it("warns about files it cannot parse and migrates the rest", async () => {
    const stderr = quiet();
    const root = await createProject({
      ...V2_APP,
      "fixtures/conflict.ts":
        "<<<<<<< HEAD\nexport const a = 1;\n=======\nexport const a = 2;\n>>>>>>> main\n",
      "package.json": JSON.stringify({
        dependencies: { "@c15t/nextjs": "2.0.0", c15t: "3.1.0" },
        name: "app",
      }),
    });
    const ran = await runCodemods(
      { dryRun: false, list: false, names: ["packages-to-c15t"] },
      root,
      true
    );
    const [entry] = "results" in ran ? ran.results : [];
    expect(entry?.result.errors).toEqual([]);
    expect(entry?.result.warnings).toEqual([
      {
        filePath: join(root, "fixtures", "conflict.ts"),
        message: expect.stringContaining("could not parse"),
      },
    ]);
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining("conflict.ts: ")
    );
    expect(await readFile(join(root, "app", "layout.tsx"), "utf-8")).toContain(
      'from "c15t/next"'
    );
  });

  it("names unknown codemods and asks for at least one", async () => {
    quiet();
    const root = await createProject(V2_APP);
    await expect(
      runCodemods({ dryRun: true, list: false, names: ["nope"] }, root, true)
    ).rejects.toMatchObject({ code: "usage_error" });
    await expect(
      runCodemods({ dryRun: true, list: false, names: [] }, root, true)
    ).rejects.toThrow("Name one or more codemods");
  });
});
