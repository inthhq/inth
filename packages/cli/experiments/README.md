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

Node and yao-pkg retain Keychain service `com.inth.cli`, account `oauth`, and the original platform state directory. The production native CLI retains `com.inth.cli.scriptc`, account `oauth`, and `~/Library/Application Support/inth-scriptc`. A benchmark does not migrate a person's credentials between these stores.

## Hosted c15t setup

The [c15t browser smoke check](c15t-setup/README.md) uses a CLI-provisioned project to verify hosted consent writes, persistence and script gating in a real browser. It has isolated, pinned dependencies and uses the CLI's saved credentials only for project lookup.

## Comparisons

```sh
pnpm --filter @inth/cli bench
pnpm --filter @inth/cli bench:auth
pnpm --filter @inth/cli bench:switch
pnpm --filter @inth/cli bench:probe
```

The first command measures the complete CLIs' help startup. Auth and selector comparisons use explicit workloads with isolated test accounts or fake memberships. The old help-only compiler probe remains under `bench:probe`; its results are not native auth timings. See [auth measurements](../bench/AUTH.md) and [switch measurements](../bench/SWITCH.md).

`build-yao.ts` also accepts `--smoke`, `--auth-bench`, `--selector`, and `--live-auth` to package separate fixtures. `--live-auth` is a manual browser test that creates an isolated sign-in, exercises refresh and revocation, then removes its credentials. It does not replace the normal CLI session.

## Earlier Scriptc compatibility probes

`scriptc/` retains the pinned inrepo Zod assessment and its original results. `pnpm --filter @inth/cli assess:vendoring` reproduces it. Source validation passes; the static compilation probe intentionally exits with SC1016 for circular module initialization. See [the assessment](scriptc/README.md).

`pnpm --filter @inth/cli build:native:dynamic` attempts to compile the Node reference with Scriptc's dynamic runtime. It remains a compatibility experiment and is not the production build. The static CLI's supported native adapters live in `../src/native/`.
