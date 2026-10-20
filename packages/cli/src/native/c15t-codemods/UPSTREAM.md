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
- `scripts-to-integrations` and `dev-tools-to-c15t` find module specifiers with the shared `moduleSpecifiersOf` helper in `source-edits.ts`. It covers imports, re-exports, `import()`, import types, `import x = require()`, `require()` (including one made by `createRequire`), `require.resolve()`, and `vi.mock()`, `jest.mock()` and the other test-runner helpers `packages-to-c15t` recognizes. Upstream's `scripts-to-integrations` rewrites only imports, re-exports, `import()`, `require()` and import types. Upstream's `dev-tools-to-c15t` rewrites only imports, re-exports and `import()`.
- `dev-tools-to-c15t` removes the `namespace` prop from `<D.DevTools />` and `D.c15tDevtoolsPlugin({...})` when `D` is a namespace or default import of a dev-tools entry, and adds its TODO when a removed `@c15t/dev-tools` helper is reached through a namespace import. Upstream follows named imports only.
- `consent-provider-options`, `callbacks-to-v3`, `theme-to-consent-theme` and `iab-option-to-iab-provider` also find options passed to `c15t.getOrCreateConsentRuntime({...})` through a namespace import. Upstream finds the runtime factory only through a named import.
- `policy-packs-to-policy-rules` renames the `c15t.PolicyPackPresets` type through a namespace import, and renames re-exports such as `export { policyPackPresets } from 'c15t'`, keeping the exported name with an alias. Upstream renames neither.
- `use-consent-manager-to-hooks` migrates `c15t.useConsentManager()` reached through a namespace import of a hooks entry. It adds the named hook imports and keeps the namespace import. Upstream follows named imports only.
- `policy-packs-to-policy-rules` adds a TODO when `policyPackPresets` is reached through a namespace import of a React or Next.js entry, such as `import * as c15t from 'c15t/react'`. Those entries no longer export presets. Upstream skips the access without a TODO.
- `use-consent-manager-to-hooks` leaves a residual `useConsentManager()` call alone when it already has the "Migrate these fields by hand" TODO. Upstream adds the TODO again on each run. It also migrates every `useConsentManager` import in a file, such as one from `c15t/react` and an aliased one from `c15t/react/headless`, in one run. Upstream migrates the first per run. When the entry already imports a replacement hook under an alias, such as `useConsents as getConsents`, it adds the unaliased name too. Upstream treats the hook as imported and calls an undefined `useConsents()`.
- A source file the parser can't read, such as one with merge conflict markers, is skipped with a warning. TypeScript parses past syntax errors, so upstream runs its codemods on such a file instead.
- Lookup tables are `Map`s instead of objects, so a name such as `constructor` no longer matches an `Object.prototype` member.
- Results use inth's JSON envelope. `data` keeps upstream's shape.
- The `migration_failed` message lists the files already changed, since the error replaces the results. Upstream says "Some files may have changed".

Not ported: `backend-config-to-v3`, `node-sdk-to-v3`, and the v1 to v2 codemods.
