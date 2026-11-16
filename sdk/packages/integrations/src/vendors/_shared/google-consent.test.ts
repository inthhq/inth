import { describe, expect, it } from 'vitest';

import {
	GOOGLE_CONSENT_MODE_V2_DEFAULT_MAPPING,
	GOOGLE_CONSENT_TYPES,
	withOptionalConsentMapping,
} from './google-consent';

describe('google consent helpers', () => {
	it('exposes the shared Consent Mode v2 mapping', () => {
		expect(GOOGLE_CONSENT_MODE_V2_DEFAULT_MAPPING).toEqual({
			experience: ['personalization_storage'],
			functionality: ['functionality_storage'],
			marketing: ['ad_storage', 'ad_user_data', 'ad_personalization'],
			measurement: ['analytics_storage'],
			necessary: ['security_storage'],
		});
	});

	it('maps every Consent Mode v2 type exactly once', () => {
		expect(
			Object.values(GOOGLE_CONSENT_MODE_V2_DEFAULT_MAPPING).flat().sort()
		).toEqual([...GOOGLE_CONSENT_TYPES].sort());
	});

	it('returns the original manifest when no override is provided', () => {
		const manifest = {
			consentMapping: GOOGLE_CONSENT_MODE_V2_DEFAULT_MAPPING,
			vendor: 'gtag',
		};

		expect(withOptionalConsentMapping(manifest, undefined)).toBe(manifest);
	});

	it('returns a manifest with an override mapping when provided', () => {
		const manifest = {
			consentMapping: GOOGLE_CONSENT_MODE_V2_DEFAULT_MAPPING,
			vendor: 'gtag',
		};
		const consentMapping = {
			measurement: ['analytics_storage'],
		};

		expect(withOptionalConsentMapping(manifest, consentMapping)).toEqual({
			consentMapping,
			vendor: 'gtag',
		});
	});
});
