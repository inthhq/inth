import { describe, expect, it } from 'vite-plus/test';

import {
	appendInitParams,
	applyInitParamsToHeaders,
	INIT_PARAM_HEADERS,
} from './init-request-params.model';
import {
	CONSENT_EXPERIMENT_HEADER,
	parseExperimentHeader,
} from './session-report.model';

describe('init query parameters', () => {
	it('names the header each parameter stands for', () => {
		// Server callers send these header names; a rename here silently
		// drops the input for them.
		expect(Object.fromEntries(INIT_PARAM_HEADERS)).toEqual({
			country: 'x-inth-country',
			experiment: CONSENT_EXPERIMENT_HEADER,
			gpc: 'x-inth-gpc',
			region: 'x-inth-region',
		});
	});

	it('writes every input in a fixed order and keeps a relative URL relative', () => {
		expect(
			appendInitParams('/api/inth/v1/consent/init?site=shop#top', {
				country: 'DE',
				experiment: { arm: 'a=b', id: 'banner shape' },
				gpc: false,
				region: 'BE',
			})
		).toBe(
			'/api/inth/v1/consent/init?site=shop&country=DE&region=BE&gpc=0&experiment=banner%2520shape%3Da%253Db#top'
		);
	});

	it('leaves out absent inputs, and the URL alone when there are none', () => {
		expect(appendInitParams('https://c.example/v1/consent/init', {})).toBe(
			'https://c.example/v1/consent/init'
		);
		expect(appendInitParams('', { country: 'DE' })).toBe('?country=DE');
	});

	it('replaces a parameter the URL already carries, so it appears once', () => {
		// The names are generic; an app's own init route may already use one.
		// Inth's value wins, and the app's other parameters keep their order
		// and encoding.
		const url = appendInitParams(
			'/api/consent/v1/consent/init?country=US&site=a%20b&gpc=0&tag=x#top',
			{ country: 'GB', gpc: true }
		);
		expect(url).toBe(
			'/api/consent/v1/consent/init?site=a%20b&tag=x&country=GB&gpc=1#top'
		);
		const params = new URL(url, 'https://shop.example').searchParams;
		expect(params.getAll('country')).toEqual(['GB']);
		expect(params.getAll('gpc')).toEqual(['1']);
	});

	it('leaves a parameter inth does not send for the backend to read', () => {
		const url = appendInitParams('/api/consent/v1/consent/init?region=CA', {
			country: 'US',
		});
		expect(url).toBe('/api/consent/v1/consent/init?region=CA&country=US');
		expect(
			applyInitParamsToHeaders(url, new Headers()).get('x-inth-region')
		).toBe('CA');
	});

	it('matches an encoded name in the existing query', () => {
		expect(
			appendInitParams('/v1/consent/init?%63ountry=US&gpc', { country: 'GB' })
		).toBe('/v1/consent/init?gpc&country=GB');
	});

	it('round-trips through the header names a backend reads', () => {
		const url = appendInitParams('https://c.example/v1/consent/init', {
			country: 'DE',
			experiment: { arm: 'a=b', id: 'banner shape' },
			gpc: true,
			region: 'BE',
		});
		const headers = applyInitParamsToHeaders(url, new Headers());
		expect(Object.fromEntries(headers)).toEqual({
			'x-inth-country': 'DE',
			'x-inth-experiment': 'banner%20shape=a%3Db',
			'x-inth-gpc': '1',
			'x-inth-region': 'BE',
		});
		expect(
			parseExperimentHeader(headers.get(CONSENT_EXPERIMENT_HEADER))
		).toEqual({
			arm: 'a=b',
			id: 'banner shape',
		});
	});

	it('lets a parameter win over its header and keeps the other headers', () => {
		const headers = applyInitParamsToHeaders(
			'/v1/consent/init?country=FR&region=IDF',
			new Headers({
				'cf-ipcountry': 'US',
				'x-inth-country': 'DE',
				'x-inth-region': 'BE',
			})
		);
		expect(headers.get('x-inth-country')).toBe('FR');
		expect(headers.get('x-inth-region')).toBe('IDF');
		expect(headers.get('cf-ipcountry')).toBe('US');
	});

	it('reads no parameter from a fragment', () => {
		const headers = applyInitParamsToHeaders(
			'/init#frag?country=US',
			new Headers({ 'x-inth-country': 'DE' })
		);
		expect(headers.get('x-inth-country')).toBe('DE');
	});

	it('falls back to the headers when no parameter is sent', () => {
		const original = new Headers({
			'x-inth-country': 'DE',
			'x-inth-gpc': '1',
		});
		const headers = applyInitParamsToHeaders(
			new URL('https://c.example/v1/consent/init'),
			original
		);
		expect(Object.fromEntries(headers)).toEqual(Object.fromEntries(original));
		expect(headers).not.toBe(original);
	});

	it('ignores empty values and a GPC value other than 1 or 0', () => {
		const headers = applyInitParamsToHeaders(
			'/v1/consent/init?country=&gpc=yes',
			new Headers({ 'sec-gpc': '1' })
		);
		expect(headers.has('x-inth-country')).toBe(false);
		// A malformed override must not hide the browser's own signal.
		expect(headers.has('x-inth-gpc')).toBe(false);
	});
});
