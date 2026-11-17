# c15t mobile manifest command

Source: the mobile manifest code of the c15t CLI, imported with the SDK. Mobile setup moved into the CLI as `inth mobile setup` (`src/native/mobile`). What is left here is the build step that fetches a project's hosted `/manifest` and writes the policy resource the iOS and Android SDKs read before their first network response.

This code is not part of `@inth/cli` yet. Nothing compiles, tests or publishes it from this package. `commands/mobile-manifest.ts` still imports c15t's `../core/errors` and `../context/types`, which were not imported.

## Why it is not an `inth` command yet

The CLI ships as one native binary built by Scriptc, with no npm runtime dependencies. The exporter needs `@c15t/schema` and `@c15t/translations`, and Scriptc 0.3.6 refuses the parts of their source it uses. `scriptc coverage --fail-on blockers` on an entry that imports them, with `@c15t/translations` mapped to its source, reports:

- `parseConsentManifest` and `parseAdTechProviderList` validate with valibot. `ConsentManifest` and the ad-tech provider type are valibot `InferOutput` types, which do not compile (SC2009), and valibot itself uses `Date.prototype.toJSON` and `isFinite` on unknown values (SC2020, SC2012).
- `readPolicyResolutionWire` and `writePolicyResolutionWire`: an object spread of a union in `policy-resolution-wire.ts` (SC1090), a record width mismatch in the same file (SC2002), and `localeCompare` with a locale argument in `canonical-order.ts` (SC2020).
- `getTranslationsData`: dynamic keyed reads and writes, and a hand-written `filter` type predicate, in `translations/src/utils.ts` (SC1090, SC2003). The same file reads the browser `window` global, which Scriptc's type world does not declare.
- `adTechProviderListUrl` uses `URLSearchParams`, which has no Scriptc lowering (SC2020).

`matchPolicyRules` compiles. Making the rest compile means changing those SDK sources, or a second, Scriptc-compatible implementation of the manifest contract in the CLI.

## What reads these files

- `scripts/export-mobile-policy.ts` imports `src/mobile/export-manifest.ts`.
- `packages/react-native/src/expo-plugin/__tests__/policy-resource.test.ts` checks that `src/mobile/gvl-fields.ts` matches the Expo plugin's copy byte for byte.

When the manifest command is ported, move the code to `packages/cli/src`, update those two readers, and delete this folder.
