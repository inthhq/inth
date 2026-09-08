import type { UserProfile } from "./identity.ts";
import { terminalText } from "./organizations.ts";
import type { Organization } from "./organizations.ts";

export interface DisplayOptions {
  color: boolean;
  columns: number;
  selectedOrganization?: string;
  profile?: UserProfile;
}

export const colorEnabled = (tty: boolean): boolean =>
  tty && process.env.NO_COLOR === undefined && process.env.TERM !== "dumb";

export const style = (text: string, code: string, color: boolean): string =>
  color ? `\u001B[${code}m${text}\u001B[0m` : text;

export const shortId = (id: string): string => {
  const text = terminalText(id);
  return text.length > 4 ? `…${text.slice(-4)}` : text;
};

export const organizationLabel = (org: Organization): string =>
  `${terminalText(org.name)} (${terminalText(org.slug)})`;

export const organizationReference = (
  organizations: Organization[],
  id: string
): string => {
  const org = organizations.find((item) => item.id === id || item.slug === id);
  return org ? organizationLabel(org) : shortId(id);
};

// Conservative cell widths keep CJK and emoji from overrunning terminal columns.
// Joined emoji may occupy fewer cells; overestimating only wraps a little earlier.
const cellWidth = (character: string): number => {
  // eslint-disable-next-line no-misleading-character-class -- Match standalone zero-width code points while measuring terminal cells.
  if (/[\u0300-\u036F\u200B-\u200F\uFE00-\uFE0F]/u.test(character)) {
    return 0;
  }
  if (
    /[\u1100-\u115F\u2329\u232A\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE10-\uFE19\uFE30-\uFE6F\uFF01-\uFF60\uFFE0-\uFFE6\u{1F000}-\u{1FAFF}\u{20000}-\u{3FFFF}]/u.test(
      character
    )
  ) {
    return 2;
  }
  return 1;
};

export const textWidth = (text: string): number => {
  let width = 0;
  for (const character of text) {
    width += cellWidth(character);
  }
  return width;
};

export const padText = (text: string, width: number): string =>
  text + " ".repeat(Math.max(0, width - textWidth(text)));

export const wrapText = (
  text: string,
  columns: number,
  indent = ""
): string => {
  const lines: string[] = [];
  let line = "";
  let width = 0;
  for (const character of terminalText(text)) {
    const cells = cellWidth(character);
    if (width + cells > columns && line) {
      lines.push(line);
      line = "";
      width = 0;
    }
    line += character;
    width += cells;
  }
  lines.push(line);
  return lines.join(`\n${indent}`);
};
