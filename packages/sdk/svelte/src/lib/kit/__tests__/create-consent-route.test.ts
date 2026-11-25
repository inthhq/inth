/**
 * Wiring of `@inth/svelte/kit` onto the core consent route handler. The
 * route behaviour itself is pinned once, in
 * `packages/sdk/core/src/server/__tests__/consent-route.api.test.ts`.
 */
import { clearManifestCache } from '@inth/sdk/server';
import type { RequestEvent } from '@sveltejs/kit';
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	test,
	vi,
} from 'vite-plus/test';

import { setGenerated } from '../../__tests__/generated';
import { createConsentRoute } from '../create-consent-route';
import { manifest as manifestMode } from '../index';
import { inthHandle } from '../inth-handle';
import { loadConsent } from '../load-consent';
import { createEvent } from './event';
import { MANIFEST_FIXTURE } from './manifest-fixture';

const BACKEND = 'https://consent.example.com';
const ROUTE_ID = '/api/inth/[...path]';

const upstream = () =>
	vi.fn<typeof globalThis.fetch>().mockImplementation((input) =>
		Promise.resolve(
			String(input).endsWith('/v1/consent/manifest')
				? Response.json(MANIFEST_FIXTURE, {
						headers: {
							'cache-control': 'public, s-maxage=1, stale-while-revalidate=600',
						},
					})
				: Response.json({ ok: true }, { status: 201 })
		)
	);

const restEvent = (
	path: string,
	init: Parameters<typeof createEvent>[0] = {}
): RequestEvent =>
	createEvent({
		...init,
		route: { id: ROUTE_ID, params: { path } },
		url: `https://shop.example/api/inth/${path}`,
	});

beforeEach(() => {
	clearManifestCache();
});

describe('createConsentRoute', () => {
	test('serves and resolves a snapshot without an upstream policy request', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>();
		const { GET } = createConsentRoute({
			fetch,
			projectUrl: BACKEND,
			snapshot: MANIFEST_FIXTURE,
		});
		expect(await (await GET(restEvent('v1/consent/manifest'))).json()).toEqual(
			MANIFEST_FIXTURE
		);
		const response = await GET(
			restEvent('v1/consent/init', { headers: { 'x-vercel-ip-country': 'DE' } })
		);
		expect(await response.json()).toMatchObject({
			policyResolution: { policyId: 'eu-opt-in', status: 'matched' },
		});
		// No policy request; only the session report.
		expect(
			fetch.mock.calls.filter(([url]) => !String(url).endsWith('/sessions'))
		).toEqual([]);
	});

	test('returns GET, and the write methods with proxy on', () => {
		expect(Object.keys(createConsentRoute()).sort()).toEqual(['GET']);
		expect(
			Object.keys(
				createConsentRoute({ projectUrl: BACKEND, proxy: true })
			).sort()
		).toEqual(['DELETE', 'GET', 'OPTIONS', 'PATCH', 'POST', 'PUT']);
	});

	test('GET dispatches on the rest parameter, or the path of a fixed route', async () => {
		const fetch = upstream();
		const { GET } = createConsentRoute({
			fetch,
			projectUrl: BACKEND,
		});
		const manifest = await GET(restEvent('v1/consent/manifest'));
		const root = await GET(restEvent(''));
		const fixed = await GET(
			createEvent({ url: 'https://shop.example/api/inth/v1/consent/manifest' })
		);
		expect(manifest.headers.get('cache-control')).toContain('s-maxage=1');
		expect(root.headers.get('cache-control')).toBe('private, no-store');
		expect(fixed.headers.get('cache-control')).toContain('s-maxage=1');
	});

	test('fetches a relative backend in-process through event.fetch', async () => {
		const eventFetch = upstream();
		const { GET } = createConsentRoute({
			projectUrl: '/api/self-host',
		});
		await GET(
			createEvent({
				fetch: eventFetch,
				headers: { host: 'evil.example' },
				route: { id: ROUTE_ID, params: { path: 'v1/consent/init' } },
				url: 'https://shop.example/api/inth/v1/consent/init',
			})
		);
		expect(eventFetch).toHaveBeenCalledWith(
			'/api/self-host/v1/consent/manifest',
			expect.anything()
		);
	});

	test('hands detached work to platform.context.waitUntil by default', async () => {
		vi.useFakeTimers();
		try {
			const fetch = upstream();
			const waitUntil = vi.fn();
			const { GET } = createConsentRoute({ fetch, projectUrl: BACKEND });
			const event = () =>
				Object.assign(restEvent('v1/consent/manifest'), {
					platform: { context: { waitUntil } },
				});
			await GET(event());
			vi.advanceTimersByTime(1500);
			await GET(event());
			expect(waitUntil).toHaveBeenCalledTimes(1);
			expect(waitUntil.mock.contexts[0]).toEqual({ waitUntil });
		} finally {
			vi.useRealTimers();
		}
	});

	test('the proxy vouches for the hop chain with event.getClientAddress()', async () => {
		const fetch = upstream();
		const { POST } = createConsentRoute({
			fetch,
			projectUrl: BACKEND,
			proxy: true,
		});
		const response = await POST(
			restEvent('v1/consent/records', {
				body: '{}',
				clientAddress: '203.0.113.7',
				headers: { 'x-forwarded-for': '198.51.100.1' },
				method: 'POST',
			})
		);
		expect(response.status).toBe(201);
		const headers = new Headers(fetch.mock.calls[0]?.[1]?.headers);
		expect(fetch.mock.calls[0]?.[0]).toBe(`${BACKEND}/v1/consent/records`);
		expect(headers.get('x-forwarded-for')).toBe('203.0.113.7');
		expect(headers.get('x-forwarded-host')).toBe('shop.example');
		expect(headers.get('x-inth-proxy')).toBe('@inth/svelte');
	});
});

