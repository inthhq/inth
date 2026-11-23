/**
 * Wiring of `createConsentRoute` onto the core consent route handler. The
 * route behaviour itself is pinned once, in
 * `packages/sdk/core/src/server/__tests__/consent-route.test.ts`; these check
 * the prefix, the methods, the in-process fetch and the Node middleware.
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { manifest } from '@inth/angular';
import { clearManifestCache } from '@inth/sdk/server';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { MANIFEST_FIXTURE } from './__tests__/manifest-fixture';
import { createConsentRoute } from './consent-route.api';

const BACKEND = 'https://consent.example.com';
const SITE = 'https://shop.example';

const upstream = () =>
	vi
		.fn<typeof globalThis.fetch>()
		.mockImplementation((input) =>
			Promise.resolve(
				String(input).endsWith('/v1/consent/manifest')
					? Response.json(MANIFEST_FIXTURE)
					: Response.json({ ok: true }, { status: 201 })
			)
		);

beforeEach(() => {
	clearManifestCache();
});

describe('createConsentRoute', () => {
	test('serves and resolves a snapshot below its prefix only', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>();
		const route = createConsentRoute({
			fetch,
			projectUrl: BACKEND,
			snapshot: MANIFEST_FIXTURE,
		});
		const served = await route.fetch(
			new Request(`${SITE}/api/inth/v1/consent/manifest`)
		);
		expect(await served?.json()).toEqual(MANIFEST_FIXTURE);

		const init = await route.fetch(
			new Request(`${SITE}/api/inth/v1/consent/init`, {
				headers: { 'x-vercel-ip-country': 'DE' },
			})
		);
		expect(await init?.json()).toMatchObject({
			policyResolution: { policyId: 'eu-opt-in', status: 'matched' },
		});

		expect(await route.fetch(new Request(`${SITE}/`))).toBeNull();
		expect(
			await route.fetch(new Request(`${SITE}/api/inthx/v1/consent/init`))
		).toBeNull();
		// No policy request; only the session report.
		expect(
			fetch.mock.calls.filter(([url]) => !String(url).endsWith('/sessions'))
		).toEqual([]);
	});

	test('answers writes with 405 unless proxy is on', async () => {
		const route = createConsentRoute({ projectUrl: BACKEND });
		const response = await route.fetch(
			new Request(`${SITE}/api/inth/v1/consent/records`, {
				body: '{}',
				method: 'POST',
			})
		);
		expect(response?.status).toBe(405);
		expect(response?.headers.get('allow')).toBe('GET, HEAD');
	});

	test('forwards writes to the backend with proxy on', async () => {
		const fetch = upstream();
		const route = createConsentRoute({
			fetch,
			projectUrl: BACKEND,
			proxy: true,
			routePrefix: '/consent/',
		});
		const response = await route.fetch(
			new Request(`${SITE}/consent/v1/consent/records`, {
				body: '{}',
				method: 'POST',
			})
		);
		expect(response?.status).toBe(201);
		expect(fetch.mock.calls[0]?.[0]).toBe(`${BACKEND}/v1/consent/records`);
		const headers = new Headers(fetch.mock.calls[0]?.[1]?.headers);
		expect(headers.get('x-inth-proxy')).toBe('@inth/angular');
		expect(headers.get('x-forwarded-host')).toBe('shop.example');
	});

	test('answers a relative path below the prefix in-process', async () => {
		const global = vi.spyOn(globalThis, 'fetch');
		try {
			const route = createConsentRoute({
				snapshot: MANIFEST_FIXTURE,
			});
			const response = await route.localFetch('/api/inth/v1/consent/manifest');
			expect(await response.json()).toEqual(MANIFEST_FIXTURE);
			expect(global).not.toHaveBeenCalled();
		} finally {
			global.mockRestore();
		}
	});

	test("reads the manifest where the render does, from provideInth()'s mode", async () => {
		const fetch = upstream();
		const route = createConsentRoute({
			fetch,
			mode: manifest({
				manifestUrl: 'https://cdn.example/v1/consent/manifest',
			}),
			projectUrl: BACKEND,
		});
		await route.fetch(new Request(`${SITE}/api/inth/v1/consent/manifest`));
		expect(String(fetch.mock.calls[0]?.[0])).toBe(
			'https://cdn.example/v1/consent/manifest'
		);
	});

	test('rejects a backend URL that names the route itself', () => {
		expect(() => createConsentRoute({ projectUrl: '/api/inth/' })).toThrow(
			TypeError
		);
		expect(() => createConsentRoute({ routePrefix: '/' })).toThrow(TypeError);
	});

	test.each([
		['projectUrl', '/api/inth/v1'],
		['projectUrl', '/api/inth/../inth/v1'],
		['projectUrl', '/api/inth?region=eu'],
		['manifestUrl', '/api/inth/v1/consent/manifest'],
	] as const)(
		'rejects a %s of %s on or below the route at setup',
		(option, url) => {
			expect(() => createConsentRoute({ [option]: url })).toThrow(
				/beneath the consent route|names the consent route/u
			);
		}
	);

	test("allows an upstream path that only starts with the route's name", () => {
		expect(() =>
			createConsentRoute({
				manifestUrl: '/api/inthx/v1/consent/manifest',
				projectUrl: '/api/inth-other',
			})
		).not.toThrow();
	});

	test('fails a request when an absolute upstream URL loops back to the route', async () => {
		const fetch = upstream();
		const route = createConsentRoute({
			fetch,
			projectUrl: `${SITE}/api/inth/upstream`,
			proxy: true,
		});

		const response = await route.fetch(
			new Request(`${SITE}/api/inth/v1/consent/init`, { method: 'POST' })
		);

		expect(response?.status).toBe(500);
		expect(fetch).not.toHaveBeenCalled();
	});

	test('compares the forwarded public origin when it trusts forwarded headers', async () => {
		const fetch = upstream();
		const route = createConsentRoute({
			fetch,
			projectUrl: `${SITE}/api/inth/upstream`,
			proxy: true,
			trustForwardedHeaders: true,
		});

		const response = await route.fetch(
			new Request('http://internal:4000/api/inth/v1/consent/init', {
				headers: {
					'x-forwarded-host': new URL(SITE).host,
					'x-forwarded-proto': 'https',
				},
				method: 'POST',
			})
		);

		expect(response?.status).toBe(500);
		expect(fetch).not.toHaveBeenCalled();
	});

	test.each([
		[
			'a Forwarded header',
			{ forwarded: `host=${new URL(SITE).host};proto=https` },
		],
		[
			'comma-separated x-forwarded chains',
			{
				'x-forwarded-host': `${new URL(SITE).host}, internal:4000`,
				'x-forwarded-proto': 'https, http',
			},
		],
	])(
		'reads the site origin from %s for the loop check',
		async (_form, headers) => {
			const fetch = upstream();
			const route = createConsentRoute({
				fetch,
				projectUrl: `${SITE}/api/inth/upstream`,
				proxy: true,
				trustForwardedHeaders: true,
			});

			const response = await route.fetch(
				new Request('http://internal:4000/api/inth/v1/consent/init', {
					headers,
					method: 'POST',
				})
			);

			expect(response?.status).toBe(500);
			expect(fetch).not.toHaveBeenCalled();
		}
	);

	test.each(['http', 'https'])(
		'fails an %s request when a protocol-relative upstream loops back to the route',
		async (scheme) => {
			const fetch = upstream();
			const route = createConsentRoute({
				fetch,
				projectUrl: '//shop.example/api/inth/upstream',
				proxy: true,
			});

			const response = await route.fetch(
				new Request(`${scheme}://shop.example/api/inth/init`, {
					method: 'POST',
				})
			);

			expect(response?.status).toBe(500);
			expect(fetch).not.toHaveBeenCalled();
		}
	);

	test('the Node middleware answers consent paths and passes the rest on', async () => {
		const fetch = upstream();
		const route = createConsentRoute({
			fetch,
			projectUrl: BACKEND,
			proxy: true,
			snapshot: MANIFEST_FIXTURE,
		});
		const server = createServer((request, response) => {
			// The app's own handler, for what the route passes on.
			const renderPage = (failure?: unknown) => {
				response.statusCode = failure ? 500 : 404;
				response.end('page');
			};
			void route.node(request, response, renderPage);
		});
		await new Promise<void>((resolve) => {
			server.listen(0, '127.0.0.1', resolve);
		});
		try {
			const { port } = server.address() as AddressInfo;
			const base = `http://127.0.0.1:${port}`;

			const served = await globalThis.fetch(
				`${base}/api/inth/v1/consent/manifest`
			);
			expect(await served.json()).toEqual(MANIFEST_FIXTURE);

			const page = await globalThis.fetch(`${base}/about?x=/api/inth`);
			expect(page.status).toBe(404);
			expect(await page.text()).toBe('page');

			const save = await globalThis.fetch(
				`${base}/api/inth/v1/consent/records`,
				{
					body: '{}',
					headers: { 'content-type': 'application/json' },
					method: 'POST',
				}
			);
			expect(save.status).toBe(201);
			const headers = new Headers(fetch.mock.calls[0]?.[1]?.headers);
			expect(headers.get('x-forwarded-for')).toBe('127.0.0.1');
		} finally {
			await new Promise((resolve) => {
				server.close(resolve);
			});
		}
	});

	test('the Node middleware believes trusted forwarding headers', async () => {
		const fetch = upstream();
		const serve = (projectUrl: string) => {
			const route = createConsentRoute({
				fetch,
				projectUrl,
				proxy: true,
				trustForwardedHeaders: true,
			});
			return createServer((request, response) => {
				void route.node(request, response, () => {
					response.statusCode = 404;
					response.end('page');
				});
			});
		};
		const forwarded = {
			'content-type': 'application/json',
			'x-forwarded-for': '203.0.113.7',
			'x-forwarded-host': new URL(SITE).host,
			'x-forwarded-proto': 'https',
		};
		const post = async (projectUrl: string): Promise<Response> => {
			const server = serve(projectUrl);
			await new Promise<void>((resolve) => {
				server.listen(0, '127.0.0.1', resolve);
			});
			try {
				const { port } = server.address() as AddressInfo;
				return await globalThis.fetch(
					`http://127.0.0.1:${port}/api/inth/v1/consent/records`,
					{ body: '{}', headers: forwarded, method: 'POST' }
				);
			} finally {
				await new Promise((resolve) => {
					server.close(resolve);
				});
			}
		};

		// The backend hears the visitor and the public site, then the proxy.
		expect((await post(BACKEND)).status).toBe(201);
		const headers = new Headers(fetch.mock.calls[0]?.[1]?.headers);
		expect(headers.get('x-forwarded-for')).toBe('203.0.113.7, 127.0.0.1');
		expect(headers.get('x-forwarded-host')).toBe(new URL(SITE).host);
		expect(headers.get('x-forwarded-proto')).toBe('https');

		// The loop guard sees the public origin too.
		fetch.mockClear();
		expect((await post(`${SITE}/api/inth/upstream`)).status).toBe(500);
		expect(fetch).not.toHaveBeenCalled();
	});
});
