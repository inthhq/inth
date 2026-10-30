import type { ResourceInputRule } from "./resource-commands.ts";

interface CommandInputs {
  fields: string[];
  required: string[];
  rules: ResourceInputRule[];
}

export const commandInputs = (rules: ResourceInputRule[]): CommandInputs => ({
  fields: rules.map((rule) => rule.name),
  required: rules.filter((rule) => rule.required).map((rule) => rule.name),
  rules,
});
