import { expect, it } from 'vitest';

import { checkV1OpenApiTypes } from './generate-v1-openapi-types';

it('generates the committed /v1 OpenAPI types', async () => {
	expect(
		await checkV1OpenApiTypes(),
		'Run `pnpm --dir scripts generate:v1-openapi-types`'
	).toBe(true);
});
