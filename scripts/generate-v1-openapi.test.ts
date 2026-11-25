import { expect, it } from 'vite-plus/test';

import { staleV1OpenApiFiles } from './generate-v1-openapi';

it('generates the committed /v1 OpenAPI types and schemas', async () => {
	expect(
		await staleV1OpenApiFiles(),
		'Run `pnpm --dir scripts generate:v1-openapi`'
	).toEqual([]);
});
