# Cross-CLI startup benchmarks

Measured on 21 September 2026 on Apple M5 Pro, macOS 27.0 arm64, with Node 24.21.0 and Bun 1.3.11. Thirty measured fresh processes per target follow ten warmups, with target order shuffled on every run. `CI=1` is set and telemetry is disabled wherever a switch exists. Filesystem caches are warm. Raw samples and exact commands are in [cross-cli-results.json](cross-cli-results.json).

This compares specific executables as installed on one machine. It does not isolate languages, runtimes, or the work each CLI does before it prints a version. The three hello-world rows are empty programs, one per runtime, for context. Sizes are decimal megabytes; "needs runtime" means the row runs a script under Node or Bun and has no binary of its own.

| Program | Runtime | Binary | Median | p95 |
| --- | --- | --: | --: | --: |
| hello world | Scriptc 0.0.36 | 70 KB | 1.8 ms | 2.5 ms |
| fx 0.0.8 | Zig | 6.3 MB | 2.2 ms | 2.5 ms |
| inth | Scriptc | 2.0 MB | 3.6 ms | 4.5 ms |
| unkey 2.0.150, bare binary | Go | 10.0 MB | 4.3 ms | 6.3 ms |
| claude 2.1.278 | Bun 1.4.3 | 218 MB | 6.8 ms | 7.5 ms |
| codex 0.155.1, bare binary | Rust | 229 MB | 8.1 ms | 9.1 ms |
| hello world | Bun 1.3.11, --compile | 61 MB | 8.2 ms | 9.9 ms |
| inth, source under Bun | Bun 1.3.11 | needs runtime | 12.0 ms | 14.3 ms |
| inth, --compile --bytecode | Bun 1.3.11 | 68 MB | 19.3 ms | 23.9 ms |
| hello world | Node 24.21.0 | needs runtime | 22.8 ms | 25.2 ms |
| vercel 59.16.0 | Node | needs runtime | 25.8 ms | 28.6 ms |
| inth, --compile | Bun 1.3.11 | 63 MB | 26.6 ms | 31.7 ms |
| inth, via npm launcher | Node, then Scriptc | needs runtime | 27.7 ms | 35.0 ms |
| codex 0.155.1, via npm launcher | Node, then Rust | needs runtime | 32.3 ms | 36.3 ms |
| gh 2.101.0 | Go | 40 MB | 33.4 ms | 37.3 ms |
| unkey 2.0.150, via npm launcher | Node, then Go | needs runtime | 50.3 ms | 63.8 ms |
| wrangler 4.131.1 | Node | needs runtime | 267.4 ms | 280.5 ms |

Three targets are native binaries distributed through npm: inth, Codex, and unkey. Each appears twice, once as the bare binary and once through the Node script that `npm install -g` puts on PATH. That script costs inth 24 ms, Codex 24 ms, and unkey 46 ms.

## What the harness measures

`scripts/benchmark-cross-cli.ts` builds a hello world for Scriptc, Bun, and Node, then looks for `fx`, `claude`, `codex`, `unkey`, and `gh` on PATH and for `vercel` and `wrangler` in `bench/cross-cli/node_modules`. For npm shims it also searches the installed package for the platform binary and measures that bare. Anything it cannot find is listed under "Skipped" in the output and the JSON. Rows for inth under Bun and through the npm launcher come from `pnpm bench`, which builds those artifacts.

Reproduce:

```sh
pnpm --filter @inth/cli build
pnpm --filter @inth/cli bench
(cd packages/cli/bench/cross-cli && npm install)
pnpm --filter @inth/cli bench:cross
```

Versions of the external CLIs are whatever is installed, so expect the rows to move between machines and dates.
