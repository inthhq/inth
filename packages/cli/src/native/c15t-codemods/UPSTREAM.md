# c15t codemods

Source: `@c15t/cli@3.1.0` (commit `45f30bd42ad1a173f46241a1b682efb5596b3cf9`), `packages/cli/src/commands/codemods` (https://github.com/c15t/c15t, Apache-2.0).

These files are ported, not vendored, so `scripts/vendor-c15t.ts` does not refresh them. Port upstream changes by hand and port their tests with them.

Copied from upstream, then changed:

- The twelve hosted-app codemods: `packages-to-c15t`, `consent-provider-options`, `root-exports-to-subpaths`, `use-consent-manager-to-hooks`, `scripts-to-integrations`, `dev-tools-to-c15t`, `policy-packs-to-policy-rules`, `callbacks-to-v3`, `theme-to-consent-theme`, `iab-option-to-iab-provider`, `css-variables-to-v3` and `postcss-tailwind3`.
- Their helpers: `source-edits.ts`, `stylesheet-imports.ts`, `manifest.ts`, `versioning.ts` and `runner.ts`.
- Their tests, in `test/c15t-codemods`. They are the spec for the port.

Written for inth:

- `syntax/`: a TypeScript and JSX parser, binder and the slice of ts-morph's API the codemods call. Scriptc cannot compile the TypeScript compiler or ts-morph. `test/c15t-codemods-parser.test.ts` checks that the parser produces the compiler's node kinds and offsets.
- `semver.ts`: the parts of npm's `semver` that `manifest.ts` uses, which Scriptc also cannot compile. Its header lists the one known difference.
- `command.ts`: the codemod list and the run loop from upstream's `index.ts`, without the interactive menu, `--all`, `--from` and `--to`.

Changes to upstream's behavior:

- `consent-provider-options` leaves `mode: 'offline'` and `offlinePolicy` as they are and adds a `TODO(c15t v3)` comment. Upstream rewrites them to `offline({ policyRules })`. inth migrates hosted apps only. Custom mode gets upstream's TODO.
- Lookup tables are `Map`s instead of objects, so a name such as `constructor` no longer matches an `Object.prototype` member.
- Results use inth's JSON envelope. `data` keeps upstream's shape.

Not ported: `backend-config-to-v3`, `node-sdk-to-v3`, and the v1 to v2 codemods.
