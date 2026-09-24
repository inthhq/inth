# Native runtime adapters

These are the production CLI's Scriptc adapters. The main entry is `../inth.ts`; shared OAuth, argument parsing, organization policy, and output contracts live alongside it. Build with `pnpm --filter @inth/cli build`, which compiles statically without `--dynamic` and writes `dist/inth`.

The build pins Scriptc 0.0.36 and compiles first-party C adapters with warnings treated as errors. macOS links Security and CoreFoundation. Linux loads libsecret only for credential operations. Windows uses Credential Manager, Win32 file locks and private ACLs, ShellExecute, and console input events. HTTP date parsing is shared C; network requests use Scriptc's native fetch.

`SCRIPTC_CC=zigcc SCRIPTC_TARGET=<triple>` selects a cross-build. Native FFI manifests are generated under `build/native/`, or `build/native-<platform>-<arch>/` for cross-builds. The same selected target compiles the FFI objects and the Scriptc executable. See the package README for supported targets and toolchains.

MCP setup uses source-preserving JSONC/TOML edits with per-file locks and atomic replacement. The small vendored TOML parser validates both sides of each TOML edit. No Node launcher or dynamic JS runtime is included in distribution packages.

`native-protocol.ts` uses Scriptc's checked JSON casts, which validate record fields at runtime. It also checks URLs, bearer type, nonempty tokens, and positive finite lifetimes. Do not execute this parser under Node: ordinary TypeScript assertions do not validate JSON. The Node reference under `experiments/node/` uses Zod.

The Keychain adapter copies credential bytes through a call-scoped FFI callback. Locks use nonblocking flock, reject symlinks and unsafe permissions, and close their descriptors after use. Credentials live under service `com.inth.cli`, account `oauth`; private state on macOS lives at `~/Library/Application Support/com.inth.cli`. Tokens are never written to state or project files.

The native terminal adapter supplies the input and cursor operations Scriptc lacks. Selection polls with bounded waits, yields for abort handling, writes to stderr, and restores the terminal on completion or cancellation. Node and yao-pkg use Clack.

Scriptc retains completed timeout signals, so the CLI explicitly exits after awaited work and cleanup. Tests under `test/native/` must be compiled; the package's default test command builds them with `build-scriptc.ts --tests` and runs isolated credentials, scripted OAuth, actual local HTTP, and PTY scenarios.

Do not route the production executable through a Node launcher or import the experimental runtime adapters here. Keep runtime differences in these adapters so command behavior remains comparable across benchmarks.
