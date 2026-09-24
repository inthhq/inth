# CLI experiments

The production CLI is `../src/inth.ts`, compiled statically to `../dist/inth`. The Node reference is kept here so we can compare behavior and performance against Node and yao-pkg without changing the production entry.

Run these commands from the repository root:

```sh
pnpm --filter @inth/cli build:node
pnpm --filter @inth/cli inth:node --help
pnpm --filter @inth/cli dev:node auth status

pnpm --filter @inth/cli build:yao
pnpm --filter @inth/cli inth:yao --help
pnpm --filter @inth/cli test:yao --keyring
```

Both experiments share `node/inth.ts` and its runtime adapters. They import common OAuth, argument parsing, organization selection policy, and JSON output from `../src/`. Node output is `../build/node/experiments/node/inth.js`. yao-pkg uses esbuild and SEA mode to package that source with Node 24.20.0 at `../dist-bin/yao/inth`. Neither build overwrites the production executable.

Clack, Zod, proper-lockfile, and the NAPI keyring addon are development dependencies of `@inth/cli`. They are used by these experiments and their tests; the production binary does not load them. yao-pkg bundles JavaScript, the host's keyring addon, and dependency licenses. Native addons use yao-pkg's extraction cache.

Node and yao-pkg use Keychain service `com.inth.cli.node`, account `oauth`, and an `inth-node` state directory. The production native CLI uses `com.inth.cli`, account `oauth`, and a `com.inth.cli` state directory on macOS and Windows. The two builds never share credentials.

## Tests that depend on these experiments

`pnpm test:unit` runs Vitest over `../test/*.test.ts`. Fifteen of those forty files exercise `node/` rather than the Scriptc adapters in `../src/native/`. Removing `experiments/` removes them. The production adapters (`native-api.ts`, `native-http.ts`, `native-store.ts`, `native-state.ts`, `native-resource-output.ts`, `native-ui.ts`) and the production entry are covered only by the compiled suite in `../test/native/`, run by `pnpm --filter @inth/cli test`. The experiments import shared logic from `../src/`, so these tests reach that logic indirectly, but the HTTP, credential, state, and command adapters they drive are experiment code.

Tests whose subject is experiment code. Each starts with a comment saying so.

| Test | Covers |
| --- | --- |
| `api.test.ts` | `node/api.ts`: token precedence, refresh and retry after 401, organization query parameters |
| `auth.test.ts` | `node/auth.ts`: device login, polling, refresh rotation, logout and revocation |
| `identity.test.ts` | `node/api.ts` and `node/auth.ts` for `whoami` and UserInfo requests, with `src/identity.ts` summaries |
| `create-organization.test.ts` | `node/api.ts`: organization creation, input validation, API-key rejection |
| `resource-api.test.ts` | `node/api.ts`: raw resource writes, error mapping, organization pagination |
| `http.test.ts` | `node/http.ts`: `Retry-After`, retry limits, request IDs, device deadlines |
| `transport.test.ts` | `node/http.ts` against a local HTTP server; redirect refusal |
| `store.test.ts` | `node/store.ts` `PlatformStore` and its lockfile; `node/state.ts` `OrganizationContext` resolution |
| `resource-commands.test.ts` | `node/commands.ts`: routing public resource commands to API requests |
| `resource-output.test.ts` | `node/resource-output.ts` human-readable formatting; `node/commands.ts` billing output |
| `organization-commands.test.ts` | `node/commands.ts`: organization create, list, login without memberships, approval links |
| `node-agent-reuse.test.ts` | `node/commands.ts`: skills listing without auth, single agent credential initialization |
| `commands.test.ts` | Spawns `node/inth.ts`: help, version, environment-key login, `auth status`, unsafe URLs |
| `json-cli.test.ts` | Spawns `node/inth.ts`: `--json` envelopes, machine-mode failures, exit codes |
| `organization-ui.test.ts` | Spawns `../test/fixtures/node-picker.ts`, which drives `node/organization-ui.ts` through a pseudo-terminal |

Tests whose subject is `../src/` code but that use `node/state.ts` `OrganizationContext` as a filesystem fixture. They carry no comment; replacing the fixture keeps them.

| Test | Covers |
| --- | --- |
| `agent-status.test.ts` | `src/agent-commands.ts` and `src/connection-selection.ts` `auth status` guidance |
| `connection-selection.test.ts` | `src/connection-selection.ts` connection resolution; one case asserts `OrganizationContext` persistence directly |

`../test/fixtures.ts` imports `HttpClient` and types from `node/`. Every test that imports it, including `native-protocol.test.ts` for `../src/native/native-protocol.ts`, fails to load without `experiments/`.

## Hosted c15t setup

The [c15t browser smoke check](c15t-setup/README.md) uses a CLI-provisioned project to verify hosted consent writes, persistence and script gating in a real browser. It has isolated, pinned dependencies and uses the CLI's saved credentials only for project lookup.

## Comparisons

```sh
pnpm --filter @inth/cli bench
pnpm --filter @inth/cli bench:auth
pnpm --filter @inth/cli bench:switch
pnpm --filter @inth/cli bench:cross
pnpm --filter @inth/cli bench:probe
```

The first command measures the complete CLIs' help startup: the Scriptc binary, the Node reference, the yao-pkg build, the published npm launcher (`run-published.js`, staged against a platform package under `dist-bin/launcher/`) in front of the Scriptc binary, and, when Bun is installed, the Node reference run under Bun, compiled with `bun build --compile`, and compiled with `--compile --bytecode --format=esm`. Auth and selector comparisons use explicit workloads with isolated test accounts or fake memberships. The old help-only compiler probe remains under `bench:probe`; its results are not native auth timings. `bench:cross` times `--version` for inth next to other CLIs installed on the machine (fx, Claude Code, Codex, unkey, gh, and Vercel and Wrangler pinned in `bench/cross-cli/package.json`), with a hello world per runtime for context; it uses the Bun and launcher artifacts from `bench` when they exist. See [auth measurements](../bench/AUTH.md), [switch measurements](../bench/SWITCH.md), and [cross-CLI measurements](../bench/CROSS-CLI.md).

`build-yao.ts` also accepts `--smoke`, `--auth-bench`, `--selector`, and `--live-auth` to package separate fixtures. `--live-auth` is a manual browser test that creates an isolated sign-in, exercises refresh and revocation, then removes its credentials. It does not replace the normal CLI session.

## Earlier Scriptc compatibility probes

`scriptc/` retains the pinned inrepo Zod assessment and its original results. `pnpm --filter @inth/cli assess:vendoring` reproduces it. Source validation passes; the static compilation probe intentionally exits with SC1016 for circular module initialization. See [the assessment](scriptc/README.md).

`pnpm --filter @inth/cli build:native:dynamic` attempts to compile the Node reference with Scriptc's dynamic runtime. It remains a compatibility experiment and is not the production build. The static CLI's supported native adapters live in `../src/native/`.
