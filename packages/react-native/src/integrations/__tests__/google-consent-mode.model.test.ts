import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { AllConsentNames } from '../../protocol/consent-vocabulary.model';
import {
	GOOGLE_CONSENT_MODE_CATEGORIES,
	GOOGLE_CONSENT_TYPES,
	resolveGoogleConsentMode,
} from '../google-consent-mode.model';

/**
 * The web's Consent Mode v2 mapping, through
 * `packages/native-protocol/google-consent-mode/consent-mode-v2.json`. Regenerate it
 * with `bun scripts/generate-google-consent-mode-fixture.ts`.
 */
interface Fixture {
	types: { type: string; category: string }[];
	mapping: Record<string, string[]>;
	cases: {
		id: string;
		consents: Record<AllConsentNames, boolean>;
		expected: Record<string, 'granted' | 'denied'>;
	}[];
}

const fixture = JSON.parse(
	readFileSync(
		resolve(
			dirname(fileURLToPath(import.meta.url)),
			'../../../../native-protocol/google-consent-mode/consent-mode-v2.json'
		),
		'utf8'
	)
) as Fixture;

describe('Google Consent Mode v2 mapping', () => {
	it('lists the same types, in the same order, with the same categories', () => {
		expect(
			GOOGLE_CONSENT_TYPES.map((type) => ({
				category: GOOGLE_CONSENT_MODE_CATEGORIES[type],
				type,
			}))
		).toEqual(fixture.types);
	});

	it.each(fixture.cases)(
		'matches the web for $id',
		({ consents, expected }) => {
			const state = resolveGoogleConsentMode((category) => consents[category]);
			expect(
				Object.fromEntries(
					Object.entries(state).map(([type, granted]) => [
						type,
						granted ? 'granted' : 'denied',
					])
				)
			).toEqual(expected);
		}
	);
});
