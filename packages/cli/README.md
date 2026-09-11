<h1 align="center">inth CLI</h1>

<p align="center">Manage your Inth organizations, projects, Code Audit, and Inbox from the terminal.</p>

<p align="center">
  <a href="#get-started"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/badge/Status-In%20development.svg?variant=outline&size=xs&mode=dark"><img src="https://shieldcn.dev/badge/Status-In%20development.svg?variant=outline&size=xs&mode=light" alt="Status: in development"></picture></a>
  <a href="#get-started"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/badge/Platform-macOS%20%7C%20Linux%20%7C%20Windows.svg?variant=outline&size=xs&mode=dark"><img src="https://shieldcn.dev/badge/Platform-macOS%20%7C%20Linux%20%7C%20Windows.svg?variant=outline&size=xs&mode=light" alt="Platform: macOS, Linux, Windows"></picture></a>
  <a href="../../LICENSE"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/badge/License-Apache%202.0.svg?variant=outline&size=xs&mode=dark"><img src="https://shieldcn.dev/badge/License-Apache%202.0.svg?variant=outline&size=xs&mode=light" alt="License: Apache 2.0"></picture></a>
  <a href="https://inth.com?utm_source=github&utm_medium=repo_homepage"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/badge/Made%20By-Inth-ffc803.svg?size=xs&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGZpbGw9Im5vbmUiIHZpZXdCb3g9IjAgMCAzOTMgNDAwIj48cGF0aCBmaWxsPSIjMDAwIiBkPSJNMTgyLjY2MiAwdjM2Ljg5NWgtNTkuMDMxdjgyLjczM2g1OS4wMzF2MzYuODkzSDI3LjQ4MnYtMzYuODkzaDU5LjAzVjM2Ljg5NWgtNTkuMDNWMHpNMzIxLjk0MSA4OS44NVYwaDM1LjM1NXYxNTYuNTIxaC0yNS43MTNsLTg2LjEzNy05MC4zNjR2OTAuMzY0aC0zNS4zNTVWMGgyNi4zNTV6Ii8%2BPHBhdGggZmlsbD0iIzAwMCIgZmlsbC1ydWxlPSJldmVub2RkIiBkPSJNMzE4LjU3MSAxODUuNzE0aDc0LjI4NlY0MDBIMFYxODUuNzE0aDI3Mi44NTd2LTQ3LjE0M3ptLTI5MS4wOSAyOC45Njl2MzcuMTE4aDU4LjEzN3YxMTkuNjI4aDM2Ljg5NVYyNTEuODAxaDU4LjU4NHYtMzcuMTE4em0xODIuNjEuMjI0djE1Ni41MjJoMzYuODk0VjMxMy41OWg3My4zNDF2NTcuODM5aDM3LjExOFYyMTQuOTA3aC0zNy4xMTh2NjEuNzg4aC03My4zNDF2LTYxLjc4OHoiIGNsaXAtcnVsZT0iZXZlbm9kZCIvPjwvc3ZnPg%3D%3D&color=ffc803&labelTextColor=000000&valueColor=000000&mode=dark"><img src="https://shieldcn.dev/badge/Made%20By-Inth-ffc803.svg?size=xs&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGZpbGw9Im5vbmUiIHZpZXdCb3g9IjAgMCAzOTMgNDAwIj48cGF0aCBmaWxsPSIjMDAwIiBkPSJNMTgyLjY2MiAwdjM2Ljg5NWgtNTkuMDMxdjgyLjczM2g1OS4wMzF2MzYuODkzSDI3LjQ4MnYtMzYuODkzaDU5LjAzVjM2Ljg5NWgtNTkuMDNWMHpNMzIxLjk0MSA4OS44NVYwaDM1LjM1NXYxNTYuNTIxaC0yNS43MTNsLTg2LjEzNy05MC4zNjR2OTAuMzY0aC0zNS4zNTVWMGgyNi4zNTV6Ii8%2BPHBhdGggZmlsbD0iIzAwMCIgZmlsbC1ydWxlPSJldmVub2RkIiBkPSJNMzE4LjU3MSAxODUuNzE0aDc0LjI4NlY0MDBIMFYxODUuNzE0aDI3Mi44NTd2LTQ3LjE0M3ptLTI5MS4wOSAyOC45Njl2MzcuMTE4aDU4LjEzN3YxMTkuNjI4aDM2Ljg5NVYyNTEuODAxaDU4LjU4NHYtMzcuMTE4em0xODIuNjEuMjI0djE1Ni41MjJoMzYuODk0VjMxMy41OWg3My4zNDF2NTcuODM5aDM3LjExOFYyMTQuOTA3aC0zNy4xMTh2NjEuNzg4aC03My4zNDF2LTYxLjc4OHoiIGNsaXAtcnVsZT0iZXZlbm9kZCIvPjwvc3ZnPg%3D%3D&color=ffc803&labelTextColor=000000&valueColor=000000&mode=light" alt="Made by Inth"></picture></a>
