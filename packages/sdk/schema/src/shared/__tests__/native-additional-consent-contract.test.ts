import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import { postSubjectInputSchema } from '../../api/subject/post';
import { ADDITIONAL_CONSENT_V2_PATTERN } from '../ad-tech-provider';

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
const evidenceDirectory = process.env.C15T_AC_SAVE_EVIDENCE_DIR;

describe('native Additional Consent backend contract', () => {
	it('uses official AC v2 examples accepted by the backend format', () => {
		for (const row of fixture.cases) {
			expect(row.expected).toMatch(ADDITIONAL_CONSENT_V2_PATTERN);
		}
	});

	it.skipIf(!evidenceDirectory)(
		'validates actual Swift and Kotlin outgoing bodies against the save schema',
		() => {
			if (!evidenceDirectory) {
				throw new Error('Run native suites with C15T_AC_SAVE_EVIDENCE_DIR.');
			}
			for (const platform of ['swift', 'kotlin']) {
				for (const row of fixture.cases) {
					const body = v.parse(
						postSubjectInputSchema,
						JSON.parse(
							readFileSync(
								resolve(evidenceDirectory, `${platform}-${row.id}.json`),
								'utf8'
							)
						)
					);
					expect(body.model).toBe('iab');
					expect(body.tcString).toBeTruthy();
					expect(body.addtlConsent).toBe(row.expected);
				}
			}
		}
	);
});
