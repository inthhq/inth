# c15t mobile commands

Source: the mobile setup and manifest code of the c15t CLI, imported with the SDK.

This code is not part of `@inth/cli` yet. Nothing compiles, tests or publishes it, and `setup.ts` and `commands/mobile-manifest.ts` import `../core/errors` and `../context/types`, which were not imported.

Two things read files here by path:

- `scripts/export-mobile-policy.ts` imports `src/mobile/export-manifest.ts`.
- The React Native Expo plugin tests copy `src/mobile/gvl-fields.ts`.

When the commands are ported into the CLI, move the code to `packages/cli/src`, update those two readers, and delete this folder.
