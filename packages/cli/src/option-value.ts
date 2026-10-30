import type { CliArguments } from "./arguments.ts";

export const optionValue = (
  options: CliArguments,
  name: string
): string | undefined =>
  options.values.find((entry) => entry.name === name)?.value;
