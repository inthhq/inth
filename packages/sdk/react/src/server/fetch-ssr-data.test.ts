import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchSSRData } from './fetch-ssr-data';

const createRequestHeaders = function createRequestHeaders(): Headers {
	const headers = new Headers();
	headers.set('cf-ipcountry', 'US');
	headers.set('host', 'example.com');
	return headers;
};

const createResponse = function createResponse(payload: unknown) {
	return {
		headers: new Headers(),
		json: vi.fn().mockResolvedValue(payload),
		ok: true,
	} as unknown as Response;
};

describe('fetchSSRData', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it('returns SSR metadata with cache-hit diagnostics and request duration', async () => {
		const initResponse = {
			branding: 'inth',
			location: { countryCode: 'US', regionCode: 'CA' },
			translations: { language: 'en', translations: {} },
		};

		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(JSON.stringify(initResponse), {
					headers: {
						age: '10',
						'content-type': 'application/json',
						'x-vercel-cache': 'HIT',
					},
					status: 200,
				})
			)
		);

		const result = await fetchSSRData({
			headers: createRequestHeaders(),
			projectUrl: '/api/inth',
		});

		expect(result?.init).toEqual(initResponse);
		expect(result?.metadata?.cache).toEqual({
			detail: 'x-vercel-cache=HIT, age=10',
			isHit: true,
		});
		expect(result?.metadata?.requestContext).toEqual({
			country: 'US',
			gpc: false,
			language: null,
			projectUrl: 'https://example.com/api/inth',
			region: null,
		});
		expect(typeof result?.metadata?.requestDurationMs).toBe('number');
		expect(result?.metadata?.requestDurationMs).toBeGreaterThanOrEqual(0);
	});

	it('returns cache metadata for non-hit responses', async () => {
		const initResponse = {
			branding: 'inth',
			location: { countryCode: 'DE', regionCode: null },
			translations: { language: 'de', translations: {} },
		};

		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(JSON.stringify(initResponse), {
					headers: {
						'content-type': 'application/json',
						'x-vercel-cache': 'MISS',
					},
					status: 200,
				})
			)
		);

		const result = await fetchSSRData({
			headers: createRequestHeaders(),
			projectUrl: '/api/inth',
		});

		expect(result?.metadata?.cache).toEqual({
			detail: 'x-vercel-cache=MISS',
			isHit: false,
		});
	});

	it('asks /v1 init with no version, contract or cookie header', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(createResponse({ categories: [], gvl: null }));
		vi.stubGlobal('fetch', fetchMock);
		const headers = createRequestHeaders();
		headers.set('x-inth-version', '3.0.0-proxy');
		headers.set('cookie', 'inth=c.necessary:1');

		await fetchSSRData({
			headers,
			projectUrl: 'https://consent.example.com/api/inth',
		});

		expect(fetchMock.mock.calls[0]?.[0]).toBe(
			'https://consent.example.com/api/inth/v1/consent/init'
		);
		const sent = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
		expect(sent.has('x-inth-version')).toBe(false);
		expect(sent.has('x-inth-policy-contract')).toBe(false);
		expect(sent.has('cookie')).toBe(false);
	});

	it('forwards the prefetch markers, so the backend can tell a prefetch from a view', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(createResponse({ categories: [], gvl: null }));
		vi.stubGlobal('fetch', fetchMock);
		const headers = createRequestHeaders();
		headers.set('sec-purpose', 'prefetch');

		await fetchSSRData({
			headers,
			projectUrl: 'https://consent.example.com/api/inth',
		});

		const sent = fetchMock.mock.calls[0]?.[1]?.headers as Record<
			string,
			string
		>;
		expect(sent['sec-purpose']).toBe('prefetch');
		expect(sent['x-inth-country']).toBe('US');
	});

	it("sends the visitor's full Accept-Language, unless an override sets the language", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(createResponse({ categories: [], gvl: null }));
		vi.stubGlobal('fetch', fetchMock);
		const headers = createRequestHeaders();
		headers.set('accept-language', 'es,fr;q=0.9');
		const projectUrl = 'https://consent.example.com/api/inth';

		await fetchSSRData({ headers, projectUrl });
		await fetchSSRData({ headers, overrides: { language: 'de' }, projectUrl });

		const sent = fetchMock.mock.calls.map(
			(call) =>
				(call[1]?.headers as Record<string, string> | undefined)?.[
					'accept-language'
				]
		);
		expect(sent).toEqual(['es,fr;q=0.9', 'de']);
	});

	it('sends no cookie to a remote https backend', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(createResponse({ categories: [], gvl: null }));
		vi.stubGlobal('fetch', fetchMock);
		const headers = createRequestHeaders();
		headers.set('cookie', 'inth=v%3D3; c15t=v%3D3; session=secret');

		await fetchSSRData({
			headers,
			projectUrl: 'https://consent.example.com/api/inth',
		});

		const sent = fetchMock.mock.calls[0]?.[1]?.headers as Record<
			string,
			string
		>;
		expect(sent).not.toHaveProperty('cookie');
	});

	it('resolves a relative projectUrl against host, not a forged x-forwarded-host', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(createResponse({ categories: [], gvl: null }));
		vi.stubGlobal('fetch', fetchMock);
		const headers = createRequestHeaders();
		headers.set('x-forwarded-host', 'attacker.example');
		headers.set('x-forwarded-proto', 'http');

		await fetchSSRData({ headers, projectUrl: '/api/inth' });

		expect(fetchMock).toHaveBeenCalledWith(
			'https://example.com/api/inth/v1/consent/init',
			expect.any(Object)
		);
		const sent = fetchMock.mock.calls[0]?.[1]?.headers as Record<
			string,
			string
		>;
		expect(sent).not.toHaveProperty('x-forwarded-host');
		expect(sent).not.toHaveProperty('x-forwarded-proto');
	});

	it('still fetches when only untrusted forwarding headers mark the request', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(createResponse({ categories: [], gvl: null }));
		vi.stubGlobal('fetch', fetchMock);
		const headers = new Headers({
			host: 'example.com',
			'x-forwarded-host': 'example.com',
		});

		await fetchSSRData({ headers, projectUrl: '/api/inth' });

		expect(fetchMock).toHaveBeenCalledWith(
			'https://example.com/api/inth/v1/consent/init',
			expect.any(Object)
		);
		const sent = fetchMock.mock.calls[0]?.[1]?.headers as Record<
			string,
			string
		>;
		expect(sent).not.toHaveProperty('x-forwarded-host');
	});

	it('skips the fetch when the request carries no headers', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		const result = await fetchSSRData({
			headers: new Headers(),
			projectUrl: 'https://consent.example.com',
		});

		expect(result).toBeUndefined();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('runs independent fetches for concurrent calls', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(createResponse({ categories: [], gvl: null }));
		vi.stubGlobal('fetch', fetchMock);

		const headers = createRequestHeaders();

		await Promise.all([
			fetchSSRData({
				headers,
				projectUrl: 'https://consent.example.com/api/inth',
			}),
			fetchSSRData({
				headers,
				projectUrl: 'https://consent.example.com/api/inth',
			}),
		]);

		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('returns init data when backend responds with success', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(createResponse({ categories: [], gvl: null }));
		vi.stubGlobal('fetch', fetchMock);

		const headers = createRequestHeaders();

		const result = await fetchSSRData({
			headers,
			projectUrl: 'https://consent.example.com/api/inth',
		});

		expect(result).toMatchObject({
			gvl: null,
			init: { categories: [], gvl: null },
		});
		expect(result?.metadata).toEqual({
			cache: {
				detail: null,
				isHit: false,
			},
			requestContext: {
				country: 'US',
				gpc: false,
				language: null,
				projectUrl: 'https://consent.example.com/api/inth',
				region: null,
			},
			requestDurationMs: expect.any(Number),
		});
	});

	it('records overrides and gpc in request-context metadata', async () => {
		const headers = createRequestHeaders();
		headers.set('accept-language', 'en-GB');
		headers.set('sec-gpc', '1');

		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(JSON.stringify({ categories: [], gvl: null }), {
					headers: {
						'content-type': 'application/json',
					},
					status: 200,
				})
			)
		);

		const result = await fetchSSRData({
			headers,
			overrides: {
				country: 'DE',
				language: 'de',
				region: 'BE',
			},
			projectUrl: '/api/inth',
		});

		expect(result?.metadata?.requestContext).toEqual({
			country: 'DE',
			gpc: true,
			language: 'de',
			projectUrl: 'https://example.com/api/inth',
			region: 'BE',
		});
	});

	it('returns undefined when backend responds with non-ok status', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: false,
			status: 500,
		} as Response);
		vi.stubGlobal('fetch', fetchMock);

		const headers = createRequestHeaders();

		const result = await fetchSSRData({
			headers,
			projectUrl: 'https://consent.example.com/api/inth',
		});

		expect(result).toBeUndefined();
	});
});