</p>

The `@inth/cli` package provides the `inth` command. Named commands print formatted text by default. Add `--json` for scripts and agents.

This package is in development and has not been published to npm. Native targets are Apple silicon Macs, Linux arm64/x64, and Windows x64.

[Get started](#get-started) · [Commands](#public-resource-commands) · [Development](#development) · [Agents and scripts](AGENT-USAGE.md)

## Get started

You need Node.js 24 and the pnpm version declared in the repository's `packageManager` field. Install Xcode Command Line Tools on macOS, Clang 18 or newer and zlib development headers on Linux (`clang` and `zlib1g-dev` on Ubuntu 24.04), or Zig 0.15.2 on Windows.

On Windows, select Zig before building in PowerShell:

```powershell
$env:SCRIPTC_CC = "zigcc"
$env:SCRIPTC_TARGET = "x86_64-windows-gnu"
```

From the repository root:

```sh
pnpm install
pnpm dev:link
inth --help
```

`pnpm dev:link` builds the CLI and links this checkout's `inth` command into npm's global bin directory. It works on macOS, Linux, and Windows without editing a shell profile. That directory must be on your `PATH`.

Run `inth` from any directory:

```sh
inth login
inth whoami
inth billing
```

After edits, run `pnpm dev:link` again to rebuild. The link uses this checkout's latest build and keeps your current working directory, so project commands and MCP setup work where you run them. Run `pnpm dev:unlink` to remove the development command. Only one checkout can own the global `inth` link at a time.

The development link uses Node.js 24 to launch `packages/cli/dist/inth`, or `dist/inth.exe` on Windows. Distributed native executables have no Node.js runtime dependency.

`login` opens your browser for approval, saves the session in the system credential store, and helps you choose an organization. Use `inth login --no-browser` to open the printed approval URL yourself. Run `inth --help` for command groups and `inth <command> --help` for relevant options and examples.

## Development

Run these commands from the repository root:

```sh
# Rebuild and run a command after editing the CLI.
pnpm --filter @inth/cli dev --help
pnpm --filter @inth/cli dev billing

# Run the current binary without rebuilding.
pnpm --filter @inth/cli inth billing
pnpm --filter @inth/cli inth billing --json
```

From `packages/cli`, the equivalents are `pnpm dev billing` and `pnpm inth billing`. `dev` rebuilds on each invocation; it does not watch files.

Development builds call the live API at `https://api.inth.com` by default. For local auth.md testing, configure the API and Dashboard origins using the [local API setup](docs/agent-auth-integration.md#test-against-a-local-api). Commands that create, update, or delete resources take effect immediately.

Local rebuilds can trigger another Keychain prompt because ad hoc signing changes the executable's identity. Reuse the built binary between edits, or configure a stable signing identity using the [Keychain guide](docs/authentication.md#repeated-macos-keychain-prompts).

### Checks

```sh
# Lint, typecheck, unit tests, and compiled native tests.
pnpm check

# Run individual checks while developing.
pnpm test:unit
pnpm --filter @inth/cli typecheck
pnpm --filter @inth/cli test

# Build, pack, and verify the distributed executable.
pnpm --filter @inth/cli test:package
```

The terminal tests require Python 3. Automated authentication tests use fake credentials and isolated state. The package check extracts the npm archive and runs its native executable with an empty `PATH` to check that it works without Node.js.

### Source layout

| Location | Purpose |
| --- | --- |
| [`src/inth.ts`](src/inth.ts) | Production entry point |
| [`src/native/`](src/native/README.md) | Native HTTP, Keychain, terminal, and filesystem adapters |
| `src/*.ts` | Shared argument parsing, OAuth flow, resource commands, and output formatting |
| `test/native/` | Fixtures compiled and run by the native test suite |
| [`experiments/`](experiments/README.md) | Node and yao-pkg reference implementations and benchmarks |
| `bench/` | Benchmark workloads and results |

Scriptc compiles the production CLI. Node and yao-pkg remain benchmark experiments with separate credential stores. See the [experiment guide](experiments/README.md) for their build commands and the [authentication](bench/AUTH.md) and [organization picker](bench/SWITCH.md) benchmark results.

The resource commands follow [public API PR #1756](https://github.com/inthhq/monorepo/pull/1756) at commit `4e1d272f71971f7470bcbe25ce261472d7f0af16`. API types and response validation are maintained manually against the [OpenAPI schema](https://api.inth.com/openapi.json).

## Sign in from an agent

Use `inth login --email <email> --json` to sign in, or `inth signup --email <email> --json` to create an account. Tell the person which email and permissions Inth will receive, and run these commands after they agree. The command itself confirms sending those details, so it does not require `--yes`. It returns an approval link and code. Give both to the person. They sign in or create their account in the browser, then approve access. Immediately run `inth login --complete --wait --json` in a background terminal. It waits for browser approval, finishes sign-in, and selects the connection for subsequent commands. Results include `nextStep.command` and `nextStep.instruction`. A timeout or Ctrl+C between polls preserves the pending sign-in; run the waiting command again to resume. An interrupted single-use exchange can return `claim_uncertain`, which requires disconnecting and starting a new claim.

For c15t provisioning, request `--scopes organizations.read,organizations.write,projects.read,projects.write`. General API access requires the accompanying backend deployment. See [auth.md sign-in](docs/agent-auth-integration.md) for approval, storage, expiry and deployment requirements.

## Sign-in and organizations

```sh
inth login
inth whoami
inth auth status
inth auth refresh
inth logout
```

`whoami` checks your identity and granted scopes with the API. `auth status` checks the local credential source without contacting the API. Saved browser sessions refresh automatically when needed. If an older session lacks Code Audit, Inbox, or billing scopes, run `inth login` again to approve them.

```sh
# Choose your default organization with the arrow keys.
inth switch

# Select by ID or slug, or link the current directory.
inth switch acme
inth link acme

# Override the organization for one command.
inth project list --organization org_123
```

Organization-owned lists and creates use `--organization`, then the nearest `.inth/project.json`, then your saved default. If none is set, the API uses its active organization. `link` saves only an organization ID in the directory; it does not create a project.

Commands targeting a resource ID resolve ownership on the server and reject `--organization`. Scan starts use `--repository`. Organization and region commands do not use your local default.

To create an organization and select it:

```sh
inth org create --name Acme --slug acme
inth switch acme
```

For automation, supply an organization API key through `INTH_TOKEN` or `--token`. The flag takes precedence. Supplied keys are never saved or refreshed. API keys can manage projects and read organizations, API keys, Inbox, and billing. Use browser sign-in for other operations.

See [authentication and credential storage](docs/authentication.md) for OAuth scopes, token refresh, passkeys, and Keychain troubleshooting.

For an agent to provision a hosted consent project and integrate it into an application, follow [the c15t setup guide](docs/c15t-setup.md). It uses a saved CLI connection and includes a repeatable browser verification check.

## Agent skills

Browse Inth's bundled skill catalog with the native picker. Installation uses the official [skills CLI](https://github.com/vercel-labs/skills) and requires Node.js and npm on your PATH.

The installer is pinned to `skills@1.5.25`, so a different project-local version cannot change the installation flow. Update the pin alongside the installer compatibility checks when adopting a new upstream release.

The [inrepo and Scriptc assessment](./experiments/skills/README.md) pins and tests the upstream source. Vendoring works, but the tested compiler rejects both the full CLI and the installer entry point. Run `pnpm --filter @inth/cli assess:skills` to reproduce the results.

```sh
inth skills
inth skills c15t/skills --skill c15t
inth skills owner/repo --agent claude-code --global --yes
inth skills --list
inth skills --list --json
```

`inth skills` opens a picker with the same arrow-key, Enter, and Escape controls as the organization switcher. The catalog currently contains `c15t`, with consent management guidance for React, Next.js, and JavaScript. The catalog ships with the CLI and requires no network request or Node process to display. `--list` prints it without prompts, and `--list --json` returns `data.skills` for scripts. Add new Inth skills in `src/skills-catalog.ts` as they are published.

After selection, Inth runs `npx --yes skills@1.5.25 add <owner/repo> --skill <name>` in your current directory. The official installer handles agent and location choices. An explicit `owner/repo`, `--skill`, `--yes`, or `--all` bypasses the native picker. Without a source, direct installation defaults to `c15t/skills`. Installer options pass through, including multiple `--skill` and `--agent` values. Known value options also accept `--option=value`. To choose multiple agents before the command, repeat `--agent`, for example `inth --agent claude-code --agent cursor skills --yes`. A repository can follow leading flags, as in `inth skills --global owner/repo --yes`; place it before unknown options whose value count is not known. `inth skills add <owner/repo>` also works. Use `inth skills owner/repo --list` to inspect another repository through the official installer.

The first `--yes` lets npx obtain the installer; installation still prompts unless you pass `--yes` or `--all`. For unattended installation, use `inth skills --non-interactive --yes --skill c15t --agent claude-code`. Installation emits upstream terminal output and preserves the installer's exit code. JSON is available for the bundled catalog and help, not installation or listing an explicit repository.

The official installer's telemetry attributes c15t installs to [c15t on skills.sh](https://www.skills.sh/c15t/skills/c15t), subject to its telemetry settings and leaderboard processing. `DO_NOT_TRACK` and `DISABLE_TELEMETRY` pass through unchanged. The installer environment omits `INTH_TOKEN`, including case variants. Inth's own telemetry follows `inth telemetry` preferences and records the command outcome, `skills_source` as `catalog`, `c15t/skills`, or `other`, and `skills_operation` as `browse`, `add`, or `list`. These measure command outcomes, not verified per-skill installs: the upstream installer can exit successfully after a cancelled prompt or partial installation.

## Inth MCP

Configure Inth's OAuth MCP server in fx, Codex, Claude Code, Cursor, VS Code, OpenCode, and other MCP clients:

```sh
inth mcp
inth mcp setup --agent cursor --scope project
inth mcp setup --agent fx --scope global
inth mcp setup --agent codex --scope global --dry-run --json
inth mcp list --scope project --json
inth mcp remove --agent cursor --scope project --json
```

Bare `inth mcp` asks for a client and project or global scope. Clients that only support global configuration skip the scope picker. Scripts must supply `--agent` and `--scope` for setup and removal. Listing defaults to clients that support project scope; `--scope global` lists all supported clients.

Supported clients are `codex`, `claude-code`, `cursor`, `vscode`, `opencode`, `fx`, `antigravity`, `cline`, `cline-cli`, `gemini-cli`, `github-copilot-cli`, `grok-build`, `kilo-code`, `kimi-code`, `kiro-cli`, `mastracode`, `mcporter`, `pi`, `windsurf`, and `zed`. Antigravity, Cline, Cline CLI, and Windsurf require `--scope global`.

fx global setup writes `~/.fx/mcp.json`. Run `/mcp reload`, then `/mcp auth inth --open` in fx. Project setup writes `.mcp.json`; trust the project's server in fx before signing in. Pi requires `pi-mcp-adapter`; setup prints its install command. Kimi Code requires a trusted folder for project configuration.

Claude Desktop remote servers must be added through the app's Settings > Connectors. Goose's YAML configuration is not supported by this command yet.

Setup writes `https://api.inth.com/mcp` and prints the next command for your client. For Codex, run `codex mcp login inth`; for Claude Code, `claude mcp login inth`; for OpenCode, `opencode mcp auth inth`. Cursor and VS Code get a launch command and the steps to sign in from the editor. The client owns the OAuth flow; CLI tokens and API keys are never copied into the config. Setup reports configuration changes, not a verified connection.

Codex global setup uses `CODEX_HOME` when set, otherwise `~/.codex`. The summary identifies an active `CODEX_HOME` profile. Run the login command in the same terminal so it uses the same profile. If Codex reports a missing server, run `inth mcp list --agent codex --scope global --json` to inspect the full config path, then `codex mcp get inth` to check what Codex can see. Project setup writes `.codex/config.toml`; Codex only loads project configuration in trusted projects.

Edits preserve unrelated settings and comments. Repeating setup leaves an existing Inth entry unchanged, including its custom options. If another server occupies the name `inth`, the command fails without overwriting it. Removal supports ordinary Codex `[mcp_servers.inth]` tables and their subtables; inline or dotted-key layouts that cannot be safely removed require an edit in the client. `--dry-run` previews changes without writing files.

Client mappings are adapted from the pinned [add-mcp source](vendor/add-mcp/UPSTREAM.md). Native TOML validation uses the pinned [tomlc99 parser](vendor/tomlc99/UPSTREAM.md). Their license notices ship with each package.

## Public resource commands

| Command | Operation |
| --- | --- |
| `org list`, `org get <id>`, `org create` | List, read, or create organizations |
| `region list` | List project region IDs |
| `project list`, `project get <id>` | Read projects, including consent settings |
| `project create --name <name> --region <id>` | Create a project |
| `project update <id>`, `project delete <id>` | Update or delete a project |
| `member list`, `member update <id> --role <role>` | Read members or change a role |
| `member remove <id>` | Remove a member |
| `invitation list`, `invitation create --email <email> --role <role>` | Read pending invitations or send an invitation |
| `invitation cancel <id>` | Cancel a pending invitation |
| `api-key list`, `api-key create --name <name>` | List or create organization API keys |
| `api-key roll <id>`, `api-key delete <id>` | Rotate or revoke a key |
| `billing` | Read the organization's plan and credit balance |
| `code-audit repositories` | List connected repositories |
| `code-audit scans` | List scans, optionally with `--repository` and `--status` |
| `code-audit start --repository <id>` | Start a scan of the repository's production branch |
| `code-audit request <preparation-id> --repository <id>` | Check a delayed scan request |
| `code-audit get <id>`, `code-audit issues <id>` | Read a scan or its report |
| `code-audit unlock <id>` | Spend credits to unlock a report |
| `inbox list`, `inbox get <id>` | Read findings, optionally filtering the list with `--status` |
| `inbox update <id> --status <status> --item-version <version>` | Change a finding's status |
| `inbox github-issue <id>` | Create a GitHub issue for a finding |

List commands return one page. `--limit` defaults to 50 and accepts 1 through 100. Pass the returned cursor unchanged to `--cursor` for the next page.

```sh
inth project list --limit 20
inth project list --limit 20 --cursor '<nextCursor>'
inth region list
inth project create --name Website --region '<region-id>' \
  --branding inth --trusted-origins '["example.com", "*.example.com"]'
inth project update prj_123 --name 'Marketing site' --branding c15t
inth project update prj_123 --data '{"description":null,"consent":{"trustedOrigins":[]}}'
```

Replace the example IDs with IDs returned by the API. Project writes accept `--branding inth|c15t|none` and a JSON array for `--trusted-origins`. Use `--data '<JSON object>'` instead of individual body options for nested fields or explicit null values.

### Code Audit and Inbox

```sh
inth code-audit repositories
inth code-audit start --repository repo_123 --request-id deploy_123
inth code-audit request prep_123 --repository repo_123
inth code-audit get scan_123
inth code-audit issues scan_123

inth inbox list
inth inbox get inbox_123
inth inbox update inbox_123 --status resolved --item-version 3
```

A scan start can return `starting` with a `preparationId` and `repositoryId`. Check those IDs with `code-audit request` until the state is `started` or `failed`. Each invocation checks once. Reuse the same `--request-id` when retrying a start.

Inbox updates require the version from the latest read. Supported statuses are `open`, `accepted`, `dismissed`, and `resolved`. After a version conflict, read the item again before updating it.

Writes run without confirmation prompts. Invitations send email, key rotation replaces the old key, report unlocks spend credits and require an owner, and `inbox github-issue` creates a GitHub issue. Key creation and rotation print the new secret once; save it before closing the terminal. An unresolved GitHub issue send can return 409 and require server reconciliation before another attempt.

## Output and scripting

```sh
# Formatted output for people.
inth billing
inth project list

# Full responses for scripts. The jq example requires jq.
inth billing --json
inth project list --json | jq '.data.data'
inth project list --json | jq -r '.data.pagination.nextCursor // empty'
```

Named commands show readable details and tables, with labelled rows on narrow terminals. Billing displays unlimited credits as `Unlimited`. Set `NO_COLOR=1` to disable terminal colours.

`--json` returns a versioned envelope with `schemaVersion`, `ok`, and `data`, or a structured `error` on failure. The API response sits inside `data`, including its own `data` and pagination fields. JSON mode disables prompts and browser login. Authenticate interactively first, or supply an API key.

Piping a command does not switch it to JSON. `--non-interactive` disables prompts while retaining text output. See [agents and scripts](AGENT-USAGE.md) for error handling, exit codes, and the [output schema](output.schema.json).

### Raw API requests

`api` always prints JSON. Add `--json` to wrap it in the standard CLI envelope.

```sh
inth api /v1/me
inth api /v1/projects --organization org_123 --json
inth api /v1/projects/prj_123 --method PATCH --data '{"description":null}'
```

Requests support `GET`, `POST`, `PATCH`, and `DELETE`. GET is the default. An explicit `organizationId` query parameter overrides organization defaults.

## Usage telemetry

Unexpected command errors also support Sentry reporting through the native SDK. The SDK initializes only after an unexpected error and only when a project DSN is configured. Successful commands, handled `CliError` and HTTP failures, cancellation, and recognized connection or filesystem failures do not initialize it. The same saved telemetry preference, `INTH_TELEMETRY_DISABLED`, and CI override control error reporting.

Reports contain the CLI release and source revision, OS version and architecture, fixed command name, exception category, elapsed time, output mode, and up to 12 recent operations. Operation names are fixed labels such as `credential_read` and `resource_format`. Reports also include native stack addresses and function names and the already-known signed-in user ID or installation ID. Only exact code-defined failure messages and bounded numeric credential-store status codes are included. Arbitrary error text, raw arguments, environment values, request bodies, and absolute module paths are excluded. No extra identity lookup runs for Sentry. Caught-error frames start where reporting occurs; they do not recover the original TypeScript throw location. Events explicitly mark this as `stack_origin: report_site` and `original_stack_available: false`. Grouping uses command, exception type, diagnostic code, and last operation, so the shared reporting stack does not merge distinct known failures. Unknown failures of the same type within the same operation can still group together. Crash handlers are disabled.

The report is sent once with a one-second HTTP timeout and no redirects, retries, or offline queue. Temporary SDK state is removed after the attempt. Reporting failures preserve the original command output and exit status. `src/sentry.ts` holds the public DSN; an empty DSN disables reporting. Building from source now requires CMake in addition to the existing native toolchain. The local Sentry test triggers a real credential-lock failure and saves the scrubbed event to `build/native/sentry-event-example.json` for inspection. It uses a loopback receiver and sends no live events.

Production builds enable telemetry by default. Local `pnpm build`, `pnpm dev`, and `pnpm dev:link` builds disable PostHog and Sentry entirely, including the notice and telemetry identity lookup. `inth telemetry enable` saves a preference for production builds but cannot enable reporting in a development binary. Setting `NODE_ENV=production` at runtime cannot change the build mode. The CLI prints a one-time notice to stderr on the first interactive command. To opt out or check your preference:

```sh
inth telemetry disable
inth telemetry status
# Re-enable later.
inth telemetry enable
```

Enabled installations send one `cli_command_completed` event to Inth's main PostHog project in the EU. Events identify signed-in browser users by their Inth user ID when the command accesses saved credentials. API-key usage and local commands that do not access credentials use a random installation ID. Events include the CLI library name, command name, outcome, duration, CLI version, production environment, OS, architecture, JSON and interactive mode, and the MCP client when supplied with `--agent`. Error categories come from a fixed list.

Events exclude arguments, tokens, resource and organization IDs, file paths, API request and response bodies, and error messages. Signed-in events use PostHog person profiles. Installation events disable person-profile processing and are not merged into user profiles. GeoIP enrichment is disabled for all events. The ingestion service still receives the network request's IP address.

`INTH_TELEMETRY_DISABLED=1` or a truthy `CI` value disables delivery even when enabled locally. Empty values, `0`, and `false` do not override the saved preference. Tests and benchmarks disable telemetry. Help, version, telemetry settings, and invocations rejected during argument parsing send no events.

Delivery waits at most 1.5 seconds for the HTTP request, with no retries or offline queue. An uncached user identity can require a separate API lookup with the same 1.5-second limit. The local identity cache stores the verified user ID and a SHA-256 credential fingerprint, never the credential itself. Account changes cannot reuse another credential's cached identity. Failures do not change command output or exit status. Disabling telemetry removes the local installation ID and clears the cached user ID. Logout clears the cached user ID. Enabling it again creates a new ID.

## Packaging

`pnpm build:production` explicitly enables production reporting at build time. `pnpm --filter @inth/cli package:native` uses that production build and packs the current target into `packages/cli/artifacts/`. The packer rejects development builds. `test:package` extracts that archive and checks the executable, JSON output, and MCP setup.

Once the first release is published, install `@inth/cli` with `npm install -g @inth/cli`. It selects the native package for Apple silicon Macs, Linux arm64/x64, or Windows x64. Users do not need to choose a platform package. The launcher uses Node.js; the native executable itself has no runtime npm dependencies.

CI builds, tests, and uploads all four target packages. The Release workflow publishes verified artifacts through npm trusted publishing. See [publishing with Tegami](../../.tegami/README.md) for setup and release instructions. Certificate signing will be added separately.

To cross-compile from macOS with Zig installed:

```sh
SCRIPTC_CC=zigcc SCRIPTC_TARGET=x86_64-windows-gnu pnpm --filter @inth/cli package:native
SCRIPTC_CC=zigcc SCRIPTC_TARGET=aarch64-linux-gnu.2.36 pnpm --filter @inth/cli package:native
```

A successful cross-build verifies compilation and linking. Run the native suite on the destination OS to verify runtime behavior. Linux browser sign-in needs `libsecret-1.so.0` and an unlocked Secret Service keyring. Headless users can supply `INTH_TOKEN`.
