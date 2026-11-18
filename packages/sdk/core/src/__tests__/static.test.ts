import type { ConsentManifest } from '@inth/sdk-schema/types';
import { createConsentManifestPolicyPack } from '@inth/sdk-schema/types';
import { describe, expect, test, vi } from 'vitest';

import {
	createStaticConsentResolver,
	resolveUnknownLocationInit,
} from '../static';

const deOptIn = createConsentManifestPolicyPack({
	categories: ['marketing', 'measurement'],
	id: 'de-opt-in',
	match: { countries: ['DE'] },
	model: 'opt-in',
	prompt: 'choice',
	scopeMode: 'strict',
});
const usCaOptOut = createConsentManifestPolicyPack({
	categories: ['marketing'],
	id: 'us-ca-opt-out',
	match: { regions: [{ country: 'US', region: 'CA' }] },
	model: 'opt-out',
	prompt: 'choice',
	scopeMode: 'permissive',
});
const unknownFallback = createConsentManifestPolicyPack({
	categories: ['marketing'],
	id: 'unknown-opt-out',
	match: { fallback: true },
	model: 'opt-out',
	prompt: 'notice',
	scopeMode: 'permissive',
});
const worldDefault = createConsentManifestPolicyPack({
	categories: [],
	id: 'world-default',
	match: { isDefault: true },
	model: 'none',
	prompt: 'none',
	scopeMode: 'permissive',
});

const manifestWith = (
	policyPacks: NonNullable<ConsentManifest['policyPacks']>
): ConsentManifest => ({
	branding: 'inth',
	policyPacks,
	revision: 'static-test',
	schemaVersion: 2,
});

const geoResponse = (body: unknown, status = 200) =>
	vi
		.fn<typeof globalThis.fetch>()
		.mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe('resolveUnknownLocationInit', () => {
	test('uses the fallback pack even when a regional pack is stricter', () => {
		for (const packs of [
			[deOptIn, unknownFallback, worldDefault],
			[worldDefault, unknownFallback, deOptIn],
		]) {
			const init = resolveUnknownLocationInit(manifestWith(packs), {
				language: 'en',
			});
			expect(init.policyResolution).toMatchObject({
				matchedBy: 'fallback',
				policyId: 'unknown-opt-out',
				status: 'matched',
			});
			expect(init.location).toEqual({ countryCode: null, regionCode: null });
		}
	});

	test('uses the default pack when no fallback is configured', () => {
		const init = resolveUnknownLocationInit(
			manifestWith([deOptIn, worldDefault])
		);
		expect(init.policyResolution).toMatchObject({
			policyId: 'world-default',
			status: 'matched',
		});
	});

	test('fails instead of applying a regional pack when nothing covers unknown location', () => {
		const init = resolveUnknownLocationInit(manifestWith([deOptIn]));
		expect(init.policyResolution).toMatchObject({
			policy: null,
			reason: 'insufficient-inputs',
			status: 'failed',
		});
	});
});

describe('createStaticConsentResolver', () => {
	const manifest = manifestWith([deOptIn, usCaOptOut, unknownFallback]);

	test('resolves a known location synchronously without fetching', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>();
		const resolution = createStaticConsentResolver({
			fetch,
			geo: { countryCode: 'DE' },
			geoUrl: 'https://geo.test/context',
			language: 'en',
			manifest,
		});
		expect(resolution.initial.policyResolution.policy?.id).toBe('de-opt-in');
		await expect(resolution.resolved).resolves.toBe(resolution.initial);
		expect(fetch).not.toHaveBeenCalled();
	});

	test('starts on the unknown-location policy and resolves the fetched region', async () => {
		const fetch = geoResponse({ countryCode: 'US', regionCode: 'CA' });
		const resolution = createStaticConsentResolver({
			fetch,
			geoUrl: 'https://geo.test/context',
			language: 'en',
			manifest,
		});
		expect(resolution.initial.policyResolution.policy?.id).toBe(
			'unknown-opt-out'
		);
		const resolved = await resolution.resolved;
		expect(resolved.policyResolution.policy?.id).toBe('us-ca-opt-out');
		expect(resolved.location).toEqual({ countryCode: 'US', regionCode: 'CA' });
		expect(fetch).toHaveBeenCalledWith(
			'https://geo.test/context',
			expect.objectContaining({ method: 'GET' })
		);
	});

	test.each([
		['a failed request', geoResponse({}, 503)],
		['an empty location', geoResponse({ country: null })],
		[
			'a network error',
			vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error('offline')),
		],
	])('keeps the initial result after %s', async (_label, fetch) => {
		const resolution = createStaticConsentResolver({
			fetch,
			geoUrl: 'https://geo.test/context',
			language: 'en',
			manifest,
		});
		await expect(resolution.resolved).resolves.toBe(resolution.initial);
	});

	test.each([
		['a numeric country', { country: 276 }],
		['blank strings', { countryCode: '  ', regionCode: '' }],
	])('treats %s as an unknown location', async (_label, geo) => {
		const known = createStaticConsentResolver({
			geo: geo as never,
			language: 'en',
			manifest,
		});
		expect(known.initial.policyResolution.policy?.id).toBe('unknown-opt-out');
		expect(known.initial.location).toEqual({
			countryCode: null,
			regionCode: null,
		});

		const fetched = createStaticConsentResolver({
			fetch: geoResponse(geo),
			geoUrl: 'https://geo.test/context',
			language: 'en',
			manifest,
		});
		await expect(fetched.resolved).resolves.toBe(fetched.initial);
	});

	test('reads a GPC getter that throws as no signal', () => {
		const throwing = {
			get globalPrivacyControl(): boolean {
				throw new Error('blocked');
			},
		};
		const saved = ['navigator', 'window'].map(
			(name) =>
				[name, Object.getOwnPropertyDescriptor(globalThis, name)] as const
		);
		for (const [name, descriptor] of saved) {
			Object.defineProperty(globalThis, name, {
				configurable: true,
				value:
					name === 'window'
						? { ...descriptor?.value, navigator: throwing }
						: throwing,
			});
		}
		try {
			expect(() =>
				createStaticConsentResolver({ language: 'en', manifest })
			).not.toThrow();
		} finally {
			for (const [name, descriptor] of saved) {
				if (descriptor) {
					Object.defineProperty(globalThis, name, descriptor);
				}
			}
		}
	});

	test('reads a lower-case location the way the browser manifest resolver does', async () => {
		const fetch = geoResponse({ country: 'us', region: 'ca' });
		const resolution = createStaticConsentResolver({
			fetch,
			geoUrl: '/api/geo',
			language: 'en',
			manifest,
		});
		const resolved = await resolution.resolved;
		expect(resolved.policyResolution.policy?.id).toBe('us-ca-opt-out');
		expect(resolved.location).toEqual({ countryCode: 'US', regionCode: 'CA' });
	});

	test('trims location fields and falls through to the other spelling', async () => {
		const resolution = createStaticConsentResolver({
			fetch: geoResponse({ country: 1, countryCode: ' US ', regionCode: 'CA' }),
			geoUrl: 'https://geo.test/context',
			language: 'en',
			manifest,
		});
		const resolved = await resolution.resolved;
		expect(resolved.policyResolution.policy?.id).toBe('us-ca-opt-out');
		expect(resolved.location).toEqual({ countryCode: 'US', regionCode: 'CA' });
	});
});
