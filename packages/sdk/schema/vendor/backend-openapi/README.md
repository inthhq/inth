# Backend OpenAPI copy

`openapi.json` is a copy of the OpenAPI document the Inth backend publishes for its `/v1` routes. Do not edit it by hand.

Two files are generated from it, in `src/api/v1/generated/`:

- `types.ts`, the TypeScript types, by `openapi-typescript`. `@inth/node` publishes with a copy in `packages/sdk/node/src/generated/openapi.ts`.
- `schemas.ts`, Valibot schemas, by our own generator in `scripts/openapi-to-valibot.ts`. There is one schema for each component, and one for each operation's query, path parameters, request body and success response. Error responses are left out.

A generated schema accepts the JSON values the document's JSON Schema accepts, and refuses the rest. Where Valibot checks something else, `schemas.ts` uses a helper from `src/api/v1/json-schema.ts`, which has its own tests:

- `jsonObject`, `jsonRecord` and `jsonVariant` take only a plain object, from any realm. Valibot's own schemas also take an array, a `Date`, a `Map` or an object with another prototype.
- `jsonObject` and `jsonVariant` report, at its path, any own key a strict object does not declare. `v.strictObject` lets through a key an object inherits, such as `toString`.
- `jsonRecord` checks the keys `__proto__`, `prototype` and `constructor`, which `v.record` skips. Its output still leaves them out, and a loose object's output leaves out any other key named after an `Object.prototype` member. Validation is still right.
- `characters` counts a string's length in code points, as JSON Schema does. Valibot counts UTF-16 units.
- `isDateTime` follows RFC 3339: a day the calendar has, and a leap second only at 23:59:60 UTC on a month's last day. `isUri` follows RFC 3986's grammar, including its IPv6 forms, which take no zone ID.
- Patterns use the `u` flag, and a `number` must be finite.

The generator stops on anything it cannot convert exactly, and names where it is in the document. That includes:

- an unknown keyword or format
- a `oneOf` whose branches could overlap, or that has two null branches
- a `type` beside `anyOf`
- an object `const`
- `properties` beside an `additionalProperties` schema
- a property named after an `Object.prototype` member
- `allOf`, since `v.intersect` merges what each branch outputs and can refuse a value every branch accepts
- a `default` anywhere but on a plain boolean, number or string
- a `$ref` response, body or parameter
- a `2XX` status
- a query or path parameter that is not a string

To support one, change `openapi-to-valibot.ts` and add a test to `openapi-to-valibot.test.ts`. Those tests compile and run the generated code.

The `/v1` schemas in `src/api/v1/` are built on the generated ones. Each takes the generated schema and adds only what the document leaves out and the backend still applies: subject IDs in lowercase UUIDv7 or `sub_` form, lowercase idempotency keys, the `sha256:` hash pattern, a publish date on a real calendar day, an IP address in an acceptance's context, a receipt for every confirmed category, a subject ID or an external ID on each acceptance, and at least one result in a document check. The error body takes any `code`, so a code the backend adds later still parses. Init and the manifest keep the schemas they share with the 3.x routes. Each object this layer builds uses `jsonObject`, so it refuses an array too. Everything else, such as a new field, comes from the document when you regenerate.

When the backend's document changes:

1. Replace `openapi.json` whole with the new document.
2. Regenerate with `pnpm --dir scripts generate:v1-openapi`. It writes both files and the `@inth/node` copy. `pnpm sdk:test:scripts` fails until you do.
3. Run `pnpm --filter @inth/sdk-schema check-types`. `src/api/v1/__tests__/generated-schemas.type-test.ts` compares each generated schema with the type `openapi-typescript` made for it, so a mismatch is a bug in one of the two generators. `src/api/v1/__tests__/openapi-conformance.type-test.ts` compares the `/v1` schemas in `src/api/v1/` with the types. It names every field they disagree on, and every exception it lists that the new document no longer needs.
4. Run `pnpm --filter @inth/node check-types`, which fails when a response schema in `packages/sdk/node/src/index.ts` and the types stop being assignable to each other. A change that stays assignable, such as a new optional field, passes, so read the diff of each response the client reads.
5. Run the schema tests. `src/api/v1/__tests__/openapi-constraints.test.ts` compares four rules with the constants in `src/api/v1/v1-constants.model.ts`, which `@inth/sdk-core` checks without loading Valibot: the `property` pattern and length, the number of acceptances, the document type pattern, and the non-empty identity provider. Check any other pattern or limit the new document changes by hand.
