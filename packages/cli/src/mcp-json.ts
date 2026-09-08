/* eslint-disable no-plusplus -- Scanner cursor increments consume exactly one character. */
/* eslint-disable prefer-named-capture-group -- Scriptc exposes numbered regex captures. */
/* eslint-disable no-new -- Constructing JsonDocument validates the edited source before any write. */
import { CliError } from "./cli-error.ts";
import { MCP_URL } from "./mcp-clients.ts";

interface JsonNode {
  parent: number;
  key: string;
  kind: string;
  start: number;
  valueStart: number;
  end: number;
  commaAfter: number;
}
const invalid: () => never = () => {
  throw new CliError(
    "invalid_config",
    "The client configuration is invalid or ambiguous. Repair it before running inth mcp."
  );
};
// Retain source spans so edits preserve comments, whitespace, and unrelated data.
class JsonDocument {
  readonly nodes: JsonNode[] = [];
  readonly source: string;
  private offset = 0;
  constructor(source: string) {
    this.source = source;
    this.skip();
    this.value(-1, "", this.offset, 0);
    this.skip();
    if (this.offset !== source.length || this.nodes[0]?.kind !== "object") {
      invalid();
    }
  }
  private skip(): void {
    while (this.offset < this.source.length) {
      const rest = this.source.slice(this.offset, this.offset + 2);
      if (/^\s/u.test(rest)) {
        this.offset++;
        continue;
      }
      if (rest.startsWith("//")) {
        const end = this.source.indexOf("\n", this.offset);
        this.offset = end === -1 ? this.source.length : end + 1;
        continue;
      }
      if (rest.startsWith("/*")) {
        const end = this.source.indexOf("*/", this.offset + 2);
        if (end === -1) {
          invalid();
        }
        this.offset = end + 2;
        continue;
      }
      break;
    }
  }
  private string(): string {
    const start = this.offset++;
    while (this.offset < this.source.length) {
      const character = this.source.charAt(this.offset++);
      if (character === "\\") {
        this.offset++;
        continue;
      }
      if (character === '"') {
        try {
          // SAFETY: Matching quotes identify a JSON string; the parser checks its escapes.
          return JSON.parse(this.source.slice(start, this.offset)) as string;
        } catch {
          invalid();
        }
      }
    }
    throw new CliError("invalid_config", "Invalid client configuration.");
  }
  private value(
    parent: number,
    key: string,
    start: number,
    depth: number
  ): void {
    if (depth > 100) {
      invalid();
    }
    this.skip();
    const first = this.source.charAt(this.offset);
    const node: JsonNode = {
      commaAfter: -1,
      end: 0,
      key,
      kind: "primitive",
      parent,
      start,
      valueStart: this.offset,
    };
    const index = this.nodes.length;
    this.nodes.push(node);
    if (first === "{" || first === "[") {
      node.kind = first === "{" ? "object" : "array";
      const closing = first === "{" ? "}" : "]";
      this.offset++;
      this.skip();
      const keys: string[] = [];
      while (this.source.charAt(this.offset) !== closing) {
        const childStart = this.offset;
        let childKey = "";
        if (first === "{") {
          if (this.source.charAt(this.offset) !== '"') {
            invalid();
          }
          childKey = this.string();
          if (keys.includes(childKey)) {
            invalid();
          }
          keys.push(childKey);
          this.skip();
          if (this.source.charAt(this.offset++) !== ":") {
            invalid();
          }
        }
        const childIndex = this.nodes.length;
        this.value(index, childKey, childStart, depth + 1);
        this.skip();
        if (this.source.charAt(this.offset) === closing) {
          break;
        }
        const child = this.nodes[childIndex];
        if (child) {
          child.commaAfter = this.offset;
        }
        if (this.source.charAt(this.offset++) !== ",") {
          invalid();
        }
        this.skip();
      }
      this.offset++;
    } else if (first === '"') {
      node.kind = "string";
      this.string();
    } else {
      const startValue = this.offset;
      while (
        this.offset < this.source.length &&
        !/[\s,\]}/]/u.test(this.source.charAt(this.offset) ?? "")
      ) {
        this.offset++;
      }
      const value = this.source.slice(startValue, this.offset);
      if (
        !/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)$/u.test(
          value
        )
      ) {
        invalid();
      }
    }
    node.end = this.offset;
  }
  child(parent: number, key: string): number {
    return this.nodes.findIndex(
      (node) => node.parent === parent && node.key === key
    );
  }
  insert(parent: number, key: string, value: string): string {
    const node = this.nodes[parent];
    if (!node || node.kind !== "object") {
      throw new CliError("invalid_config", "Invalid client configuration.");
    }
    const children = this.nodes.filter((item) => item.parent === parent);
    const newline = this.source.includes("\r\n") ? "\r\n" : "\n";
    const indent = /^([ \t]+)"/mu.exec(this.source)?.[1] ?? "  ";
    const lineStart =
      this.source.slice(0, node.valueStart).lastIndexOf("\n") + 1;
    const parentIndent =
      /^[ \t]*/u.exec(this.source.slice(lineStart))?.[0] ?? "";
    const last = children.at(-1);
    const position = last ? last.end : node.valueStart + 1;
    const entry = `${last ? "," : ""}${newline}${parentIndent}${indent}${JSON.stringify(key)}: ${value}`;
    return this.source.slice(0, position) + entry + this.source.slice(position);
  }
  remove(index: number): string {
    const node = this.nodes[index];
    if (!node) {
      throw new CliError("invalid_config", "Invalid client configuration.");
    }
    const siblings = this.nodes.filter((item) => item.parent === node.parent);
    const position = siblings.findIndex((item) => item.start === node.start);
    const previous = position > 0 ? siblings[position - 1] : undefined;
    const comma =
      node.commaAfter >= 0 ? node.commaAfter : (previous?.commaAfter ?? -1);
    if (comma >= node.end) {
      return (
        this.source.slice(0, node.start) +
        this.source.slice(node.end, comma) +
        this.source.slice(comma + 1)
      );
    }
    if (comma >= 0) {
      return (
        this.source.slice(0, comma) +
        this.source.slice(comma + 1, node.start) +
        this.source.slice(node.end)
      );
    }
    return this.source.slice(0, node.start) + this.source.slice(node.end);
  }
}
export interface ConfigEdit {
  source: string;
  configured: boolean;
  changed: boolean;
}
const configureEntry = (
  source: string,
  key: string,
  config: string,
  inspect: boolean
): ConfigEdit => {
  const requested = new JsonDocument(config);
  let next = source;
  let configured = true;
  for (const field of requested.nodes.filter((node) => node.parent === 0)) {
    const current = new JsonDocument(next);
    const currentServer = current.child(current.child(0, key), "inth");
    const index = current.child(currentServer, field.key);
    const existing = current.nodes[index];
    const expected = config.slice(field.valueStart, field.end);
    if (
      existing &&
      next.slice(existing.valueStart, existing.end) === expected
    ) {
      continue;
    }
    configured = false;
    if (!inspect) {
      next = existing
        ? next.slice(0, existing.valueStart) +
          expected +
          next.slice(existing.end)
        : current.insert(currentServer, field.key, expected);
    }
  }
  if (inspect) {
    return { changed: false, configured, source };
  }
  new JsonDocument(next);
  return { changed: !configured, configured: true, source: next };
};
export const editMcpJson = (
  source: string,
  key: string,
  config: string,
  remove: boolean,
  inspect = false
): ConfigEdit => {
  const original = source;
  const text = source || "{\n}\n";
  const document = new JsonDocument(text);
  const parent = document.child(0, key);
  const server = parent < 0 ? -1 : document.child(parent, "inth");
  if (parent >= 0 && document.nodes[parent]?.kind !== "object") {
    invalid();
  }
  if (server >= 0) {
    const urlIndex = document.child(server, "url");
    const url = urlIndex < 0 ? undefined : document.nodes[urlIndex];
    if (!url || url.kind !== "string") {
      invalid();
    }
    // SAFETY: The scanner validated a complete JSON string at this exact span.
    const value = JSON.parse(text.slice(url.valueStart, url.end)) as string;
    if (value !== MCP_URL) {
      throw new CliError(
        "config_conflict",
        'The client already has an "inth" entry for another server. Rename it in the client before continuing.'
      );
    }
    if (!remove || inspect) {
      return configureEntry(original, key, config, inspect);
    }
    const next = document.remove(server);
    new JsonDocument(next);
    return { changed: true, configured: false, source: next };
  }
  if (inspect || remove) {
    return { changed: false, configured: false, source: original };
  }
  const next =
    parent < 0
      ? document.insert(0, key, `{ "inth": ${config} }`)
      : document.insert(parent, "inth", config);
  new JsonDocument(next);
  return { changed: true, configured: true, source: next };
};
