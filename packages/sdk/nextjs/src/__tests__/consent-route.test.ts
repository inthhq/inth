/**
 * The catch-all consent route. Route behaviour itself is pinned in core's
 * consent-route suite; these check the Next.js wiring: catch-all params,
 * 404s, proxying, and the config.
 */
import { clearManifestCache } from '@inth/sdk/server';
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	test,
	vi,
} from 'vite-plus/test';

import { createConsentRoute } from '../api';
import { defineConsentConfig } from '../config';
import { createPagesConsentRoute } from '../pages';
import { MANIFEST_FIXTURE } from './manifest-fixture';

const params = (...segments: string[]) => ({
	params: Promise.resolve({ inth: segments }),
});

const upstream = () =>
	vi.fn<typeof globalThis.fetch>((input) =>
		Promise.resolve(
			String(input).includes('/v1/consent/manifest')
				? Response.json(MANIFEST_FIXTURE)
				: Response.json({ ok: true }, { status: 201 })
		)
	);

beforeEach(() => {
	clearManifestCache();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('createConsentRoute', () => {
	test('serves manifest and init from the catch-all segment', async () => {
		const fetch = upstream();
		const { GET } = createConsentRoute({
			fetch,
			projectUrl: 'https://consent.example.com',
		});

		const manifest = await GET(
			new Request('https://app.example.com/api/inth/v1/consent/manifest'),
			params('v1', 'consent', 'manifest')
		);
		expect(await manifest.json()).toEqual(MANIFEST_FIXTURE);

		const init = await GET(
			new Request('https://app.example.com/api/inth/v1/consent/init', {
				headers: { 'x-vercel-ip-country': 'DE' },
			}),
			params('v1', 'consent', 'init')
		);
		expect(await init.json()).toMatchObject({
			policyResolution: { policyId: 'eu-opt-in', status: 'matched' },
		});
	});

	test('answers 404 for every other path without calling the backend', async () => {
		const fetch = upstream();
		const { GET } = createConsentRoute({
			fetch,
			projectUrl: 'https://consent.example.com',
		});

		const responses = await Promise.all(
			[
				['foo'],
				['v1', 'consent', 'records'],
				['v1', 'consent', 'manifest', 'extra'],
			].map((segments) =>
				GET(
					new Request(`https://app.example.com/api/inth/${segments.join('/')}`),
					params(...segments)
				)
			)
		);
		expect(responses.map((response) => response.status)).toEqual([
			404, 404, 404,
		]);
		expect(fetch).not.toHaveBeenCalled();
	});

	test('reads a config without fetching its own routes', async () => {
		const fetch = upstream();
		vi.stubGlobal('fetch', fetch);
		const { GET } = createConsentRoute({
			config: defineConsentConfig({
				projectUrl: 'https://consent.example.com',
				routePrefix: '/api/inth',
			}),
		});

		await GET(
			new Request('https://app.example.com/api/inth/v1/consent/manifest'),
			params('v1', 'consent', 'manifest')
		);
		expect(String(fetch.mock.calls[0]?.[0])).toBe(
			'https://consent.example.com/v1/consent/manifest?manifestLevel=1'
		);
	});

	test('forwards consent writes when proxy is on', async () => {
		const fetch = upstream();
		const handlers = createConsentRoute({
			fetch,
			projectUrl: 'https://consent.example.com',
			proxy: true,
		});

		const response = await handlers.POST(
			new Request('https://app.example.com/api/inth/v1/consent/records', {
				body: '{}',
				headers: { 'content-type': 'application/json' },
				method: 'POST',
			}),
			params('v1', 'consent', 'records')
		);

		expect(response.status).toBe(201);
		expect(String(fetch.mock.calls[0]?.[0])).toBe(
			'https://consent.example.com/v1/consent/records'
		);
	});

	test('rejects a config with routePrefix / when the route is created', () => {
		// A config passed here skips defineConsentConfig's check.
		expect(() =>
			createConsentRoute({
				config: { routePrefix: '/' },
				projectUrl: 'https://consent.example.com',
			})
		).toThrow(
			"@inth/nextjs: `routePrefix` can't be '/': a consent route at the site root would catch every page. Use a path such as '/api/inth'."
		);
		expect(() =>
			createPagesConsentRoute({
				config: { routePrefix: '/' },
				projectUrl: 'https://consent.example.com',
			})
		).toThrow(
			"@inth/nextjs: `routePrefix` can't be '/': a consent route at the site root would catch every page. Use a path such as '/api/inth'."
		);
	});
});
