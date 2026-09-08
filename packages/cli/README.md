<h1 align="center">inth CLI</h1>

<p align="center">Manage your Inth organizations, projects, Code Audit, and Inbox from the terminal.</p>

<p align="center">
  <a href="#get-started"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/badge/Status-In%20development.svg?variant=outline&size=xs&mode=dark"><img src="https://shieldcn.dev/badge/Status-In%20development.svg?variant=outline&size=xs&mode=light" alt="Status: in development"></picture></a>
  <a href="#get-started"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/badge/Platform-macOS%20arm64.svg?variant=outline&size=xs&mode=dark"><img src="https://shieldcn.dev/badge/Platform-macOS%20arm64.svg?variant=outline&size=xs&mode=light" alt="Platform: macOS arm64"></picture></a>
  <a href="../../LICENSE"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/badge/License-Apache%202.0.svg?variant=outline&size=xs&mode=dark"><img src="https://shieldcn.dev/badge/License-Apache%202.0.svg?variant=outline&size=xs&mode=light" alt="License: Apache 2.0"></picture></a>
  <a href="https://inth.com?utm_source=github&utm_medium=repo_homepage"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/badge/Made%20By-Inth-ffc803.svg?size=xs&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGZpbGw9Im5vbmUiIHZpZXdCb3g9IjAgMCAzOTMgNDAwIj48cGF0aCBmaWxsPSIjMDAwIiBkPSJNMTgyLjY2MiAwdjM2Ljg5NWgtNTkuMDMxdjgyLjczM2g1OS4wMzF2MzYuODkzSDI3LjQ4MnYtMzYuODkzaDU5LjAzVjM2Ljg5NWgtNTkuMDNWMHpNMzIxLjk0MSA4OS44NVYwaDM1LjM1NXYxNTYuNTIxaC0yNS43MTNsLTg2LjEzNy05MC4zNjR2OTAuMzY0aC0zNS4zNTVWMGgyNi4zNTV6Ii8%2BPHBhdGggZmlsbD0iIzAwMCIgZmlsbC1ydWxlPSJldmVub2RkIiBkPSJNMzE4LjU3MSAxODUuNzE0aDc0LjI4NlY0MDBIMFYxODUuNzE0aDI3Mi44NTd2LTQ3LjE0M3ptLTI5MS4wOSAyOC45Njl2MzcuMTE4aDU4LjEzN3YxMTkuNjI4aDM2Ljg5NVYyNTEuODAxaDU4LjU4NHYtMzcuMTE4em0xODIuNjEuMjI0djE1Ni41MjJoMzYuODk0VjMxMy41OWg3My4zNDF2NTcuODM5aDM3LjExOFYyMTQuOTA3aC0zNy4xMTh2NjEuNzg4aC03My4zNDF2LTYxLjc4OHoiIGNsaXAtcnVsZT0iZXZlbm9kZCIvPjwvc3ZnPg%3D%3D&color=ffc803&labelTextColor=000000&valueColor=000000&mode=dark"><img src="https://shieldcn.dev/badge/Made%20By-Inth-ffc803.svg?size=xs&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGZpbGw9Im5vbmUiIHZpZXdCb3g9IjAgMCAzOTMgNDAwIj48cGF0aCBmaWxsPSIjMDAwIiBkPSJNMTgyLjY2MiAwdjM2Ljg5NWgtNTkuMDMxdjgyLjczM2g1OS4wMzF2MzYuODkzSDI3LjQ4MnYtMzYuODkzaDU5LjAzVjM2Ljg5NWgtNTkuMDNWMHpNMzIxLjk0MSA4OS44NVYwaDM1LjM1NXYxNTYuNTIxaC0yNS43MTNsLTg2LjEzNy05MC4zNjR2OTAuMzY0aC0zNS4zNTVWMGgyNi4zNTV6Ii8%2BPHBhdGggZmlsbD0iIzAwMCIgZmlsbC1ydWxlPSJldmVub2RkIiBkPSJNMzE4LjU3MSAxODUuNzE0aDc0LjI4NlY0MDBIMFYxODUuNzE0aDI3Mi44NTd2LTQ3LjE0M3ptLTI5MS4wOSAyOC45Njl2MzcuMTE4aDU4LjEzN3YxMTkuNjI4aDM2Ljg5NVYyNTEuODAxaDU4LjU4NHYtMzcuMTE4em0xODIuNjEuMjI0djE1Ni41MjJoMzYuODk0VjMxMy41OWg3My4zNDF2NTcuODM5aDM3LjExOFYyMTQuOTA3aC0zNy4xMTh2NjEuNzg4aC03My4zNDF2LTYxLjc4OHoiIGNsaXAtcnVsZT0iZXZlbm9kZCIvPjwvc3ZnPg%3D%3D&color=ffc803&labelTextColor=000000&valueColor=000000&mode=light" alt="Made by Inth"></picture></a>
</p>

The `@inth/cli` package provides the `inth` command. Named commands print formatted text by default. Add `--json` for scripts and agents.

This package is in development and has not been published to npm. The current build supports macOS on Apple Silicon.

[Get started](#get-started) · [Commands](#public-resource-commands) · [Development](#development) · [Agents and scripts](AGENT-USAGE.md)

## Get started

You need Node.js 24, pnpm, and Xcode Command Line Tools. Use the pnpm version declared in the repository's `packageManager` field.

From the repository root:

```sh
pnpm install
pnpm --filter @inth/cli build
pnpm --filter @inth/cli inth --help
```

The build produces `packages/cli/dist/inth`, a standalone executable with no Node.js runtime dependency. To use the shorter commands in this guide, add an alias for your current shell:

```sh
alias inth="$PWD/packages/cli/dist/inth"
inth login
inth whoami
inth billing
```

`login` opens your browser for approval, saves the session in macOS Keychain, and helps you choose an organization. Use `inth login --no-browser` to open the printed approval URL yourself. Run `inth --help` for the full command and option list.

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

Development builds call the live API at `https://api.inth.com`. There is no local API URL override. Commands that create, update, or delete resources take effect immediately.

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

## Packaging

`pnpm --filter @inth/cli test:package` verifies the package without publishing it. The npm `inth` entry points directly to `dist/inth`; `prepack` builds it for macOS arm64. Public distribution still needs release signing, notarization, and support for other platforms.
