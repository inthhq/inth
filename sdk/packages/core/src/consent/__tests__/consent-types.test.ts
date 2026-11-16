import { describe, expect, it } from 'vitest';

import { allConsentNames, consentTypes } from '../consent-types';

describe('allConsentNames', () => {
	it('names every consent type, in the same order', () => {
		expect(allConsentNames).toEqual(consentTypes.map(({ name }) => name));
	});
});