describe('createConsentRoute with inthHandle', () => {
	afterEach(() => {
		setGenerated({});
	});

	/** Runs the handle, then the route, on one request, as SvelteKit does. */
	const throughHandle = (
		handle: ReturnType<typeof inthHandle>,
		route: (event: RequestEvent) => Response | Promise<Response>,
		event: RequestEvent
	): Promise<Response> =>
		handle({ event, resolve: (resolved) => route(resolved) });

	test("reads the handle's snapshot, so it is passed once", async () => {
		const fetch = vi.fn<typeof globalThis.fetch>();
		const own = { ...MANIFEST_FIXTURE, revision: 'from-the-handle' };
		const { GET } = createConsentRoute({ fetch });
		const response = await throughHandle(
			inthHandle({ projectUrl: BACKEND, snapshot: own }),
			GET,
			restEvent('v1/consent/manifest')
		);
		expect(await response.json()).toMatchObject({
			revision: 'from-the-handle',
		});
		expect(fetch).not.toHaveBeenCalled();
	});

	test("reads the handle's backend URL and a hosted() mode's own", async () => {
		const fetch = upstream();
		const { GET } = createConsentRoute({ fetch });
		await throughHandle(
			inthHandle({ projectUrl: 'https://handle.example' }),
			GET,
			restEvent('v1/consent/manifest')
		);
		await throughHandle(
			inthHandle({ projectUrl: 'https://hosted.example' }),
			GET,
			restEvent('v1/consent/manifest')
		);
		expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
			'https://handle.example/v1/consent/manifest',
			'https://hosted.example/v1/consent/manifest',
		]);
	});

	test("reads a manifest() mode's manifestUrl", async () => {
		const fetch = upstream();
		const { GET } = createConsentRoute({ fetch });
		await throughHandle(
			inthHandle({
				mode: manifestMode({
					manifestUrl: 'https://cdn.example/v1/consent/manifest',
				}),
				projectUrl: BACKEND,
			}),
			GET,
			restEvent('v1/consent/manifest')
		);
		expect(String(fetch.mock.calls[0]?.[0])).toBe(
			'https://cdn.example/v1/consent/manifest'
		);
	});

	test('explicit route options win over the handle', async () => {
		const fetch = upstream();
		const { GET } = createConsentRoute({
			fetch,
			projectUrl: 'https://route.example',
		});
		await throughHandle(
			inthHandle({ projectUrl: 'https://handle.example' }),
			GET,
			restEvent('v1/consent/manifest')
		);
		expect(String(fetch.mock.calls[0]?.[0])).toBe(
			'https://route.example/v1/consent/manifest'
		);
	});

	test("an absolute manifestUrl wins over the build's snapshot, as in loadConsent", async () => {
		setGenerated({
			projectUrl: BACKEND,
			snapshot: { ...MANIFEST_FIXTURE, revision: 'from-the-build' },
		});
		const fetch = upstream();
		const { GET } = createConsentRoute({ fetch });
		const response = await throughHandle(
			inthHandle({
				mode: manifestMode({
					manifestUrl: 'https://cdn.example/v1/consent/manifest',
				}),
			}),
			GET,
			restEvent('v1/consent/manifest')
		);
		expect(await response.json()).not.toMatchObject({
			revision: 'from-the-build',
		});
		expect(String(fetch.mock.calls[0]?.[0])).toBe(
			'https://cdn.example/v1/consent/manifest'
		);
	});

	test("a manifestUrl on the route's own prefix reads the backend's manifest", async () => {
		const fetch = upstream();
		const eventFetch = vi.fn<typeof globalThis.fetch>();
		const { GET } = createConsentRoute({ fetch });
		const response = await throughHandle(
			inthHandle({
				mode: manifestMode({ manifestUrl: '/api/inth/v1/consent/manifest' }),
				projectUrl: BACKEND,
				routePrefix: '/api/inth',
			}),
			GET,
			restEvent('v1/consent/manifest', { fetch: eventFetch })
		);
		expect(response.status).toBe(200);
		expect(String(fetch.mock.calls[0]?.[0])).toBe(
			`${BACKEND}/v1/consent/manifest`
		);
		expect(eventFetch).not.toHaveBeenCalled();
	});

	test.each([
		['proxy: true', { proxy: true, routePrefix: '/api/inth' }],
		[
			"a projectUrl naming the route's own prefix",
			{ projectUrl: '/api/inth', routePrefix: '/api/inth' },
		],
		[
			'a projectUrl naming the route, with routePrefix unset',
			{ projectUrl: '/api/inth' },
		],
	])(
		'the proxy setup forwards saves to the build backend, not to itself, with %s',
		async (_name, setup) => {
			// The handle points the browser at the route; the route forwards
			// upstream.
			setGenerated({ projectUrl: BACKEND });
			const fetch = upstream();
			const eventFetch = vi.fn<typeof globalThis.fetch>();
			const handle = inthHandle(setup);
			const { GET, POST } = createConsentRoute({ fetch, proxy: true });

			const page = createEvent({ url: 'https://shop.example/' });
			const { consent } = await handle({
				event: page,
				resolve: async (event) =>
					Response.json(await loadConsent(event, { fetch })),
			}).then((response) => response.json());
			expect(consent).toMatchObject({ projectUrl: '/api/inth' });
			expect(consent.routePrefix).toBe(setup.routePrefix);

			const save = await throughHandle(
				handle,
				POST,
				restEvent('v1/consent/records', {
					body: '{}',
					clientAddress: '203.0.113.7',
					fetch: eventFetch,
					method: 'POST',
				})
			);
			expect(save.status).toBe(201);
			const init = await throughHandle(
				handle,
				GET,
				restEvent('v1/consent/init', {
					fetch: eventFetch,
					headers: { 'x-vercel-ip-country': 'DE' },
				})
			);
			expect(await init.json()).toMatchObject({
				policyResolution: { policyId: 'eu-opt-in', status: 'matched' },
			});
			expect(eventFetch).not.toHaveBeenCalled();
			expect(fetch.mock.calls.map(([url]) => String(url))).toEqual(
				expect.arrayContaining([
					`${BACKEND}/v1/consent/records`,
					`${BACKEND}/v1/consent/manifest`,
				])
			);
		}
	);
});
