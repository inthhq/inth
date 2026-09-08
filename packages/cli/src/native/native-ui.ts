import { CliError } from "../cli-error.ts";
import { colorEnabled, organizationLabel } from "../display.ts";
import type { Organization, OrganizationUI } from "../organizations.ts";
import {
  terminalBegin,
  terminalEnd,
  terminalKey,
  terminalLine,
  terminalRows,
} from "./native-bindings.ts";

const selectedOrganization = (
  organizations: Organization[],
  cursor: number
): Organization => {
  if (cursor < 0 || cursor >= organizations.length) {
    throw new Error("Invalid organization selection.");
  }
  const selected = organizations[cursor];
  if (!selected) {
    throw new Error("Invalid organization selection.");
  }
  return selected;
};
const coloredLine = (text: string, code: string): void => {
  const color = colorEnabled(Boolean(process.stderr.isTTY));
  // Keep ANSI outside the C clipping function, which measures printable cells.
  if (color) {
    process.stderr.write(`\u001B[${code}m`);
  }
  terminalLine(text);
  if (color) {
    process.stderr.write("\u001B[0m");
  }
};
const render = (organizations: Organization[], cursor: number): number => {
  const count = Math.min(
    organizations.length,
    Math.max(1, terminalRows() - 4),
    8
  );
  const start = Math.min(
    Math.max(0, cursor - count + 1),
    organizations.length - count
  );
  coloredLine("◆ Choose your default organization", "1;36");
  for (let index = start; index < start + count; index += 1) {
    coloredLine(
      `│ ${index === cursor ? "●" : "○"} ${organizationLabel(selectedOrganization(organizations, index))}`,
      index === cursor ? "1;36" : "2"
    );
  }
  coloredLine(
    `└ ↑/↓ Move · Enter Select · Esc Cancel · ${cursor + 1}/${organizations.length}`,
    "2"
  );
  return count + 2;
};
const erase = (lines: number): void => {
  if (lines > 0) {
    process.stderr.write(
      `\u001B[${Math.min(lines, Math.max(1, terminalRows() - 1))}A\r\u001B[J`
    );
  }
};
const select = async (
  organizations: Organization[],
  signal: AbortSignal
): Promise<string> => {
  signal.throwIfAborted();
  if (terminalBegin() !== 0) {
    throw new CliError(
      "interaction_required",
      "A terminal is required. Use inth switch <organization-id>."
    );
  }
  let lines = 0;
  let cursor = 0;
  try {
    lines = render(organizations, cursor);
    for (;;) {
      signal.throwIfAborted();
      const key = terminalKey();
      if (key === 4 || key === -1) {
        throw new CliError("cancelled", "Organization selection cancelled.");
      }
      if (key === 3) {
        const org = selectedOrganization(organizations, cursor);
        erase(lines);
        lines = 0;
        coloredLine(`◇ ${organizationLabel(org)}`, "32");
        return org.id;
      }
      if (key === 1) {
        cursor = (cursor + organizations.length - 1) % organizations.length;
      }
      if (key === 2) {
        cursor = (cursor + 1) % organizations.length;
      }
      if (key === 5) {
        cursor = 0;
      }
      if (key === 6) {
        cursor = organizations.length - 1;
      }
      if (key > 0) {
        erase(lines);
        lines = render(organizations, cursor);
      }
      // eslint-disable-next-line no-await-in-loop, promise/avoid-new -- Yield between bounded terminal polls so abort signals can run.
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });
    }
  } finally {
    erase(lines);
    terminalEnd();
  }
};
export const nativeUI = (
  signal: AbortSignal,
  allowInteractive = true
): OrganizationUI => ({
  interactive:
    allowInteractive && Boolean(process.stdin.isTTY && process.stderr.isTTY),
  select: (organizations) => select(organizations, signal),
});
