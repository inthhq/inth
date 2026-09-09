# Sentry compatibility probe

This experiment tests vendoring Sentry's TypeScript SDK for the native CLI. It does not enable Sentry in the shipped CLI.

`inrepo` pins `@sentry/core@10.73.0` and its runtime dependency, `@sentry/conventions@0.16.0`, to source commits in `inrepo.lock.json`. There are no source patches. Generated vendor directories are ignored by Git.

Run from the repository root:

```sh
pnpm --filter @inth/cli assess:sentry
```

The command restores and verifies the vendor tree, typechecks the probe and imported source, and runs a Node baseline. It then compiles both probes with Scriptc 0.0.36 without `--dynamic` and writes `assessment.json`. A compiler rejection produces a nonzero exit code.

## Results

- Vendored source verification and TypeScript checks pass. The experiment disables `strictBindCallApply` for upstream uses of `Function.apply` with `arguments`. Dependency aliases point to vendored TypeScript source.
- The Node baseline captures an exception and flushes a Sentry envelope into an in-memory transport. It checks the exception message and release. The bundle defines Sentry's `__DEBUG_BUILD__` build flag as `false`. It makes no network requests.
- The unmodified SDK fails static compilation. Scriptc does not resolve the vendored conventions alias and reports unsupported browser globals in imported SDK utilities. These initial diagnostics do not establish whether resolving imports and adapting browser code would be sufficient.
- Independently of the SDK, the minimal `Error.stack` probe fails with SC2020. Scriptc explicitly reports that its runtime does not capture stack frames. A TypeScript SDK cannot recover frames that the runtime never records.

No native SDK binary was produced, so native delivery, grouping, flush behavior, opt-out behavior, executable size, and startup overhead remain untested. The dummy DSN uses `example.invalid`, and the baseline transport only stores data in memory.

For native crash reports, the next experiment should use Sentry's native C SDK through Scriptc FFI. Caught TypeScript exceptions would still need separate evaluation for useful throw-site stacks. Changes to Scriptc's stack capture are another option. Neither approach is implemented here.
