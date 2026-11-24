import { manifest } from '@inth/sdk/modes';
/**
 * Wiring of `@inth/nextjs/api` onto the core consent route handler. The
 * route behaviour itself is pinned once, in
 * `packages/sdk/core/src/server/__tests__/consent-route.test.ts`.
 */
import { clearManifestCache } from '@inth/sdk/server';
import { beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import { createConsentRoute, createManifestFetchInit } from '../api';
import type { NextRouteHandler } from '../api';
import { defineConsentConfig } from '../config';
import { MANIFEST_FIXTURE } from './manifest-fixture';

/** The requests that fetch policy, leaving out the session reports. */
const policyCalls = (spy: { mock: { calls: unknown[][] } }): unknown[] =>
	spy.mock.calls
		.map(([url]) => url)
		.filter((url) => !String(url).endsWith('/sessions'));

/** Calls a fixed-mount route handler, which reads the last URL segment. */
const call = (handler: NextRouteHandler, url: string, init?: RequestInit) =>
	handler(new Request(url, init), { params: Promise.resolve({}) });

const manifestFetch = () =>
	vi.fn<typeof globalThis.fetch>().mockImplementation(() =>
		Promise.resolve(
			Response.json(MANIFEST_FIXTURE, {
				headers: {
					'cache-control': 'public, s-maxage=120',
					etag: '"manifest-revision"',
				},
			})
		)
	);

beforeEach(() => {
	clearManifestCache();
});

describe('@inth/nextjs/api', () => {
	test('serves a deployment manifest and resolves each visitor without fetching policy', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>();
		const { GET } = createConsentRoute({
			fetch,
			projectUrl: 'https://consent.example.com',
			snapshot: MANIFEST_FIXTURE,
		});
		const served = await call(
			GET,
			'https://app.example.com/api/inth/v1/consent/manifest'
		);
		expect(await served.json()).toEqual(MANIFEST_FIXTURE);
		await Promise.all(
			[
				{ country: 'DE', policyId: 'eu-opt-in', region: '' },
				{ country: 'US', policyId: 'us-ca-opt-out', region: 'CA' },
			].map(async ({ country, policyId, region }) => {
				const response = await call(
					GET,
					'https://app.example.com/api/inth/v1/consent/init',
					{
						headers: {
							'x-vercel-ip-country': country,
							'x-vercel-ip-country-region': region,
						},
					}
				);
				expect(await response.json()).toMatchObject({
					policyResolution: { policyId, status: 'matched' },
				});
			})
		);
		expect(policyCalls(fetch)).toEqual([]);
	});

	test('GET answers init and the manifest, with the Data Cache hint', async () => {
		const fetch = manifestFetch();
		const { GET } = createConsentRoute({
			fetch,
			manifestRevalidateSeconds: 120,
			projectUrl: 'https://consent.example.com',
		});

		const init = await call(
			GET,
			'https://app.example.com/api/inth/v1/consent/init',
			{
				headers: { 'x-vercel-ip-country': 'DE' },
			}
		);
		const served = await call(
			GET,
			'https://app.example.com/api/inth/v1/consent/manifest',
			{
				headers: { 'if-none-match': '"manifest-revision"' },
			}
		);

		expect(init.headers.get('cache-control')).toBe('private, no-store');
		expect(await init.json()).toMatchObject({
			policyResolution: { policyId: 'eu-opt-in' },
		});
		expect(served.status).toBe(304);
		expect(policyCalls(fetch)).toHaveLength(1);
		expect(fetch).toHaveBeenCalledWith(
			'https://consent.example.com/v1/consent/manifest',
			expect.objectContaining({ next: { revalidate: 120 } })
		);
	});

	test('hands detached work to onBackgroundRevalidate', async () => {
		const fetch = manifestFetch();
		const registered: Promise<void>[] = [];
		const { GET } = createConsentRoute({
			fetch,
			onBackgroundRevalidate: (task) => {
				registered.push(task);
			},
			projectUrl: 'https://consent.example.com',
		});
		await call(GET, 'https://app.example.com/api/inth/v1/consent/init');
		expect(registered).toHaveLength(1);
		await registered[0];
		expect(fetch).toHaveBeenLastCalledWith(
			'https://consent.example.com/v1/consent/sessions',
			expect.objectContaining({ method: 'POST' })
		);
	});

	test('a config supplies projectUrl and never fetches its own route', async () => {
		const fetch = manifestFetch();
		const config = defineConsentConfig({
			mode: manifest({ resolve: 'browser', source: 'runtime' }),
			projectUrl: 'https://consent.example.com/api/inth',
			routePrefix: '/api/consent',
		});
		const { GET } = createConsentRoute({ config, fetch });
		await call(GET, 'https://app.example.com/api/consent/v1/consent/manifest');
		expect(fetch.mock.calls[0]?.[0]).toBe(
			'https://consent.example.com/api/inth/v1/consent/manifest'
		);
	});

	test("a mode's absolute manifestUrl is fetched instead of the backend's", async () => {
		const fetch = manifestFetch();
		const config = defineConsentConfig({
			mode: manifest({ manifestUrl: 'https://cdn.example.com/policy.json' }),
			projectUrl: 'https://consent.example.com',
		});
		const { GET } = createConsentRoute({ config, fetch });
		await call(GET, 'https://app.example.com/api/inth/v1/consent/manifest');
		expect(fetch.mock.calls[0]?.[0]).toBe(
			'https://cdn.example.com/policy.json'
		);
	});

	test('names the package when no backend is configured', async () => {
		const { GET } = createConsentRoute({});
		await expect(
			call(GET, 'https://app.example.com/api/inth/v1/consent/init')
		).rejects.toThrow('@inth/nextjs: pass projectUrl or manifestUrl.');
	});

	test('createManifestFetchInit defaults the Data Cache lifetime to 300 seconds', () => {
		expect(createManifestFetchInit().next).toEqual({ revalidate: 300 });
	});

	test('false disables the Data Cache rather than caching indefinitely', () => {
		expect(
			createManifestFetchInit({ manifestRevalidateSeconds: false }).next
		).toEqual({
			revalidate: 0,
		});
	});
});
