/**
 * Wiring tests for `resolveConsent` on top of `resolveRequestConsent` from
 * `@inth/sdk/server`. The resolution rules themselves (forwarding, budget,
 * self-route guard, deferral, experiment, shared renders) are pinned once in
 * the core suite; these check what the Next.js adapter supplies: the
 * request adapter's headers and cookies, the config's mode and route
 * prefix, and the development warning.
 */
import { hosted, manifest } from '@inth/sdk/modes';
import {
	resolvePolicyRules,
	writePolicyResolutionWire,
} from '@inth/sdk/schema/types';
import { clearManifestCache } from '@inth/sdk/server';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { defineConsentConfig } from '../config';
import type { ConsentConfig } from '../config';
import { resolveConsent } from '../server';
import type { NextRequestContext } from '../server';
import { MANIFEST_FIXTURE } from './manifest-fixture';

/** The requests that fetch policy, leaving out the session reports. */
const policyCalls = (spy: { mock: { calls: unknown[][] } }): string[] =>
	spy.mock.calls
		.map(([input]) => String(input))
		.filter((url) => !url.endsWith('/sessions'));

const INIT = {
	branding: 'inth',
	location: { countryCode: 'DE', regionCode: null },
	policyResolution: writePolicyResolutionWire(
		resolvePolicyRules({
			countryCode: 'DE',
			regionCode: null,
			rules: [
				{
					id: 'gdpr',
					match: { isDefault: true },
					model: 'opt-in',
					prompt: 'choice',
				},
			],
		})
	),
	translations: { language: 'en', translations: {} },
};

const answer = (body: unknown) =>
	Promise.resolve(
		new Response(JSON.stringify(body), {
			headers: {
				'content-type': 'application/json',
				'x-c15t-policy-contract': '1',
			},
		})
	);

const backend = () =>
	vi.fn<typeof globalThis.fetch>((input) =>
		answer(String(input).endsWith('/manifest') ? MANIFEST_FIXTURE : INIT)
	);

const requestOf = (
	headers: Record<string, string>,
	cookie = ''
): NextRequestContext => ({
	cookies: () => ({ toString: () => cookie }),
	headers: () => new Headers({ host: 'app.example.com', ...headers }),
});

/** A config that asks the backend's `/init` for every render. */
const hostedAt = (projectUrl: string, config: ConsentConfig = {}) =>
	defineConsentConfig({ mode: hosted(), ...config, projectUrl });

