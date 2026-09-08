# Scriptc compatibility experiments

The production native CLI has moved to `src/inth.ts` and `src/native/`. Build it with `pnpm --filter @inth/cli build`; run `packages/cli/dist/inth`. This directory retains the original dependency-vendoring probes and measurements. See [the main CLI documentation](../../README.md) for active development and [the native adapter notes](../../src/native/README.md) for runtime constraints.

The [original startup results](startup-results.json) predate the full CLI and are retained as historical data. The default `bench` command now compares all three complete CLIs and writes `bench/startup-results.json`.

## Vendoring assessment

Vendoring can remove Scriptc's dynamic runtime for compatible dependency source. The [inrepo example](https://github.com/inthhq/inrepo/tree/6640b423e1592ff3da7f8f3005dca109c31befe5/examples/scriptc) demonstrates this with Commander 15.0.0 and Picocolors 1.1.1. Its seven patches change types and operations that Scriptc cannot compile, and remove unsupported Commander APIs. Copying the unmodified packages alone is insufficient.

We reproduced that example on macOS arm64 using Scriptc 0.0.36. Its static binary compiled without `--dynamic`. The example's `check.ts` reported matching output and exit codes for greeting, help, version, and invalid commands across Bun, Node, dynamic Scriptc, and static Scriptc. We installed the registry baseline before vendoring; inrepo 0.0.9 can rewrite dependency entries to local paths, so restore the example's committed package manifest when reinstalling that baseline.

## The CLI's dependency

This assessment vendors Zod 4.5.4 from commit `e8e206fa33ac5fe7ce20a2beb12d57b1cb3df653`, subtree `packages/zod`. The recipe and lockfile are committed. `inrepo_modules/` and `.inrepo/` are regenerated, ignored directories. Production imports are unchanged.

Run from the repository root:

```sh
pnpm --filter @inth/cli assess:vendoring
```

The script runs pinned inrepo 0.0.9 `sync` and `verify`, typechecks a token-validation probe against the upstream TypeScript, and invokes Scriptc 0.0.36 without `--dynamic`. It records the result in [assessment.json](assessment.json) and returns the compiler's exit status.

Source verification and TypeScript checking pass. Scriptc currently rejects `core/core.ts -> core/util.ts -> core/core.ts` with `SC1016`, because top-level initialization can execute code during the cycle. No Zod patches have been applied yet. This is the first compiler diagnostic, not evidence that fixing the cycle completes the port.

## Remaining work

The Zod source probe still fails with SC1016. Porting it remains optional: production uses checked protocol records in `src/native/native-protocol.ts`, while the Node and yao-pkg experiments retain Zod. Signed releases and additional native platforms are tracked as production CLI work.
