# Using inth from agents and scripts

If your terminal runs in a sandbox, such as Cursor's, run `npm install -g @inth/cli` and any sign-in or API command outside it. The sandbox blocks npm's global directory and cache, the CLI state directory, and `api.inth.com`. npm reports the blocked cache as root-owned files; do not run `sudo chown`. The CLI reports blocked state or network access with the `sandbox_restricted` error code.

For hosted consent setup, follow [Set up hosted c15t with an agent](docs/c15t-setup.md). Existing browser sign-in supports organization and project creation from JSON commands. For a separate, explicitly scoped credential, use [auth.md sign-in](docs/agent-auth-integration.md).

Use `--json` for machine-readable output. Named commands default to formatted text, including when piped or run with `--non-interactive`. The raw `api` command prints JSON by default; add `--json` for the standard CLI envelope. It is supported by the Scriptc, Node, and yao-pkg builds. Discover commands and flags with `inth --help --json`; read the CLI version with `inth --version --json`.

```sh
inth auth status --json
inth whoami --json
inth api /v1/me --json
inth org list --json
inth org create --name "Acme" --slug acme --json
inth api /v1/projects --organization org_123 --json
inth switch org_123 --json
inth link org_123 --json
```

Authenticate through an existing browser sign-in or an organization API key in `INTH_TOKEN`. A person runs `inth login` interactively once; subsequent API requests can use that stored session and refresh it automatically. `--json` never opens a browser or asks a question. `login --json` without an email or API key fails before starting a device grant, even in a terminal. Supplying an API key skips device login, but `login` does not validate the key against the server. Use `inth whoami --json` to check access and read the principal, scopes, and memberships from `/v1/me`. Browser sign-ins also include an optional `data.profile` object from OAuth UserInfo with `sub`, `name`, and `email`; organization keys do not have a person’s profile.

`--non-interactive` also disables prompts and browser login while keeping human-readable output. When several organizations are available, provide an ID or slug to `switch` or `link`. An API request can specify `--organization` to override linked project and user defaults. An explicit `organizationId` in the API URL query takes precedence over those defaults.

## Sign in or create an account

Tell the person which email and permissions Inth will receive before starting. `login --email` and `signup --email` treat the command itself as confirmation to send those details; `auth start` requires `--yes`. The person still approves access in their browser. After they agree:

```sh
inth login --email user@example.com --scopes organizations.read,organizations.write,projects.read,projects.write --json
inth login --complete --wait --json
inth org list --json
```

`inth signup --email <email> --json` uses the same approval page for account creation. Follow `data.nextStep.command` and `data.nextStep.instruction`. The CLI discovers hosted sign-in endpoints automatically.

Return `data.verificationUri` and `data.userCode` to the person, then immediately run `inth login --complete --wait --json` in a background terminal. Do not wait for them to say "done". The command finishes after browser approval and selects this connection for subsequent commands. It prints one final JSON result. The default wait is ten minutes; use `--timeout <seconds>` to change it. A timeout or cancellation between polls, during discovery, or while waiting for the credential lock preserves the pending sign-in. Run the waiting command again to resume. If it interrupts a single-use claim exchange, the result can be `claim_uncertain`; disconnect with `inth logout --auth agent --json` and start a new claim. Without `--wait`, completion checks once. Explicit `--auth` or an API key overrides the saved selection; combining an explicit agent selection with an API key is rejected. General API access requires the scoped auth.md backend deployment; older servers support `inth auth organizations` only.

Use `inth auth retry --json` for an expired approval code and `inth logout --auth agent --json` to disconnect. A `claim_uncertain` error requires a new claim because the previous single-use exchange may have succeeded. Tokens stay in the OS credential store. Identity assertion renewal lasts one hour after approval and cannot extend that deadline.

## Output contract

Each handled command outcome in JSON mode writes exactly one JSON object to stdout. It does not mix progress messages, colors, or prompt text into that stream. Both success and failure use stdout, so callers should parse it even when the exit status is nonzero. Human-readable errors use stderr when JSON mode is off.

Success:

```json
{
  "schemaVersion": 2,
  "ok": true,
  "data": { "organizationId": "org_123", "scope": "user" }
}
```

Failure:

