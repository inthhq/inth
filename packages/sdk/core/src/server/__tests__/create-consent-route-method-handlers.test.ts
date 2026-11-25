import { describe, expect, test, vi } from 'vite-plus/test';

import { createConsentRouteHandler } from '../consent-route.api';
import {
	createConsentRouteHandlerCache,
	createConsentRouteMethodHandlers,
} from '../create-consent-route-method-handlers';

const SITE = 'https://shop.example';

describe('the consent route loop guard', () => {
	test.each([
		['projectUrl', '/api/inth/v1'],
		['projectUrl', '/api/inth/../inth/v1'],
		['projectUrl', '/api/inth?region=eu'],
		['manifestUrl', '/api/inth/v1/consent/manifest'],
	] as const)(
		'rejects a %s of %s on or below routePrefix at setup',
		(option, url) => {
			expect(() =>
				createConsentRouteHandler({
					adapter: '@inth/test',
					[option]: url,
					routePrefix: '/api/inth',
				})
			).toThrow(/beneath the consent route/u);
		}
	);

	test("allows an upstream path that only starts with the route's name", () => {
		expect(() =>
			createConsentRouteHandler({
				adapter: '@inth/test',
				manifestUrl: '/api/inthx/v1/consent/manifest',
				projectUrl: '/api/inth-other',
				routePrefix: '/api/inth',
			})
		).not.toThrow();
	});

	test.each([
		['an absolute URL on the site', `${SITE}/api/inth/upstream`],
		['a protocol-relative URL on the site', '//shop.example/api/inth/upstream'],
		['a relative URL', '/api/inth/upstream'],
	])(
		'fails a request whose catch-all path shows %s loops back',
		async (_name, projectUrl) => {
			const fetch = vi.fn<typeof globalThis.fetch>();
			const handle = createConsentRouteHandler({
				adapter: '@inth/test',
				fetch,
				projectUrl,
				proxy: true,
			});
			const response = await handle(
				new Request(`${SITE}/api/inth/subjects`, { method: 'POST' }),
				{
					path: 'subjects',
				}
			);
			expect(response.status).toBe(500);
			expect(fetch).not.toHaveBeenCalled();
		}
	);

	test('forwards to the same path on another site', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>(() =>
			Promise.resolve(new Response('{}', { status: 201 }))
		);
		const handle = createConsentRouteHandler({
			adapter: '@inth/test',
			fetch,
			projectUrl: 'https://consent.example/api/inth',
			proxy: true,
		});
		const response = await handle(
			new Request(`${SITE}/api/inth/v1/consent/records`, {
				body: '{}',
				method: 'POST',
			}),
			{ path: 'v1/consent/records' }
		);
		expect(response.status).toBe(201);
	});
});

describe('the consent route without proxy', () => {
	test('answers writes with 405 and unknown reads with 404', async () => {
		const handle = createConsentRouteHandler({
			adapter: '@inth/test',
			projectUrl: 'https://consent.example',
		});
		const write = await handle(
			new Request(`${SITE}/api/inth/subjects`, { method: 'POST' }),
			{
				path: 'subjects',
			}
		);
		expect(write.status).toBe(405);
		expect(write.headers.get('allow')).toBe('GET, HEAD');
		const read = await handle(new Request(`${SITE}/api/inth/other`), {
			path: 'other',
		});
		expect(read.status).toBe(404);
	});
});

describe('createConsentRouteMethodHandlers', () => {
	test('GET alone without proxy, and every method with it', () => {
		const routes: unknown[] = [];
		const handlerFor = (route: string | undefined) => {
			routes.push(route);
			return route ?? 'get';
		};
		expect(createConsentRouteMethodHandlers(undefined, handlerFor)).toEqual({
			GET: 'get',
		});
		expect(createConsentRouteMethodHandlers(true, handlerFor)).toEqual({
			DELETE: 'proxy',
			GET: 'get',
			OPTIONS: 'proxy',
			PATCH: 'proxy',
			POST: 'proxy',
			PUT: 'proxy',
		});
	});
});

describe('createConsentRouteHandlerCache', () => {
	test('rebuilds the handler only when an option changes', () => {
		const handlerFor = createConsentRouteHandlerCache();
		const first = handlerFor({
			adapter: '@inth/test',
			projectUrl: 'https://a.example',
		});
		expect(
			handlerFor({ adapter: '@inth/test', projectUrl: 'https://a.example' })
		).toBe(first);
		expect(
			handlerFor({ adapter: '@inth/test', projectUrl: 'https://b.example' })
		).not.toBe(first);
	});
});
