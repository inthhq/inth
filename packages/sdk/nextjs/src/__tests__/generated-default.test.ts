import { manifest } from '@inth/sdk/modes';
/**
 * With `withConsentManifest` aliasing `@inth/sdk/generated` to
 * the snapshot, the route and `resolveConsent` read it without the app
 * passing `snapshot`.
 */
import { clearManifestCache } from '@inth/sdk/server';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { createConsentRoute } from '../api';
import { defineConsentConfig } from '../config';
import { resolveConsent } from '../server';
import { MANIFEST_FIXTURE } from './manifest-fixture';

// oxlint-disable-next-line anti-slop/no-module-mocking -- In an app build, the bundler alias `withConsentManifest` sets swaps this module for the generated snapshot. The mock is that alias; the helpers under test are real.
vi.mock('@inth/sdk/generated', async () => ({
	projectUrl: 'https://consent.example.com',
	snapshot: (await import('./manifest-fixture')).MANIFEST_FIXTURE,
}));

const config = defineConsentConfig({
	mode: manifest(),
	projectUrl: 'https://consent.example.com',
	routePrefix: '/api/inth',
});

const fetch = vi.fn<typeof globalThis.fetch>(() =>
	Promise.resolve(new Response(null, { status: 202 }))
);

beforeEach(() => {
	clearManifestCache();
	fetch.mockClear();
	vi.stubGlobal('fetch', fetch);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('generated manifest default', () => {
	test('the route serves the snapshot without fetching it', async () => {
		const { GET } = createConsentRoute({ config });

		const response = await GET(
			new Request('https://app.example.com/api/inth/v1/consent/manifest'),
			{ params: Promise.resolve({ inth: ['v1', 'consent', 'manifest'] }) }
		);

		expect(await response.json()).toEqual(MANIFEST_FIXTURE);
		expect(fetch).not.toHaveBeenCalled();
	});

	test('resolveConsent reads the snapshot', async () => {
		const state = await resolveConsent({
			config,
			request: {
				cookies: () => ({ toString: () => '' }),
				headers: () =>
					new Headers({
						host: 'app.example.com',
						'x-vercel-ip-country': 'DE',
					}),
			},
		});

		expect(JSON.stringify(state)).toContain('eu-opt-in');
		// Only the session report, detached from the render.
		expect(
			fetch.mock.calls.filter(([url]) => !String(url).endsWith('/sessions'))
		).toEqual([]);
	});

	test("source: 'runtime' fetches the backend's manifest instead", async () => {
		fetch.mockImplementation(() =>
			Promise.resolve(Response.json({ ...MANIFEST_FIXTURE, revision: 'live' }))
		);
		const { GET } = createConsentRoute({
			config: defineConsentConfig({
				mode: manifest({ source: 'runtime' }),
				projectUrl: 'https://consent.example.com',
			}),
		});

		const response = await GET(
			new Request('https://app.example.com/api/inth/v1/consent/manifest'),
			{ params: Promise.resolve({ inth: ['v1', 'consent', 'manifest'] }) }
		);

		expect(await response.json()).toMatchObject({ revision: 'live' });
		expect(String(fetch.mock.calls[0]?.[0])).toBe(
			'https://consent.example.com/v1/consent/manifest'
		);
	});

	test('an upstream manifestUrl wins over the snapshot', async () => {
		fetch.mockImplementation(() =>
			Promise.resolve(Response.json({ ...MANIFEST_FIXTURE, revision: 'up' }))
		);
		const { GET } = createConsentRoute({
			manifestUrl: 'https://cdn.example.com/manifest.json',
		});

		const response = await GET(
			new Request('https://app.example.com/api/inth/v1/consent/manifest'),
			{ params: Promise.resolve({ inth: ['v1', 'consent', 'manifest'] }) }
		);

		expect(await response.json()).toMatchObject({ revision: 'up' });
	});
});
