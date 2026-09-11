# add-mcp

Source: https://github.com/neon-solutions/add-mcp/tree/5220a344cc85e384dbfa06e3deb7bd1fdc0360bb

Client paths and HTTP config shapes adapted in src/mcp-clients.ts. The upstream CLI and writers are not bundled.

The picker, argument metadata, and telemetry allowlist share the client registry. JSON/JSONC and TOML clients with HTTP configuration are supported. Claude Desktop requires its Connectors UI for remote servers; Goose's YAML writer is not bundled.

The following client documentation takes precedence over the pinned mappings:

- [fx MCP](https://fx.sh/docs/capabilities/mcp): global `mcp` configuration, project `.mcp.json` with `mcpServers` and explicit trust, and OAuth instructions.
- [Gemini CLI MCP](https://geminicli.com/docs/tools/mcp-server/): `httpUrl` for Streamable HTTP.
