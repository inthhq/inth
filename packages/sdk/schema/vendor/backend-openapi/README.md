# Backend OpenAPI copy

`openapi.json` is a copy of the OpenAPI document the Inth backend publishes for its `/v1` routes. Do not edit it by hand. When the backend's document changes, replace the file whole with the new one, then regenerate the types:

```sh
pnpm --dir scripts generate:v1-openapi-types
```

`openapi.generated.ts` holds the types generated from it. `pnpm sdk:test:scripts` fails when the two are out of step.

`src/api/v1/__tests__/openapi-conformance.type-test.ts` compares those types with the `/v1` schemas in `src/api/v1/`, and `pnpm --filter @inth/sdk-schema check-types` fails on any field the two disagree on. Where the document disagrees with the wire contract, or the contract leaves a field open, that file lists the field by name. After replacing the copy, remove the entries the new document no longer needs; the type check names them.
