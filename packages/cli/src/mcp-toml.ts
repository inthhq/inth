/* eslint-disable no-plusplus -- Scan quoted strings one character at a time. */
import { CliError } from "./cli-error.ts";
import { MCP_URL } from "./mcp-clients.ts";
import type { ConfigEdit } from "./mcp-json.ts";

interface Section {
  start: number;
  end: number;
  inth: boolean;
}
// The native TOML parser validates the document; this scanner only locates table
// spans. Keeping the original text preserves comments, ordering, and formatting.
const sections = (source: string): Section[] => {
  const result: Section[] = [];
  let offset = 0;
  let quote = "";
  for (const line of source.split("\n")) {
    if (!quote && /^\s*\[/u.test(line)) {
      const previous = result.at(-1);
      if (previous) {
        previous.end = offset;
      }
      const inth =
        /^\s*\[\s*(?:mcp_servers|"mcp_servers"|'mcp_servers')\s*\.\s*(?:inth|"inth"|'inth')\s*(?:\.|\])/u.test(
          line
        );
      result.push({ end: source.length, inth, start: offset });
    }
    for (let index = 0; index < line.length; index++) {
      const char = line.charAt(index);
      if (quote) {
        if (char === "\\" && quote.startsWith('"')) {
          index++;
          continue;
        }
        if (line.slice(index, index + quote.length) === quote) {
          index += quote.length - 1;
          quote = "";
        }
      } else {
        if (char === "#") {
          break;
        }
        if (char === '"' || char === "'") {
          quote =
            line.slice(index, index + 3) === char.repeat(3)
              ? char.repeat(3)
              : char;
          index += quote.length - 1;
        }
      }
    }
    offset += line.length + 1;
  }
  return result;
};
export const editMcpToml = (
  source: string,
  remove: boolean,
  status: (value: string) => number,
  inspect = false
): ConfigEdit => {
  const current = status(source);
  if (current < 0) {
    throw new CliError(
      "invalid_config",
      "The TOML client configuration is invalid. Repair it before running inth mcp."
    );
  }
  if (current === 2) {
    throw new CliError(
      "config_conflict",
      'The client already has an "inth" entry for another server. Rename it in the client before continuing.'
    );
  }
  if (inspect) {
    return { changed: false, configured: current === 1, source };
  }
  if (current === 1 && !remove) {
    return { changed: false, configured: true, source };
  }
  if (current === 0 && remove) {
    return { changed: false, configured: false, source };
  }
  let next = source;
  if (remove) {
    const targets = sections(source)
      .filter((section) => section.inth)
      .toReversed();
    for (const target of targets) {
      const block = source.slice(target.start, target.end);
      const suffix = /(?:\r?\n[ \t]*(?:#[^\n]*)?)*$/u.exec(block)?.[0] ?? "";
      const trailing = suffix.includes("#") ? suffix : "";
      next = next.slice(0, target.start) + trailing + next.slice(target.end);
    }
  } else {
    const newline = source.includes("\r\n") ? "\r\n" : "\n";
    next += `${source && !source.endsWith("\n") ? newline : ""}[mcp_servers.inth]${newline}url = "${MCP_URL}"${newline}`;
  }
  if (status(next) !== (remove ? 0 : 1)) {
    throw new CliError(
      "config_conflict",
      "This TOML layout needs an edit in the client. Use a [mcp_servers.inth] table, then retry. No files were changed."
    );
  }
  return { changed: true, configured: !remove, source: next };
};
