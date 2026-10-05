import { describe, expect, it } from "vitest";

import { parseArguments } from "../src/arguments.ts";
import {
  c15tEnabled,
  defaultProjectName,
  detectFramework,
  detectPackageManager,
  hostedProject,
} from "../src/c15t.ts";

describe("inth c15t arguments", () => {
  it("stays an unknown command without the experimental flag", () => {
    expect(() => parseArguments(["c15t"])).toThrow("Unknown command");
    expect(c15tEnabled("")).toBe(false);
    expect(c15tEnabled("0")).toBe(false);
    expect(c15tEnabled("1")).toBe(true);
  });

  it("parses an action, its options, and shared flags after c15t", () => {
    const result = parseArguments(
      [
        "c15t",
        "scaffold",
        "--project=acme/Website",
        "--framework",
        "next-app",
        "--organization",
        "org_acme",
        "--yes",
        "--skip-install",
        "--json",
      ],
      true
    );
    expect(result).toMatchObject({
      command: "c15t",
      json: true,
      organization: "org_acme",
    });
    expect(result.c15t).toEqual({
      action: "scaffold",
      dryRun: false,
      framework: "next-app",
      project: "acme/Website",
      resume: false,
      skipInstall: true,
      yes: true,
    });
  });

  it.each([
    [
      ["--project", "a", "--name", "b"],
      "Use --project for an existing project",
    ],
    [["--region", "eu"], "Use --region with --name."],
    [["prompt", "--dry-run"], "apply to scaffold"],
    [["--framework", "angular"], "--framework must be one of"],
    [["--project", "a", "--project", "b"], "Use --project only once."],
    [["--project"], "Provide a value for --project."],
    [["--limit", "5"], 'Unknown option "--limit"'],
    [["scaffold", "prompt"], "Choose one of scaffold, prompt"],
    [["--codex", "--claude"], "Choose one of scaffold, prompt"],
    [["--codex", "scaffold"], "Choose one of scaffold, prompt"],
    [["--codex", "--yes"], "apply to scaffold"],
    [["prompt", "--resume"], "apply to scaffold"],
    [
      ["scaffold", "--resume", "--dry-run"],
      "cannot be combined with --dry-run",
    ],
    [["--codex", "--json"], "Agent sessions use this terminal"],
    [["website"], "Usage: inth c15t"],
  ])("rejects %j", (args, message) => {
    expect(() => parseArguments(["c15t", ...args], true)).toThrow(message);
  });
});

describe("inth c15t agents", () => {
  it.each([
    ["--codex", "codex"],
    ["--claude", "claude"],
    ["--cursor", "cursor"],
    ["--grok", "grok"],
    ["--fx", "fx"],
  ])("%s starts the agent route", (flag, agent) => {
    expect(parseArguments(["c15t", flag], true).c15t).toMatchObject({
      action: "agent",
      agent,
    });
  });
});

describe("inth c15t app detection", () => {
  it.each([
    [["next", "react"], false, "next-app"],
    [["next", "react"], true, "next-pages"],
    [["@tanstack/react-start", "react"], false, "tanstack-start"],
    [["nuxt", "vue"], false, "nuxt"],
    [["@sveltejs/kit", "svelte"], false, "sveltekit"],
    [["svelte"], false, "svelte"],
    [["astro", "react"], false, "astro"],
    [["solid-js"], false, "solid"],
    [["vue"], false, "vue"],
    [["react", "react-dom"], false, "react"],
    [["express"], false, undefined],
  ])("detects %j as %s", (dependencies, pagesRouter, framework) => {
    expect(detectFramework(dependencies, pagesRouter)).toBe(framework);
  });

  it("prefers the declared package manager, then the lockfile", () => {
    expect(detectPackageManager("yarn@4.5.0", ["pnpm-lock.yaml"])).toBe("yarn");
    expect(detectPackageManager(undefined, ["bun.lock"])).toBe("bun");
    expect(detectPackageManager("deno@2", ["pnpm-lock.yaml"])).toBe("pnpm");
    expect(detectPackageManager(undefined, [])).toBe("npm");
  });

  it("names a new project after the unscoped package or directory", () => {
    expect(defaultProjectName("@acme/website", "web")).toBe("website");
    expect(defaultProjectName(undefined, "web")).toBe("web");
  });

  it("marks projects without a consent backend as pending", () => {
    expect(
      hostedProject({
        consent: { backendUrl: "https://acme.c15t.dev" },
        id: "prj_1",
        name: "Website",
        organizationSlug: "acme",
      })
    ).toEqual({
      id: "prj_1",
      name: "Website",
      organizationSlug: "acme",
      status: "active",
      url: "https://acme.c15t.dev",
    });
    expect(
      hostedProject({ consent: null, id: "prj_2", name: "New" })
    ).toMatchObject({ status: "pending", url: "" });
  });
});
