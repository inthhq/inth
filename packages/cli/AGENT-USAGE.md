# Using inth from agents and scripts

If your terminal runs in a sandbox, such as Cursor's or Codex's, run `npm install -g @inth/cli` and any sign-in or API command outside it. The sandbox blocks npm's global directory and cache, the CLI state directory, the system credential store, and `api.inth.com`. npm reports the blocked cache as root-owned files; do not run `sudo chown`. Inside Cursor's or Codex's sandbox, the CLI reports the blocks it recognizes with the `sandbox_restricted` error code; other failures keep their usual code.

For hosted consent setup, follow [Set up hosted c15t with an agent](docs/c15t-setup.md). To upgrade a hosted app from c15t v2, run `inth c15t codemods <names...> --json --dry-run`, review the changes, then run it without `--dry-run`. It needs no sign-in or Inth project and never prompts. `inth c15t codemods --list --json` lists the codemods. Existing browser sign-in supports organization and project creation from JSON commands. For a separate, explicitly scoped credential, use [auth.md sign-in](docs/agent-auth-integration.md).

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

Authenticate through an existing browser sign-in or an organization API key in `INTH_TOKEN`. A person runs `inth login` interactively once; subsequent API requests can use that stored session and refresh it automatically. `--json` never opens a browser or asks a question. `login --json` without an email or API key fails before starting a device grant, even in a terminal. JSON and non-interactive commands never check for updates or print update notices. `inth update --check --json` reports `currentVersion`, `latestVersion`, `updateAvailable`, `installMethod`, and `updateCommand`. Supplying an API key skips device login, but `login` does not validate the key against the server. Use `inth whoami --json` to check access and read the principal, scopes, and memberships from `/v1/me`. Browser sign-ins also include an optional `data.profile` object from OAuth UserInfo with `sub`, `name`, and `email`; organization keys do not have a person’s profile.

`--non-interactive` also disables prompts and browser login while keeping human-readable output. When several organizations are available, provide an ID or slug to `switch` or `link`. Raw requests do not use the saved or directory-linked organization. Pass `--organization` or an `organizationId` query parameter only when the endpoint accepts that selector. Resource IDs resolve their own organization.

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

The envelope is defined in [output.schema.json](output.schema.json). Consumers should branch on `ok` and `error.code`, rather than matching error messages or relying on JSON property order. `error.apiCode` preserves recognized server codes such as `INSUFFICIENT_CREDITS`, `CONFLICT`, and `PLAN_LIMIT_REACHED`; it is null for local errors or unrecognized server codes. `schemaVersion` versions the envelope. Version 2 adds `error.apiCode`; consumers validating version 1 must adopt the version 2 schema. JSON API payloads keep their server-defined shape inside `data`, including server envelopes and pagination fields. A successful HTTP 204 produces `data: null`. The CLI does not automatically follow pagination; request the next page using the returned cursor or `nextPage`. Binary downloads save bytes to `--output` and return file metadata in `data`.

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
| `download_too_large` | A binary download exceeds the 128 MiB limit |
| `file_write_failed` | The download could not be saved to the requested new file |
| `revocation_failed` | Remote logout could not be confirmed |
| `http_error` | Another HTTP failure |
| `credential_store_unavailable` | The system credential store cannot be reached. On Linux, the message names the cause: libsecret is missing, the session bus cannot be reached, or no Secret Service is running. Set `INTH_TOKEN` for headless use |
| `sandbox_restricted` | An agent sandbox, such as Cursor's or Codex's, blocked the CLI state directory, the system credential store, or the Inth API. Run the command outside the sandbox |
| `migration_failed` | A c15t codemod could not transform a file. The message names those files and, without `--dry-run`, the files already changed |
| `command_failed` | Another command failure, including unavailable local storage |
| `cancelled` | The command was cancelled |

Handle unfamiliar error codes as failures. New codes may be added without changing the envelope version.

`auth status --json` reports `credentialSource`, `credentialPresent`, `validated: false`, and `expiresAt`. For agent sign-in, `credentialPresent` is false while approval is pending or after sign-out. `expiresAt` is the saved access-token or pending-approval expiry in Unix milliseconds, or null for an API key or signed-out agent state. Browser status also reports the resolved `organizationId`. This checks local credential presence, not server validity. CLI auth results never contain saved access tokens, refresh tokens, or supplied API keys. The `api` command returns the requested server payload unchanged in meaning; treat that data according to the endpoint's sensitivity.

`org create` requires a saved browser sign-in or an approved, selected connection and explicit `--name` and `--slug` values. API keys are refused before making a request. The success payload keeps the server envelope, so the new ID is at `data.data.id`. Creation does not change the CLI default or directory link. Run `inth switch <slug> --json` to select the new organization. Server validation, slug conflicts, and owner limits return HTTP errors with status and request ID. Network and server failures are not automatically retried; retry the same name and slug within 24 hours to resume creation if billing failed after the organization was saved.

