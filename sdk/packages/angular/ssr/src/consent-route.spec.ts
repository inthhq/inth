/**
 * Wiring of `createConsentRoute` onto the core consent route handler. The
 * route behaviour itself is pinned once, in
 * `packages/core/src/server/__tests__/consent-route.test.ts`; these check
 * the prefix, the methods, the in-process fetch and the Node middleware.
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { clearManifestCache } from '@c15t/core/server';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { MANIFEST_FIXTURE } from './__tests__/manifest-fixture';
import { createConsentRoute } from './consent-route';

const BACKEND = 'https://consent.example.com';
const SITE = 'https://shop.example';

const upstream = () =>
	vi
		.fn<typeof globalThis.fetch>()
		.mockImplementation((input) =>
			Promise.resolve(
				String(input).endsWith('/manifest')
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
			backendURL: BACKEND,
			fetch,
			reportSessions: false,
			snapshot: MANIFEST_FIXTURE,
		});
		const manifest = await route.fetch(
			new Request(`${SITE}/api/c15t/manifest`)
		);
		expect(await manifest?.json()).toEqual(MANIFEST_FIXTURE);

		const init = await route.fetch(
			new Request(`${SITE}/api/c15t/init`, {
				headers: { 'x-vercel-ip-country': 'DE' },
			})
		);
		expect(await init?.json()).toMatchObject({
			policyResolution: { policyId: 'eu-opt-in', status: 'matched' },
		});

		expect(await route.fetch(new Request(`${SITE}/`))).toBeNull();
		expect(await route.fetch(new Request(`${SITE}/api/c15tx/init`))).toBeNull();
		expect(fetch).not.toHaveBeenCalled();
	});

	test('answers writes with 405 unless proxy is on', async () => {
		const route = createConsentRoute({ backendURL: BACKEND });
		const response = await route.fetch(
			new Request(`${SITE}/api/c15t/subjects`, { body: '{}', method: 'POST' })
		);
		expect(response?.status).toBe(405);
		expect(response?.headers.get('allow')).toBe('GET, HEAD');
	});

	test('forwards writes to the backend with proxy on', async () => {
		const fetch = upstream();
		const route = createConsentRoute({
			backendURL: BACKEND,
			fetch,
			proxy: true,
			routePrefix: '/consent/',
		});
		const response = await route.fetch(
			new Request(`${SITE}/consent/subjects`, { body: '{}', method: 'POST' })
		);
		expect(response?.status).toBe(201);
		expect(fetch.mock.calls[0]?.[0]).toBe(`${BACKEND}/subjects`);
		const headers = new Headers(fetch.mock.calls[0]?.[1]?.headers);
		expect(headers.get('x-c15t-proxy')).toBe('@c15t/angular');
		expect(headers.get('x-forwarded-host')).toBe('shop.example');
	});

	test('answers a relative path below the prefix in-process', async () => {
		const global = vi.spyOn(globalThis, 'fetch');
		try {
			const route = createConsentRoute({
				reportSessions: false,
				snapshot: MANIFEST_FIXTURE,
			});
			const response = await route.localFetch('/api/c15t/manifest');
			expect(await response.json()).toEqual(MANIFEST_FIXTURE);
			expect(global).not.toHaveBeenCalled();
		} finally {
			global.mockRestore();
		}
	});

	test('rejects a backend URL that names the route itself', () => {
		expect(() => createConsentRoute({ backendURL: '/api/c15t/' })).toThrow(
			TypeError
		);
		expect(() => createConsentRoute({ routePrefix: '/' })).toThrow(TypeError);
	});

	test.each([
		['backendURL', '/api/c15t/v1'],
		['backendURL', '/api/c15t/../c15t/v1'],
		['backendURL', '/api/c15t?region=eu'],
		['manifestURL', '/api/c15t/manifest'],
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
				backendURL: '/api/c15t-other',
				manifestURL: '/api/c15tx/manifest',
			})
		).not.toThrow();
	});

	test('fails a request when an absolute upstream URL loops back to the route', async () => {
		const fetch = upstream();
		const route = createConsentRoute({
			backendURL: `${SITE}/api/c15t/upstream`,
			fetch,
			proxy: true,
		});

		const response = await route.fetch(
			new Request(`${SITE}/api/c15t/init`, { method: 'POST' })
		);

		expect(response?.status).toBe(500);
		expect(fetch).not.toHaveBeenCalled();
	});

	test('compares the forwarded public origin when it trusts forwarded headers', async () => {
		const fetch = upstream();
		const route = createConsentRoute({
			backendURL: `${SITE}/api/c15t/upstream`,
			fetch,
			proxy: true,
			trustForwardedHeaders: true,
		});

		const response = await route.fetch(
			new Request('http://internal:4000/api/c15t/init', {
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
				backendURL: `${SITE}/api/c15t/upstream`,
				fetch,
				proxy: true,
				trustForwardedHeaders: true,
			});

			const response = await route.fetch(
				new Request('http://internal:4000/api/c15t/init', {
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
				backendURL: '//shop.example/api/c15t/upstream',
				fetch,
				proxy: true,
			});

			const response = await route.fetch(
				new Request(`${scheme}://shop.example/api/c15t/init`, {
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
			backendURL: BACKEND,
			fetch,
			proxy: true,
			reportSessions: false,
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

			const manifest = await globalThis.fetch(`${base}/api/c15t/manifest`);
			expect(await manifest.json()).toEqual(MANIFEST_FIXTURE);

			const page = await globalThis.fetch(`${base}/about?x=/api/c15t`);
			expect(page.status).toBe(404);
			expect(await page.text()).toBe('page');

			const save = await globalThis.fetch(`${base}/api/c15t/subjects`, {
				body: '{}',
				headers: { 'content-type': 'application/json' },
				method: 'POST',
			});
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
		const serve = (backendURL: string) => {
			const route = createConsentRoute({
				backendURL,
				fetch,
				proxy: true,
				reportSessions: false,
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
		const post = async (backendURL: string): Promise<Response> => {
			const server = serve(backendURL);
			await new Promise<void>((resolve) => {
				server.listen(0, '127.0.0.1', resolve);
			});
			try {
				const { port } = server.address() as AddressInfo;
				return await globalThis.fetch(
					`http://127.0.0.1:${port}/api/c15t/subjects`,
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
		expect((await post(`${SITE}/api/c15t/upstream`)).status).toBe(500);
		expect(fetch).not.toHaveBeenCalled();
	});
});
