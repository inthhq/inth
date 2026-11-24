import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { iabCommitFixtures } from '../iab-commit-fixtures';

describe('native IAB commit fixtures', () => {
	it('reproduces the checked-in strings with the reference codec', async () => {
		const fixture = JSON.parse(
			readFileSync(
				resolve(
					import.meta.dirname,
					'../../../..',
					'packages/native-protocol/iab/commit-cases.json'
				),
				'utf8'
			)
		);
		expect(await iabCommitFixtures()).toEqual(fixture);
	});
});
