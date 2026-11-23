import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import { ADDITIONAL_CONSENT_V2_PATTERN } from '../ad-tech-provider.model';

const fixtureSchema = v.object({
	cases: v.array(v.object({ expected: v.string(), id: v.string() })),
});
const fixture = v.parse(
	fixtureSchema,
	JSON.parse(
		readFileSync(
			resolve(
				import.meta.dirname,
				'../../../../../native-protocol/iab/additional-consent-cases.json'
			),
			'utf8'
		)
	)
);
describe('native Additional Consent backend contract', () => {
	it('uses official AC v2 examples accepted by the backend format', () => {
		for (const row of fixture.cases) {
			expect(row.expected).toMatch(ADDITIONAL_CONSENT_V2_PATTERN);
		}
	});
});