```json
{
  "schemaVersion": 2,
  "ok": false,
  "error": {
    "apiCode": null,
    "code": "authentication_required",
    "message": "Not signed in. Run inth login.",
    "httpStatus": null,
    "requestId": null
  }
}
```

The envelope is defined in [output.schema.json](output.schema.json). Consumers should branch on `ok` and `error.code`, rather than matching error messages or relying on JSON property order. `error.apiCode` preserves recognized server codes such as `INSUFFICIENT_CREDITS`, `CONFLICT`, and `PLAN_LIMIT_REACHED`; it is null for local errors or unrecognized server codes. `schemaVersion` versions the envelope. Version 2 adds `error.apiCode`; consumers validating version 1 must adopt the version 2 schema. API payloads keep their server-defined shape inside `data`, including server envelopes and pagination fields. A successful HTTP 204 produces `data: null`. The CLI does not automatically follow pagination; request the next page using the returned cursor.

Exit codes are `0` for success, `1` for failure, and `130` for handled cancellation. HTTP failures include `httpStatus` and the sanitized `X-Request-Id` when available. Preserve the request ID for support.

| Error code | Meaning |
| --- | --- |
| `usage_error` | Invalid arguments or an unsupported operation, such as refreshing an API key |
| `interaction_required` | Browser approval or an organization choice needs a person or an explicit argument |
| `authentication_required` | No saved credentials, HTTP 401, or a revoked or expired refresh token |
| `invalid_scope` | The OAuth server refused the requested login scopes. Check the deployed `inth-cli` registration and allowed scopes |
| `insufficient_scope` | The token lacks a required capability. Run interactive `inth login` again for a browser session; API keys cannot gain capabilities |
| `access_denied` | HTTP 403 or refused device approval |
| `authentication_expired` | Device approval expired |
| `organization_required` | No organizations are available |
| `organization_unavailable` | The requested organization is not in the accessible list |
| `rate_limited` | HTTP 429 remains after the CLI's bounded Retry-After retries |
| `invalid_response` | The server returned malformed JSON or an invalid protocol response |
| `revocation_failed` | Remote logout could not be confirmed |
| `http_error` | Another HTTP failure |
| `sandbox_restricted` | An agent sandbox, such as Cursor's, blocked the CLI state directory or the Inth API. Run the command outside the sandbox |
| `command_failed` | Another command failure, including unavailable local storage |
| `cancelled` | The command was cancelled |

Handle unfamiliar error codes as failures. New codes may be added without changing the envelope version.

`auth status --json` reports `credentialSource`, `credentialPresent`, `validated: false`, and `expiresAt`. For agent sign-in, `credentialPresent` is false while approval is pending or after sign-out. `expiresAt` is the saved access-token or pending-approval expiry in Unix milliseconds, or null for an API key or signed-out agent state. Browser status also reports the resolved `organizationId`. This checks local credential presence, not server validity. CLI auth results never contain saved access tokens, refresh tokens, or supplied API keys. The `api` command returns the requested server payload unchanged in meaning; treat that data according to the endpoint's sensitivity.

`org create` requires a saved browser sign-in or an approved, selected connection and explicit `--name` and `--slug` values. API keys are refused before making a request. The success payload keeps the server envelope, so the new ID is at `data.data.id`. Creation does not change the CLI default or directory link. Run `inth switch <slug> --json` to select the new organization. Server validation, slug conflicts, and owner limits return HTTP errors with status and request ID. Network and server failures are not automatically retried; retry the same name and slug within 24 hours to resume creation if billing failed after the organization was saved.

JSON mode does not imply approval or make commands read-only. `switch` and `link` change local defaults, and `logout` revokes the selected session. `org create` creates a server-side organization. The `api` command supports GET, POST, PATCH, and DELETE.

## Resource commands

