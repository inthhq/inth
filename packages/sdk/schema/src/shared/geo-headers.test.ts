import { describe, expect, it } from 'vite-plus/test';

import { getRegionFromHeaders } from '../index';
import {
	consentInputsToOverrides,
	extractConsentRequestInputs,
	parseGlobalPrivacyControl,
	CONSENT_REQUEST_HEADER_NAMES,
} from './geo-headers';

describe('getRegionFromHeaders, kept for backend call sites', () => {
	it('reads x-inth-country and x-inth-region', () => {
		expect(
			getRegionFromHeaders({
				'x-inth-country': 'DE',
				'x-inth-region': 'BE',
			})
		).toEqual({ country: 'DE', region: 'BE' });
	});

	it('prioritizes x-inth-country over cf-ipcountry', () => {
		expect(
			getRegionFromHeaders({ 'cf-ipcountry': 'FR', 'x-inth-country': 'DE' })
		).toEqual({
			country: 'DE',
		});
		expect(getRegionFromHeaders({ 'cf-ipcountry': 'FR' })).toEqual({
			country: 'FR',
		});
	});

	it('returns an empty object when no geo headers are present', () => {
		expect(getRegionFromHeaders({})).toEqual({});
	});
});

describe('extractConsentRequestInputs', () => {
	it('x-inth-* overrides always beat infrastructure headers', () => {
		const headers = new Headers({
			'cf-ipcountry': 'FR',
			'cf-region-code': 'IDF',
			'x-inth-country': 'DE',
			'x-inth-region': 'BE',
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
			'x-inth-country': 'NL',
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
			new Headers({ 'x-inth-country': 'DE' }),
			{
				country: 'JP',
			}
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
	it('x-inth-gpc wins over the browser sec-gpc signal', () => {
		expect(
			extractConsentRequestInputs({ 'sec-gpc': '1', 'x-inth-gpc': '0' }).gpc
		).toBe(false);
		expect(extractConsentRequestInputs({ 'sec-gpc': '1' }).gpc).toBe(true);
		expect(extractConsentRequestInputs({ 'x-inth-gpc': '1' }).gpc).toBe(true);
		expect(CONSENT_REQUEST_HEADER_NAMES).toContain('x-inth-gpc');
	});
});
