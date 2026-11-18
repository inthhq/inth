import { describe, expect, it } from 'vitest';

import {
	consentInputsToOverrides,
	extractConsentRequestInputs,
	parseGlobalPrivacyControl,
	CONSENT_REQUEST_HEADER_NAMES,
} from './geo-headers';

describe('extractConsentRequestInputs', () => {
	it('x-c15t-* overrides always beat infrastructure headers', () => {
		const headers = new Headers({
			'cf-ipcountry': 'FR',
			'cf-region-code': 'IDF',
			'x-c15t-country': 'DE',
			'x-c15t-region': 'BE',
			'x-vercel-ip-country': 'US',
			'x-vercel-ip-country-region': 'CA',
		});
		const inputs = extractConsentRequestInputs(headers);
		expect(inputs.country).toBe('DE');
		expect(inputs.region).toBe('BE');
	});

	it('resolves infra precedence cloudflare → vercel → cloudfront → generic', () => {
		expect(
			extractConsentRequestInputs(
				new Headers({ 'cf-ipcountry': 'FR', 'x-vercel-ip-country': 'US' })
			).country
		).toBe('FR');
		expect(
			extractConsentRequestInputs(
				new Headers({ 'x-amz-cf-ipcountry': 'BR', 'x-country': 'GB' })
			).country
		).toBe('BR');
	});

	it('accepts plain header records (lowercase keys)', () => {
		const inputs = extractConsentRequestInputs({
			'sec-gpc': '1',
			'x-c15t-country': 'NL',
		});
		expect(inputs.country).toBe('NL');
		expect(inputs.gpc).toBe(true);
	});

	it('negotiates language with q-values and returns the primary subtag', () => {
		const inputs = extractConsentRequestInputs(
			new Headers({ 'accept-language': 'en;q=0.1, de-DE;q=0.9' })
		);
		expect(inputs.language).toBe('de');
	});

	it('parses sec-gpc strictly', () => {
		expect(parseGlobalPrivacyControl('1')).toBe(true);
		expect(parseGlobalPrivacyControl('0')).toBe(false);
		expect(parseGlobalPrivacyControl('yes')).toBeUndefined();
		expect(parseGlobalPrivacyControl(null)).toBeUndefined();
	});

	it('caller overrides beat everything', () => {
		const inputs = extractConsentRequestInputs(
			new Headers({ 'x-c15t-country': 'DE' }),
			{ country: 'JP' }
		);
		expect(inputs.country).toBe('JP');
	});
});

describe('consentInputsToOverrides', () => {
	it('drops absent fields and keeps gpc=false', () => {
		expect(consentInputsToOverrides({ country: 'DE', gpc: false })).toEqual({
			country: 'DE',
			gpc: false,
		});
		expect(consentInputsToOverrides({})).toEqual({});
	});
});

describe('GPC override header', () => {
	it('x-c15t-gpc wins over the browser sec-gpc signal', () => {
		expect(
			extractConsentRequestInputs({ 'sec-gpc': '1', 'x-c15t-gpc': '0' }).gpc
		).toBe(false);
		expect(extractConsentRequestInputs({ 'sec-gpc': '1' }).gpc).toBe(true);
		expect(extractConsentRequestInputs({ 'x-c15t-gpc': '1' }).gpc).toBe(true);
		expect(CONSENT_REQUEST_HEADER_NAMES).toContain('x-c15t-gpc');
	});
});