JSON mode does not imply approval or make commands read-only. `switch` and `link` change local defaults, and `logout` revokes the selected session. `org create` creates a server-side organization. The `api` command supports GET, POST, PUT, PATCH, and DELETE.

## Feedback

Use `inth feedback --help --json` to discover report fields. Follow the user's permission to send feedback to the Inth team. Report unexpected Inth failures, misleading documentation, missing capabilities, or workarounds once per distinct issue. Include expected and actual behavior and the failed request ID when available. Exclude routine validation errors, credentials, personal data, customer payloads, and full transcripts.

Supply `--category <category>` and `--message <message>`, or use `--data` with the API body. `--surface` is optional and accepts `api`, `mcp`, `cli`, `docs`, `sdk`, `dashboard`, or `other`. Identical reports from the same caller within a UTC day return the existing ticket. With `--json`, read `data.data.reference` and `data.data.alreadySubmitted`. Any existing Inth credential works without additional scopes or an organization selection. No credits are charged. The limit is ten new reports per caller per UTC clock hour; same-day duplicate reports do not consume that quota. Continue the original task if submission fails.

## Resource commands

Offline topic files ship in `docs/cli/`; open [AGENTS.md](./AGENTS.md) for the local index.

Use `inth --help --json` to discover commands and options. Resource groups include `project`, `consent`, `website`, `website-audit`, `member`, `invitation`, `api-key`, `code-audit`, `inbox`, `vendor`, `chat`, `billing`, `account`, `integration`, `notification`, `support` and `region`. The [command reference](https://inth.com/docs/cli/commands) lists operations and required inputs.

Use `account sessions` and `account devices` for separate browser-session and device-grant discovery. `integration status` links to provider installation, repository, project-link policy, Search Console property and domain-proof reads. These pages default to 20 items and return `data.data.items` plus `data.data.nextCursor`. Use discovered internal IDs. `website-audit cookie-inventory` returns a latest-scan index with `cookiesPath`; read actual cookie rows with `website-audit cookies <scanId>`. `billing ledger` covers all retained settled usage with attribution. Keep the same or omitted filters with its cursor so the server preserves the frozen date window. Its `billing.read` access follows existing API-key capabilities and owner permissions. `code-audit quote <scanId>` reads the exact prepared quote and approval availability without spending. Existing API keys lack `code-audit.read`.

Lists return a single page. Standard cursor pages return `data.pagination.nextCursor`; other resources return a continuation inside `data.data`. Keep the same organization and filters when requesting the next page. Check the command's help for accepted pagination flags and defaults. Consent records use `nextPage` and fixed numbered pages. Support history keeps its polling `checkpoint` separate from its terminal `nextCursor`. Login, switch, and link retrieve all membership pages before choosing an organization.

Use `--organization` for commands whose help lists it, including organization-owned lists and billing invoice reads. Other commands targeting a resource ID resolve ownership on the server and reject it. Code Audit start and scan-request polling use `--repository` instead. Existing local selection files still use `organizationId`; API organization records now use `id`, `name`, and `slug`. `whoami --json` exposes capabilities at `data.data.scopes`.

Writes with body options accept explicit flags, `--data '<JSON object>'` or `--data-file <path|->`. Raw requests support `--method GET|POST|PUT|PATCH|DELETE`; GET is the default and cannot carry `--data`. Ordinary updates execute immediately. New chat sharing/deletion and website removal require a target-specific terminal confirmation or `--yes`; JSON mode does not approve them. Invitation sends, key rotation, report unlocks and GitHub issue creation have the effects described in the command reference. Key creation and rotation return the plaintext key at `data.data.key` once. Keep it out of logs.

For scan starts, supply a stable `--request-id` to make a manual retry idempotent. A `starting` response contains `data.data.preparationId` and `data.data.repositoryId`; pass them to `code-audit request <preparation-id> --repository <repository-id>`. Each call returns one state. Continue until `started` or `failed`, then use the returned scan ID to read progress or findings.

For Inbox updates, read the item first and pass its `data.data.version` using `--item-version`. Do not retry a version conflict with the old version. Read again and decide whether the intended update still applies. An unresolved GitHub issue send may require server reconciliation before another attempt.

HTTP rate-limit retries honor `Retry-After` with at most three retries and 30 seconds of cumulative waiting per request. If the next delay would exceed that budget, the command returns the rate-limit error without retrying early. Feedback does not retry rate-limit responses.

Binary downloads require an explicit new file path. The parent directory must exist, and existing files are never overwritten. `--output -` is refused. Downloads preserve bytes and accept at most 128 MiB. With `--json`, stdout contains `data.path`, `data.bytes`, `data.contentType` and `data.requestId`.

```sh
inth website-audit screenshot-get capture_123 --audit scan_123 --output ./capture.png --json
inth billing invoice-pdf inv_123 --organization org_123 --output ./invoice.pdf --json
inth support attachment-get sat_123 --output ./recording.webm --json
inth chat attachment-get aga_first --output ./attachment.bin --json
```

Use raw GET downloads for API-returned paths without a named command. `api <path> --method GET --output <new-file>` also works. File output rejects other methods and body inputs. API-host restrictions, redirect refusal and endpoint authorization apply. Without `--json`, raw downloads print JSON metadata without the CLI envelope.

To review a project's vendors, run `inth vendor list --project <project-id> --state active --json` and read each vendor's `id`. `inth vendor get <vendor-id> --project <project-id> --json` returns its `hosts`, `evidence[].loadedBy`, and `inboxItemId`. For a runtime finding, read `data.data.runtimeVendor` from `inth inbox get <id> --json` and pass its `vendorId` and `projectId` to `inth vendor approve <vendor-id> --project <project-id>` or `inth vendor ignore`. Either decision closes the finding, so do not also update it with `inbox update`. Vendor decisions need a person's sign-in and an admin or owner role; API keys are refused. An agent connection must include `vendors.write` in `--scopes`. If an existing agent connection lacks it, disconnect with `inth logout --auth agent --json` and sign in again so the person can approve it.

New browser sign-ins request the current CLI capabilities. A person must run `inth login` again to grant newer scopes to an older sign-in; refresh cannot add them. Agent connections request an explicit subset. The [authentication guide](https://inth.com/docs/cli/authentication) maps resource tasks to scopes. API keys keep their fixed capabilities and cannot gain person-only scopes.

### File uploads and recovery

Use `chat attachment-upload --file <path>` or `support attachment-upload --file <path>`, with normal organization selection. Files must be local, regular and stable. Binary stdin and JSON body flags are rejected. `--file-name` chooses a display basename; `--media-type` must match a known extension. Generic JSON file input stays capped at 1 MiB.

Chat uploads accept up to 20 MiB each. The server enforces ten drafts and 40 MiB total. Upload returns a ready `aga_` ID. Pass at most ten unique IDs as one ordered JSON array with `--attachment-ids`, or as `attachmentIds` in a complete JSON chat body. A lost chat upload response returns `upload_outcome_unknown`; use `chat attachment-list --organization <id> --json` before another attempt. Do not infer ownership of a concurrent draft from matching name/type/size alone. Discovery and downloads remain available while processing is paused. Use `chat attachment-discard <aga-id>` only for an unused draft.

Support accepts GIF/JPEG/PNG/WebP up to 10 MiB and MP4/MOV/WebM up to 100 MiB, with no PDF creation support. It reserves an intent, PUTs bytes once using its opaque signed grant, then finalizes. No API credentials go to storage. Keep `clientAttachmentId` and the returned `sat_` ID from stderr. Use `--client-attachment-id <uuid>` to replay identical still-pending intent metadata; do not generate a new ID after a conflict. A lost PUT response triggers finalization without another PUT. Recover a known upload with `support attachment-finalize <sat-id>`. Discard explicitly with `support attachment-discard <sat-id>`.

Use `--receipt <new-file>` for private, atomic recovery records written before network. Existing files are never overwritten; receipts contain safe IDs, stages, environment and metadata only. Without a receipt, record stderr IDs for crash recovery. Uploading is separate from message sending. Do not automatically discard after an uncertain message send. Upload/finalize/discard still honor server gates, roles and scopes; Support writes need explicitly approved `support.write`. See the [file upload guide](https://inth.com/docs/cli/commands#how-do-i-upload-and-recover-files).

### Chat turns and retries

`chat start` and `chat send <id>` need `agents.write`; `chat get <id>` needs `agents.read`. Use a person's connection. Send text with `--message`, `--message-file <path|->`, or a JSON body using `--data` or `--data-file <path|->`. Exactly one input form is accepted. A file flag with `-` reads stdin; a literal `--message -` does not. The trimmed message limit is 50,000 characters. Nonempty `--attachment-ids` permits omitted or empty text.

Supply a fresh UUID v4 `--client-message-id` for each new message, and persist it with the exact message, ordered attachment IDs and organization/chat selectors before sending. Reuse them for an uncertain retry. If the ID is omitted, the CLI generates it once and prints it to stderr before HTTP. Preserve that diagnostic separately from JSON stdout. Do not automatically generate another ID after a conflict.

Start/send can spend credits and return acceptance while the agent continues answering. Read the chat ID at `data.data.id`, then use `chat get` to check `data.data.status` and read `data.data.messages`. Each get reads once. JSON keeps every server field. A write-only connection can send without reading the transcript. Local cancellation does not stop an accepted turn.

`chat start` supports normal organization selection and optional `--inbox-item <id>`. Get/send use the chat ID and reject organization/project overrides. See the [chat command guide](https://inth.com/docs/cli/commands#how-do-i-use-inth-agent-chats) for examples.

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

Additional public API operations accept explicit agent scopes for billing writes, account/security changes, integrations, support writes, Consent runtime/key changes and organization settings/deletion. These write permissions are excluded from ordinary browser login. Request only the permissions needed with `inth login --email <email> --scopes <scopes> --json`; the [authentication scope table](https://inth.com/docs/cli/authentication) lists them and companion permissions. The raw `api` command can call supported operations without a named wrapper. Server rollout and operational switches still control new writes.
