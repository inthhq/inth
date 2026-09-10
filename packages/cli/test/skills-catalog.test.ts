/* eslint-disable require-await -- Scripted selections implement the asynchronous terminal UI contract. */
import { describe, expect, it } from "vitest";

import { parseArguments } from "../src/arguments.ts";
import { CliError } from "../src/cli-error.ts";
import {
  INTH_SKILLS,
  selectInthSkill,
  skillsCatalogList,
  skillsNeedsSelection,
} from "../src/skills-catalog.ts";

describe("Inth skills catalog", () => {
  it("offers the picker even with one skill, then forwards that selection", async () => {
    const options = parseArguments([
      "skills",
      "--global",
      "--agent",
      "claude-code",
    ]);
    let prompts = 0;
    await selectInthSkill(options, {
      interactive: true,
      select: async (choices) => {
        prompts += 1;
        expect(choices).toHaveLength(INTH_SKILLS.length);
        expect(choices[0]?.name).toContain("Consent management");
        return "c15t";
      },
    });
    expect(prompts).toBe(1);
    expect(options.argument).toBe("c15t/skills");
    expect(options.skillsArguments).toEqual([
      "--skill",
      "c15t",
      "--global",
      "--agent",
      "claude-code",
    ]);
  });
  it.each([
    ["skills", "c15t/skills"],
    ["skills", "owner/repo"],
    ["skills", "--skill", "c15t"],
    ["skills", "--skill=c15t"],
    ["skills", "-s", "c15t"],
    ["skills", "--yes"],
    ["skills", "--all"],
    ["skills", "--list"],
  ])(
    "keeps explicit installations and listing out of the picker: %j",
    (...args) => {
      expect(skillsNeedsSelection(parseArguments(args))).toBe(false);
    }
  );
  it("lists the bundled catalog without invoking the installer", () => {
    const options = parseArguments(["skills", "--list", "--json"]);
    expect(options.json).toBe(true);
    expect(skillsCatalogList(options)).toBe(true);
    expect(
      skillsCatalogList(parseArguments(["skills", "owner/repo", "--list"]))
    ).toBe(false);
    expect(() =>
      parseArguments(["skills", "owner/repo", "--list", "--json"])
    ).toThrow("upstream installer's terminal output");
  });
  it("requires explicit selection outside a terminal", async () => {
    await expect(
      selectInthSkill(parseArguments(["skills"]), {
        interactive: false,
        select: async () => {
          throw new Error("Unexpected prompt");
        },
      })
    ).rejects.toMatchObject({ code: "interaction_required" });
  });
  it("cancellation leaves the install arguments untouched", async () => {
    const options = parseArguments(["skills"]);
    await expect(
      selectInthSkill(options, {
        interactive: true,
        select: async () => {
          throw new CliError("cancelled", "Skills selection cancelled.");
        },
      })
    ).rejects.toMatchObject({ code: "cancelled" });
    expect(options.skillsArguments).toEqual([]);
  });
  it("rejects a selection that is absent from the catalog", async () => {
    await expect(
      selectInthSkill(parseArguments(["skills"]), {
        interactive: true,
        select: async () => "not-an-inth-skill",
      })
    ).rejects.toMatchObject({ code: "usage_error" });
  });
});