Use `inth --help --json` to discover commands and options. `project`, `member`, `invitation`, `api-key`, `code-audit`, `inbox`, `billing`, and `region` expose the public REST resources. The [command reference](README.md#public-resource-commands) lists each operation and its required inputs.

Lists return a single page. Read `data.pagination.nextCursor` and pass it to `--cursor`, keeping the same organization and filters. `--limit` defaults to 50 and accepts 1 through 100. Login, switch, and link retrieve all membership pages before choosing an organization.

Use `--organization` for organization-owned lists and creates. Commands targeting a resource ID resolve ownership on the server and do not accept it. Scan start and scan-request polling use `--repository` instead. Existing local selection files still use `organizationId`; API organization records now use `id`, `name`, and `slug`. `whoami --json` exposes capabilities at `data.data.scopes`.

Writes accept explicit body options or `--data '<JSON object>'`. Raw requests support `--method GET|POST|PATCH|DELETE`; GET is the default and cannot carry `--data`. Resource writes execute immediately without prompts. Invitation sends, key rotation, report unlocks, and GitHub issue creation have the effects described in the command reference. Key creation and rotation return the plaintext key at `data.data.key` once. Keep it out of logs.

For scan starts, supply a stable `--request-id` to make a manual retry idempotent. A `starting` response contains `data.data.preparationId` and `data.data.repositoryId`; pass them to `code-audit request <preparation-id> --repository <repository-id>`. Each call returns one state. Continue until `started` or `failed`, then use the returned scan ID to read progress or findings.

For Inbox updates, read the item first and pass its `data.data.version` using `--item-version`. Do not retry a version conflict with the old version. Read again and decide whether the intended update still applies. An unresolved GitHub issue send may require server reconciliation before another attempt.

New browser sign-ins request `code-audit.read`, `code-audit.write`, `inbox.read`, `inbox.write`, and `billing.read` alongside the existing scopes. A person must run `inth login` again to grant these scopes to an older sign-in. API keys have fixed capabilities; they can read Inbox and billing but cannot use Code Audit or perform Inbox writes.

## Command discovery and MCP setup

Bare `inth skills` opens a native picker. Use `inth skills --list --json` to read the bundled catalog offline through `data.skills`, or `inth skills --non-interactive --yes --skill c15t --agent claude-code` for unattended installation. An explicit `owner/repo` bypasses the picker; without one, installation defaults to `c15t/skills`. Installation uses `npx skills@1.5.25 add` and requires Node.js and npm. Installer option values are preserved; supported --option=value forms are normalized for the upstream parser. Installation and listing an explicit repository emit upstream terminal output; JSON is available for the bundled catalog and help.

MCP setup results include `results[].nextStep` with a `command` and an `instruction` for client sign-in. Dry runs return the command to apply changes instead. Listing and completed removals return `nextStep: null`. Full config paths stay in JSON even when the human summary abbreviates them.

`inth project create --help --json` returns only that command's structured metadata in `data.commandDefinitions`. Definitions include typed options, required fields, accepted enum values, defaults, required OAuth scopes, credential support, effects, examples, and pagination behavior. The older `commands` and `options` string arrays remain available for existing consumers.

```sh
inth mcp setup --agent codex --scope global --dry-run --json
inth mcp setup --agent cursor --scope project --json
inth mcp list --scope project --json
inth mcp remove --agent cursor --scope project --json
```

Setup and removal require explicit `--agent` and `--scope` in noninteractive mode. Supported clients are `codex`, `claude-code`, `cursor`, `vscode`, `opencode`, `fx`, `antigravity`, `cline`, `cline-cli`, `gemini-cli`, `github-copilot-cli`, `grok-build`, `kilo-code`, `kimi-code`, `kiro-cli`, `mastracode`, `mcporter`, `pi`, `windsurf`, and `zed`. Scope is `project` or `global`; Antigravity, Cline, Cline CLI, and Windsurf require `global`. Listing without an agent defaults to project-capable clients. Use `--scope global` to list every client. fx project setup requires trusting the server in fx, and Pi requires `pi-mcp-adapter`. The result contains each client path, status, and whether a file changed. `--dry-run` does not write files. `connectionVerified: false` distinguishes configuration from authentication and connectivity. Sign-in happens in the MCP client through OAuth; do not supply an organization API key.

Configuration failures use `invalid_config`, `config_conflict`, `config_busy`, or `config_write_failed`. Conflicting and malformed configs are preserved. Native distributions target Apple silicon Macs, Linux arm64/x64, and Windows x64. Use an organization API key for Linux environments without a desktop credential service.
