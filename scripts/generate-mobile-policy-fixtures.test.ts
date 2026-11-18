import { expect, it } from 'vitest';

import { staleMobilePolicyFixtures } from './generate-mobile-policy-fixtures';

it('keeps the bundled policy fixtures in step with the exporter', async () => {
	expect(await staleMobilePolicyFixtures()).toEqual([]);
});
