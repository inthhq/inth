import { POLICY_CONSENT_CATEGORIES } from '@inth/sdk-schema/types';
import { describe, expect, it } from 'vitest';

import { CONSENT_CATEGORIES } from '../../consent-record/types';
import {
	allConsentNames,
	consentTypes,
	displayedCategories,
} from '../consent-types';

describe('allConsentNames', () => {
	it('names every consent type, in the same order', () => {
		expect(allConsentNames).toEqual(consentTypes.map(({ name }) => name));
	});

	it('is in the schema order, which native surfaces list too', () => {
		expect(allConsentNames).toEqual(POLICY_CONSENT_CATEGORIES);
		expect(allConsentNames).toEqual(CONSENT_CATEGORIES);
	});

	it('lists experience before measurement on a preference surface', () => {
		expect(displayedCategories(['measurement', 'experience'])).toEqual([
			'necessary',
			'experience',
			'measurement',
		]);
	});
});
