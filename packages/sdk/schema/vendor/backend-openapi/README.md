# Backend OpenAPI copy

`openapi.json` is a copy of the OpenAPI document the Inth backend publishes for its `/v1` routes, and `openapi.generated.ts` holds the types generated from it. Edit neither by hand.

When the backend's document changes:

1. Replace `openapi.json` whole with the new document.
2. Regenerate the types with `pnpm --dir scripts generate:v1-openapi-types`. It writes them here and to `packages/sdk/node/src/generated/openapi.ts`, the copy `@inth/node` publishes with. `pnpm sdk:test:scripts` fails until you do.
3. Run `pnpm --filter @inth/sdk-schema check-types`. It compares the TypeScript shapes of the types with the `/v1` schemas in `src/api/v1/` and names every field they disagree on, and every exception in `src/api/v1/__tests__/openapi-conformance.type-test.ts` the new document no longer needs.
4. Run `pnpm --filter @inth/node check-types`, which fails when a response schema in `packages/sdk/node/src/index.ts` and the types stop being assignable to each other. A change that stays assignable, such as a new optional field, passes, so read the diff of each response the client reads.
5. Run the schema tests. `src/api/v1/__tests__/openapi-constraints.test.ts` compares four rules the types cannot show with the SDK's constants: the `property` pattern and length, the number of acceptances, the document type pattern, and the non-empty identity provider. Check any other pattern or limit the new document changes by hand.
