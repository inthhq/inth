# Native runtime adapters

These are the production CLI's Scriptc adapters. The main entry is `../inth.ts`; shared OAuth, argument parsing, organization policy, and output contracts live alongside it. Build with `pnpm --filter @inth/cli build`, which compiles statically without `--dynamic` and writes `dist/inth`.

The build pins Scriptc 0.0.36, compiles the C adapters with warnings treated as errors, and links macOS Security, CoreFoundation, and libcurl. The FFI manifest is generated under `build/native/` using SDK paths discovered on the host.

`native-protocol.ts` uses Scriptc's checked JSON casts, which validate record fields at runtime. It also checks URLs, bearer type, nonempty tokens, and positive finite lifetimes. Do not execute this parser under Node: ordinary TypeScript assertions do not validate JSON. The Node reference under `experiments/node/` uses Zod.

The Keychain adapter copies credential bytes through a call-scoped FFI callback. Locks use nonblocking flock, reject symlinks and unsafe permissions, and close their descriptors after use. Credentials remain under service `com.inth.cli.scriptc`, account `oauth`; private state remains at `~/Library/Application Support/inth-scriptc` to preserve existing sign-ins. Tokens are never written to state or project files.

The native terminal adapter supplies the input and cursor operations Scriptc lacks. Selection polls with bounded waits, yields for abort handling, writes to stderr, and restores the terminal on completion or cancellation. Node and yao-pkg use Clack.

Scriptc retains completed timeout signals, so the CLI explicitly exits after awaited work and cleanup. Tests under `test/native/` must be compiled; the package's default test command builds them with `build-scriptc.ts --tests` and runs isolated credentials, scripted OAuth, actual local HTTP, and PTY scenarios.

Do not route the production executable through a Node launcher or import the experimental runtime adapters here. Keep runtime differences in these adapters so command behavior remains comparable across benchmarks.
