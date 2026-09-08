import { editMcpToml } from "../../src/mcp-toml.ts";
import { mcpTomlStatus } from "../../src/native/native-bindings.ts";

const check = (value: boolean, message: string): void => {
  if (!value) {
    throw new Error(message);
  }
};
for (const source of [
  "",
  '# Keep comment\nmodel = "example"\n',
  '[mcp_servers.other]\nurl = "https://other.example"\n',
  'instructions = """\n[mcp_servers.inth]\nThis is a string, not a table.\n"""\n',
]) {
  const added = editMcpToml(source, false, (value) => mcpTomlStatus(value));
  check(added.changed && added.configured, "Setup did not add Inth.");
  check(
    !editMcpToml(added.source, false, (value) => mcpTomlStatus(value)).changed,
    "Repeated setup changed config."
  );
  const removed = editMcpToml(added.source, true, (value) =>
    mcpTomlStatus(value)
  );
  check(
    mcpTomlStatus(removed.source) === 0 && removed.changed,
    "Removal failed."
  );
  check(removed.source.startsWith(source), "Unrelated config changed.");
}
for (const source of [
  "broken = [",
  '[mcp_servers.inth]\nurl = "https://other.example"\n',
]) {
  let rejected = false;
  try {
    editMcpToml(source, false, (value) => mcpTomlStatus(value));
  } catch {
    rejected = true;
  }
  check(rejected, "Invalid or conflicting config was overwritten.");
}
const inline =
  'mcp_servers = { inth = { url = "https://api.inth.com/mcp" } }\n';
check(
  editMcpToml(inline, false, (value) => mcpTomlStatus(value)).source === inline,
  "Existing inline setup changed."
);
check(
  editMcpToml(inline, false, (value) => mcpTomlStatus(value), true).configured,
  "Inline setup was not listed."
);
const nested =
  '[mcp_servers."inth"]\nurl = "https://api.inth.com/mcp"\n[mcp_servers.inth.http_headers]\ncustom = "keep"\n[mcp_servers.other]\nurl = "https://other.example"\n';
const removed = editMcpToml(nested, true, (value) => mcpTomlStatus(value));
check(
  !removed.source.includes('custom = "keep"') &&
    removed.source.includes("[mcp_servers.other]"),
  "Nested removal changed the wrong server."
);
console.log(
  "Native MCP TOML setup, removal, idempotency, comments, and conflict checks passed."
);
process.exit(0);
