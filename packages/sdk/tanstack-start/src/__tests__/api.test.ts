/**
 * Wiring of `@inth/tanstack-start/api` onto the core consent route handler.
 * The route behaviour itself is pinned once, in
 * `packages/sdk/core/src/server/__tests__/consent-route.test.ts`.
 */
import { createManifestCache } from '@inth/sdk/server';
import { describe, expect, test, vi } from 'vite-plus/test';

import { createConsentRoute } from '../api';
import { rememberConsentInputs } from '../libs/request-inputs';
import { MANIFEST_FIXTURE } from './manifest-fixture';

const BACKEND = 'https://consent.example.com';

const upstream = () =>
	vi.fn<typeof globalThis.fetch>().mockImplementation((input) =>
		Promise.resolve(
			String(input).endsWith('/v1/consent/manifest')
				? Response.json(MANIFEST_FIXTURE, {
						headers: { 'cache-control': 'public, s-maxage=120' },
					})
				: Response.json({ ok: true }, { status: 201 })
		)
	);

const request = (path: string, init?: RequestInit) =>
	new Request(`https://app.example.com/api/inth/${path}`, init);

describe('createConsentRoute', () => {
	test('serves the deployment snapshot without fetching an upstream manifest', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>();
		const { GET } = createConsentRoute({
			fetch,
			projectUrl: BACKEND,
			snapshot: MANIFEST_FIXTURE,
		});
		expect(
			await (
				await GET({
					params: { _splat: 'v1/consent/manifest' },
					request: request('v1/consent/manifest'),
				})
			).json()
		).toEqual(MANIFEST_FIXTURE);
		expect(
			await (
				await GET({
					params: { _splat: 'v1/consent/init' },
					request: request('v1/consent/init', {
						headers: { 'x-vercel-ip-country': 'DE' },
					}),
				})
			).json()
		).toMatchObject({
			policyResolution: { policyId: 'eu-opt-in', status: 'matched' },
		});
		// No policy request; only the session report.
		expect(
			fetch.mock.calls.filter(([url]) => !String(url).endsWith('/sessions'))
		).toEqual([]);
	});

	test('returns GET, and the write methods with proxy on', () => {
		const plain = createConsentRoute({ projectUrl: BACKEND });
		expect(Object.keys(plain)).toEqual(['GET']);
		const proxied = createConsentRoute({
			projectUrl: BACKEND,
			proxy: true,
		});
		expect(Object.keys(proxied).sort()).toEqual([
			'DELETE',
			'GET',
			'OPTIONS',
			'PATCH',
			'POST',
			'PUT',
		]);
	});

	test('GET dispatches on the router splat, or the path when there is none', async () => {
		const fetch = upstream();
		const { GET } = createConsentRoute({
			cache: createManifestCache(),
			fetch,
			projectUrl: BACKEND,
		});
		const served = await GET({
			params: { _splat: 'v1/consent/manifest' },
			request: request('ignored'),
		});
		const init = await GET({ request: request('v1/consent/init') });
		const unknown = await GET({
			params: { _splat: 'v1/consent/records' },
			request: request('v1/consent/records'),
		});
		expect(served.headers.get('cache-control')).toBe('public, s-maxage=120');
		expect(init.headers.get('cache-control')).toBe('private, no-store');
		expect(unknown.status).toBe(404);
		// One manifest request; init also reports the session.
		expect(
			fetch.mock.calls.filter(([url]) => !String(url).endsWith('/sessions'))
		).toHaveLength(1);
	});

	test('init resolves with the inputs the request middleware remembered', async () => {
		const { GET } = createConsentRoute({
			cache: createManifestCache(),
			fetch: upstream(),
			projectUrl: BACKEND,
		});
		const incoming = request('v1/consent/init', {
			headers: { 'x-inth-country': 'US' },
		});
		rememberConsentInputs(incoming, { country: 'DE', language: 'de' });
		const body = await (await GET({ request: incoming })).json();
		expect(body).toMatchObject({
			location: { countryCode: 'DE' },
			policyResolution: { policyId: 'eu-opt-in' },
			translations: { language: 'de' },
		});
	});

	test('the proxy names the adapter and trusts forwarding only when told to', async () => {
		const fetch = upstream();
		const { POST } = createConsentRoute({
			fetch,
			projectUrl: BACKEND,
			proxy: true,
			trustForwardedHeaders: true,
		});
		const response = await POST({
			params: { _splat: 'v1/consent/records' },
			request: request('v1/consent/records', {
				body: '{}',
				headers: { 'x-forwarded-host': 'public.example' },
				method: 'POST',
			}),
		});
		expect(response.status).toBe(201);
		const headers = new Headers(fetch.mock.calls[0]?.[1]?.headers);
		expect(fetch.mock.calls[0]?.[0]).toBe(`${BACKEND}/v1/consent/records`);
		expect(headers.get('x-inth-proxy')).toBe('@inth/tanstack-start');
		expect(headers.get('x-forwarded-host')).toBe('public.example');
	});

	test('hands detached work to onBackgroundRevalidate', async () => {
		const registered: Promise<void>[] = [];
		const fetch = upstream();
		const { GET } = createConsentRoute({
			cache: createManifestCache(),
			fetch,
			onBackgroundRevalidate: (task) => {
				registered.push(task);
			},
			projectUrl: BACKEND,
		});
		await GET({ request: request('v1/consent/init') });
		expect(registered).toHaveLength(1);
		await registered[0];
		expect(fetch).toHaveBeenLastCalledWith(
			`${BACKEND}/v1/consent/sessions`,
			expect.objectContaining({ method: 'POST' })
		);
	});
});
