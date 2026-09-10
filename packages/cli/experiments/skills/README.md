# Skills vendoring assessment

inrepo can vendor the upstream skills CLI source. Scriptc 0.0.36 cannot compile the unmodified source tested here, including the smaller `runAdd` entry point. The production `inth skills` command still uses its native catalog picker and invokes the official installer through npx.

This experiment pins [skills 1.5.25](https://github.com/vercel-labs/skills/tree/7ffbeb96f012a63c0583a2e71e24385dc497566d) with inrepo 0.0.9. There are no source patches. inrepo vendors the skills repository; npm supplies the source's imported dependencies from the separate `package-lock.json`. This is not a vendored dependency closure.

## Reproduce

From the repository root, with Node 24, npm, Git, and the workspace dependencies installed:

```sh
pnpm --filter @inth/cli assess:skills
```

The runner was verified on macOS arm64. It syncs and verifies the pinned source, installs the isolated dependencies with lifecycle scripts disabled, typechecks both entry points, and checks upstream help and local skill discovery under Node. It then tries four compiler configurations. Compiler failures deliberately produce exit code 1.

The runner writes a summary to [assessment.json](./assessment.json) and complete diagnostics to `packages/cli/build/skills-assessment/*.log`. Generated upstream source, npm dependencies, and compiler outputs are ignored by Git. `--install-links` avoids installing upstream's development tooling through npm's file dependency symlink behavior.

## Results

| Check                            | Result                  |
| -------------------------------- | ----------------------- |
| inrepo sync and verify           | Passed                  |
| TypeScript source check          | Passed                  |
| Upstream help under Node         | Passed                  |
| Local skill discovery under Node | Passed                  |
| Full CLI, static Scriptc         | Failed, 39 diagnostics  |
| `runAdd`, static Scriptc         | Failed, 309 diagnostics |
| `runAdd`, `--npm-static auto`    | Failed, 307 diagnostics |
| `runAdd`, `--dynamic`            | Failed, 239 diagnostics |

All compiler probes use `--emit=ir`. They fail before executable generation, so this experiment produces no native installer binary or native performance measurements. Diagnostic totals include downstream errors caused by earlier failures. They are not counts of independent fixes, and the full CLI's smaller total does not mean it is easier to port.

The remaining blockers include:

- npm packages that still require the dynamic engine, including `@clack/prompts`.
- Nested maps and maps containing byte arrays in installation and download code.
- `unknown` values, union conversions, and record shapes that Scriptc cannot represent in these contexts.
- Node API usage such as `child_process.execFile`, `import.meta.url`, and incremental `crypto.createHash` handles that lacks the required compiler lowering.

`--npm-static auto` reduces dependency-boundary errors but exposes more errors inside dependency implementations. `--dynamic` removes that boundary without making all imported TypeScript or Node API usage compilable.

## Next step

Keep the native picker and upstream installation proxy for now. Vendoring the installer into the static binary needs an adaptation effort across the installer and its dependencies, or additional Scriptc support. A narrower follow-up can extract reproductions for unsupported operations and retest against a newer compiler before maintaining a fork.

No skill installation or telemetry delivery is exercised by this assessment. Both `DO_NOT_TRACK` and `DISABLE_TELEMETRY` are set for its child processes. A future vendored installer must preserve upstream install attribution, version initialization, telemetry flushing, and opt-outs, then verify the installation flow before replacing the proxy. This experiment does not establish that vendored installs appear on skills.sh.
