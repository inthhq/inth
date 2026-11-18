# Backend OpenAPI copy

`openapi.json` is a copy of the OpenAPI document the Inth backend publishes for its `/v1` routes, and `openapi.generated.ts` holds the types generated from it. Edit neither by hand.

When the backend's document changes:

1. Replace `openapi.json` whole with the new document.
2. Regenerate the types with `pnpm --dir scripts generate:v1-openapi-types`. `pnpm sdk:test:scripts` fails until you do.
3. Run `pnpm --filter @inth/sdk-schema check-types`. It compares the TypeScript shapes of the types with the `/v1` schemas in `src/api/v1/` and names every field they disagree on, and every exception in `src/api/v1/__tests__/openapi-conformance.type-test.ts` the new document no longer needs.
4. Run the schema tests. `src/api/v1/__tests__/openapi-constraints.test.ts` compares the patterns and limits the types cannot show.
