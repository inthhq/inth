import type { CliArguments } from "./arguments.ts";
import { CliError } from "./cli-error.ts";
import type { OrganizationUI } from "./organizations.ts";

export interface InthSkill {
  id: string;
  name: string;
  description: string;
  source: string;
  skill: string;
}

// Keep discovery local so opening the picker never needs npm or a network request.
export const INTH_SKILLS: InthSkill[] = [
  {
    description: "Consent management for React, Next.js, and JavaScript",
    id: "c15t",
    name: "c15t",
    skill: "c15t",
    source: "c15t/skills",
  },
];

export const skillsCatalogList = (options: CliArguments): boolean =>
  !options.skillsSourceExplicit &&
  (options.skillsArguments ?? []).some((arg) => ["--list", "-l"].includes(arg));

export const skillsNeedsSelection = (options: CliArguments): boolean =>
  !options.skillsSourceExplicit &&
  !(options.skillsArguments ?? []).some(
    (arg) =>
      ["--skill", "-s", "--all", "--yes", "-y", "--list", "-l"].includes(arg) ||
      arg.startsWith("--skill=")
  );

export const selectInthSkill = async (
  options: CliArguments,
  ui: OrganizationUI
): Promise<void> => {
  if (!skillsNeedsSelection(options)) {
    return;
  }
  if (!ui.interactive) {
    throw new CliError(
      "interaction_required",
      "Run inth skills in a terminal to choose a skill. Use inth skills --list to browse, or inth skills --skill c15t --yes to install without prompts."
    );
  }
  const selected = await ui.select(
    INTH_SKILLS.map((skill) => ({
      id: skill.id,
      name: `${skill.name} · ${skill.description}`,
      role: "",
      slug: skill.id,
    }))
  );
  const skill = INTH_SKILLS.find((entry) => entry.id === selected);
  if (!skill) {
    throw new CliError(
      "usage_error",
      "That skill is not in the Inth catalog. Run inth skills --list."
    );
  }
  options.argument = skill.source;
  options.skillsArguments = [
    "--skill",
    skill.skill,
    ...(options.skillsArguments ?? []),
  ];
};

export const skillsCatalogText = (): string =>
  [
    "Inth skills",
    "",
    ...INTH_SKILLS.map(
      (skill) =>
        `  ${skill.name} · ${skill.description}\n    ${skill.source} · ${skill.skill}`
    ),
    "",
    "Run inth skills to choose a skill, or inth skills --skill c15t to install directly.",
  ].join("\n");