beforeEach(() => {
	clearManifestCache();
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('resolveConsent wiring', () => {
	test('the manifest is read at the backend, never at the route prefix', async () => {
		const fetch = backend();
		const state = await resolveConsent({
			config: defineConsentConfig({
				mode: manifest(),
				projectUrl: 'https://consent.example.com',
				routePrefix: '/api/consent',
			}),
			fetch,
			request: requestOf({ 'x-vercel-ip-country': 'DE' }),
		});
		expect(policyCalls(fetch)).toEqual([
			'https://consent.example.com/manifest',
		]);
		expect(fetch.mock.calls[0]?.[1]).toMatchObject({
			next: { revalidate: 300 },
		});
		expect(state.initialPolicyResolution).toMatchObject({
			policyId: 'eu-opt-in',
			status: 'matched',
		});
	});

	test("manifest({ resolve: 'browser' }) still resolves the render from the backend's manifest", async () => {
		// The browser resolver is for re-inits; a render that resolves holds
		// the policy, so a returning visitor's stored choice can be checked
		// before the engine loads.
		const fetch = backend();
		const state = await resolveConsent({
			config: defineConsentConfig({
				mode: manifest({
					manifestUrl: '/api/inth/manifest',
					resolve: 'browser',
				}),
				projectUrl: 'https://consent.example.com',
			}),
			fetch,
			request: requestOf({ 'x-vercel-ip-country': 'DE' }),
		});
		expect(policyCalls(fetch)).toEqual([
			'https://consent.example.com/manifest',
		]);
		expect(state.initialPolicyResolution).toMatchObject({
			policyId: 'eu-opt-in',
			status: 'matched',
		});
	});

	test('a tab config reports a page journey, and false turns it off', async () => {
		const tab = backend();
		const started = await resolveConsent({
			config: hostedAt('https://consent.example.com', { journey: 'tab' }),
			fetch: tab,
			request: requestOf({}),
		});
		const sent = new URL(String(tab.mock.calls[0]?.[0]));
		// A server-rendered page is a page journey, even under 'tab'.
		expect(sent.searchParams.get('journeyScope')).toBe('page');
		expect(sent.searchParams.get('journey')).toBe(started.journey?.id);

		for (const options of [
			{ config: hostedAt('https://consent.example.com', { journey: false }) },
		]) {
			const off = backend();
			// oxlint-disable-next-line no-await-in-loop -- One render at a time keeps the calls apart.
			const state = await resolveConsent({
				...options,
				fetch: off,
				request: requestOf({}),
			});
			// The state tells ConsentRoot this page has no journey.
			expect(state.journey).toBeNull();
			expect(String(off.mock.calls[0]?.[0])).toBe(
				'https://consent.example.com/init'
			);
		}
	});

	test('with proxy, the server still reads the absolute backend', async () => {
		const manifestFetch = backend();
		await resolveConsent({
			config: defineConsentConfig({
				mode: manifest(),
				projectUrl: 'https://consent.example.com',
				proxy: true,
				routePrefix: '/api/consent',
			}),
			fetch: manifestFetch,
			request: requestOf({ 'x-vercel-ip-country': 'DE' }),
		});
		expect(policyCalls(manifestFetch)).toEqual([
			'https://consent.example.com/manifest',
		]);

		const initFetch = backend();
		await resolveConsent({
			config: hostedAt('https://consent.example.com', {
				proxy: true,
				routePrefix: '/api/consent',
			}),
			fetch: initFetch,
			request: requestOf({}),
		});
		expect(String(initFetch.mock.calls[0]?.[0]).split('?')[0]).toBe(
			'https://consent.example.com/init'
		);
	});

	test('hosted() asks the backend /init with the request inputs', async () => {
		const fetch = backend();
		const state = await resolveConsent({
			config: hostedAt('https://consent.example.com'),
			country: 'FR',
			fetch,
			request: requestOf({ 'accept-language': 'de-DE' }, 'inth=x; session=y'),
		});
		// The query carries the consent journey the render started.
		expect(String(fetch.mock.calls[0]?.[0]).split('?')[0]).toBe(
			'https://consent.example.com/init'
		);
		expect(fetch.mock.calls[0]?.[1]?.cache).toBe('no-store');
		const headers = new Headers(fetch.mock.calls[0]?.[1]?.headers);
		expect(headers.get('x-c15t-country')).toBe('FR');
		expect(headers.get('accept-language')).toBe('de');
		expect(headers.get('cookie')).toBe('inth=x');
		expect(state.initialPolicyResolution?.status).toBe('matched');
	});

	test('a relative backend prefix (rewrite or mounted backend) is asked for /init', async () => {
		const fetch = backend();
		const state = await resolveConsent({
			config: hostedAt('/api/backend'),
			fetch,
			request: requestOf({ 'x-vercel-ip-country': 'DE' }),
		});
		expect(
			fetch.mock.calls.map(([input]) => String(input).split('?')[0])
		).toEqual(['https://app.example.com/api/backend/init']);
		const headers = new Headers(fetch.mock.calls[0]?.[1]?.headers);
		expect(headers.get('x-c15t-country')).toBe('DE');
		expect(state.initialPolicyResolution?.status).toBe('matched');
	});

	test('a render reached by another render’s own request does not fetch its origin again', async () => {
		const fetch = backend();
		const first = await resolveConsent({
			config: hostedAt('/api/backend'),
			fetch,
			request: requestOf({}),
		});
		expect(first.initialPolicyResolution?.status).toBe('matched');
		// An unmounted prefix answers with a page whose layout resolves again,
		// carrying the headers the first render sent.
		const sent = new Headers(fetch.mock.calls[0]?.[1]?.headers);
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const nested = await resolveConsent({
			config: hostedAt('/api/backend'),
			fetch,
			request: requestOf(Object.fromEntries(sent)),
		});
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(nested.initialPolicyResolution).toBeUndefined();
		expect(String(warn.mock.calls[0]?.[0])).toContain(
			'https://app.example.com/api/backend/init'
		);
	});

	test('never fetches the default /api/inth route, with no routePrefix set', async () => {
		const fetch = backend();
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const state = await resolveConsent({
			config: hostedAt('/api/inth'),
			fetch,
			request: requestOf({}),
		});
		expect(fetch).not.toHaveBeenCalled();
		expect(state.initialPolicyResolution).toBeUndefined();
		expect(String(warn.mock.calls[0]?.[0])).toContain(
			"this app's own consent route"
		);
	});

	test('never fetches under the route prefix, and says so outside production', async () => {
		const fetch = backend();
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const config = defineConsentConfig({
			mode: manifest(),
			projectUrl: '/api/inth',
			routePrefix: '/api/inth',
		});
		const state = await resolveConsent({
			config,
			fetch,
			request: requestOf({}),
		});
		expect(fetch).not.toHaveBeenCalled();
		expect(state.initialPolicyResolution).toBeUndefined();
		expect(String(warn.mock.calls[0]?.[0])).toContain(
			'https://app.example.com/api/inth/manifest'
		);
		// The handler's own upstream resolves it, as the docs describe.
		const resolved = await resolveConsent({
			config,
			fetch,
			projectUrl: 'https://consent.example.com',
			request: requestOf({ 'x-vercel-ip-country': 'DE' }),
		});
		expect(policyCalls(fetch)).toEqual([
			'https://consent.example.com/manifest',
		]);
		expect(resolved.initialPolicyResolution?.status).toBe('matched');
	});

	test('rejects a config with routePrefix / that skipped defineConsentConfig', async () => {
		await expect(
			resolveConsent({
				config: { routePrefix: '/' },
				projectUrl: 'https://consent.example.com',
				request: requestOf({}),
			})
		).rejects.toThrow(
			"@inth/nextjs: `routePrefix` can't be '/': a consent route at the site root would catch every page. Use a path such as '/api/inth'."
		);
	});

	test('rejects a config routePrefix that is neither a path nor an http(s) URL', async () => {
		await expect(
			resolveConsent({
				config: { routePrefix: 'api/inth' },
				projectUrl: 'https://consent.example.com',
				request: requestOf({}),
			})
		).rejects.toThrow(
			'@inth/nextjs: defineConsentConfig `routePrefix` must be an absolute http(s) URL or a `/`-relative path, received "api/inth".'
		);
	});

	test('onError replaces the warning; production stays quiet', async () => {
		const failing = vi.fn<typeof globalThis.fetch>(() =>
			Promise.reject(new Error('network down'))
		);
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const onError = vi.fn();
		await resolveConsent({
			config: hostedAt('https://consent.example.com'),
			fetch: failing,
			onError,
			request: requestOf({}),
		});
		expect(onError).toHaveBeenCalledTimes(1);
		expect(String(onError.mock.calls[0]?.[0])).toContain('network down');
		vi.stubGlobal('process', { env: { NODE_ENV: 'production' } });
		await resolveConsent({
			config: hostedAt('https://consent.example.com'),
			fetch: failing,
			request: requestOf({}),
		});
		expect(warn).not.toHaveBeenCalled();
	});

	test('reads cookies() when the headers carry none, and keeps the experiment', async () => {
		const experiment = {
			arm: 'b',
			arms: [{ id: 'a' }, { id: 'b' }],
			id: 'banner',
		} as unknown as NonNullable<
			Parameters<typeof resolveConsent>[0]
		>['experiment'];
		const fetch = backend();
		const state = await resolveConsent({
			config: hostedAt('https://consent.example.com'),
			experiment,
			fetch,
			request: {
				cookies: () => ({ toString: () => 'inth=x' }),
				headers: () => new Headers({ host: 'app.example.com' }),
			},
		});
		const headers = new Headers(fetch.mock.calls[0]?.[1]?.headers);
		expect(headers.get('cookie')).toBe('inth=x');
		expect(state.experiment).toBe(experiment);
	});
});
