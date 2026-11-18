/**
 * `consentPrefetchHead()` starts the init request before hydration; the
 * root must find that promise again so the provider consumes it
 * instead of issuing a second request.
 */
import { primePrefetchedInitialData } from '@inth/sdk/engine';
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
	consentPrefetchHead,
	readPrefetchedInitialData,
} from '../libs/prefetch-head';

const ORIGIN = 'https://app.example.com';

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('consentPrefetchHead', () => {
	test('returns a head() fragment with one inline script', () => {
		const head = consentPrefetchHead({ projectUrl: '/api/c15t' });
		expect(head.scripts).toHaveLength(1);
		expect(head.scripts[0]?.id).toBe('c15t-initial-data-prefetch');
		expect(head.scripts[0]?.children).toContain('/init');
	});
});

describe('readPrefetchedInitialData', () => {
	test('is undefined on the server', () => {
		expect(
			readPrefetchedInitialData({
				overrides: undefined,
				projectUrl: `${ORIGIN}/consent`,
				routePrefix: undefined,
			})
		).toBeUndefined();
	});

	test('finds the promise a head prefetch stored for the route prefix', async () => {
		vi.stubGlobal('window', {
			location: { hostname: 'app.example.com', origin: ORIGIN },
		});
		const fetchSpy = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ policy: { id: 'prefetched' } }), {
				headers: { 'content-type': 'application/json' },
				status: 200,
			})
		);
		vi.stubGlobal('fetch', fetchSpy);

		const primed = primePrefetchedInitialData({ projectUrl: '/api/c15t' });
		const found = readPrefetchedInitialData({
			overrides: undefined,
			projectUrl: 'https://consent.example.com',
			routePrefix: '/api/c15t/',
		});

		expect(found).toBe(primed);
		await expect(found).resolves.toMatchObject({
			init: { policy: { id: 'prefetched' } },
		});
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	test('matches a head prefetch that carried the root GPC override', () => {
		vi.stubGlobal('window', {
			location: { hostname: 'app.example.com', origin: ORIGIN },
			navigator: { globalPrivacyControl: false },
		});
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));

		const primed = primePrefetchedInitialData({
			overrides: { gpc: true },
			projectUrl: '/api/c15t',
		});
		expect(
			readPrefetchedInitialData({
				overrides: { gpc: true },
				projectUrl: '/api/c15t',
				routePrefix: undefined,
			})
		).toBe(primed);
		expect(
			readPrefetchedInitialData({
				overrides: undefined,
				projectUrl: '/api/c15t',
				routePrefix: undefined,
			})
		).toBeUndefined();
	});
});

describe('readPrefetchedInitialData: default init target', () => {
	test('an absolute projectUrl matches a head prefetch keyed on the backend', () => {
		vi.stubGlobal('window', {
			location: { hostname: 'app.example.com', origin: ORIGIN },
		});
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));

		const primed = primePrefetchedInitialData({
			projectUrl: 'https://consent.example.com',
		});
		expect(
			readPrefetchedInitialData({
				overrides: undefined,
				projectUrl: 'https://consent.example.com',
				routePrefix: undefined,
			})
		).toBe(primed);
	});
});

describe('readPrefetchedInitialData: route prefix', () => {
	test('a root with routePrefix ignores a head prefetch keyed on the backend', () => {
		vi.stubGlobal('window', {
			location: { hostname: 'app.example.com', origin: ORIGIN },
		});
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
		primePrefetchedInitialData({ projectUrl: 'https://consent.example.com' });

		expect(
			readPrefetchedInitialData({
				overrides: undefined,
				projectUrl: 'https://consent.example.com',
				routePrefix: '/api/c15t',
			})
		).toBeUndefined();
	});
});
