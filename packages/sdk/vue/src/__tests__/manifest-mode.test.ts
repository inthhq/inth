import { clientMode } from '@inth/sdk/runtime/client-mode';
import type { ConsentManifest, InitOutput } from '@inth/sdk/schema/types';
import { createConsentManifestPolicyPack } from '@inth/sdk/schema/types';
import { clearManifestCache } from '@inth/sdk/server';
import {
	getResolverInputsFromHeaders,
	resolveManifestInit,
} from '@inth/sdk/transports/manifest-cache';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import { createVueConsentKernelContext } from '../runtime/kernel';
import { manifest, selectedMode } from '../runtime/modes';
import {
	readNuxtMode,
	readNuxtRoutePrefix,
	resolvesOnServer,
} from '../runtime/nuxt-mode';

type WindowWithInth = Window & {
	__inthDebug?: {
		version: string;
		pkg: string;
		mode: string;
	};
};

// oxlint-disable-next-line func-style -- Preserve declaration order, interface shape, and public compatibility.
function createManifestFixture(): ConsentManifest {
	return {
		branding: 'inth',
		policyPacks: [
			createConsentManifestPolicyPack({
				categories: ['measurement', 'marketing'],
				id: 'eu-opt-in',
				match: { countries: ['DE'], fallback: true },
				model: 'opt-in',
				prompt: 'choice',
				scopeMode: 'strict',
				validity: { choiceDays: 365 },
			}),
			createConsentManifestPolicyPack({
				categories: ['marketing'],
				id: 'ca-opt-out',
				match: { regions: [{ country: 'US', region: 'CA' }] },
				model: 'opt-out',
				privacySignals: { gpc: { denyCategories: ['marketing'] } },
				prompt: 'choice',
				scopeMode: 'permissive',
				validity: { choiceDays: 365 },
			}),
		],
		revision: 'manifest-rev-1',
		schemaVersion: 2,
		translations: {
			i18n: {
				defaultProfile: 'default',
				messages: {
					default: {
						fallbackLanguage: 'en',
						translations: {
							de: {
								common: {
									acceptAll: 'Alle akzeptieren',
									rejectAll: 'Alle ablehnen',
								},
							},
							en: {
								common: {
									acceptAll: 'Accept all',
									rejectAll: 'Reject all',
								},
							},
						},
					},
				},
			},
		},
	};
}

afterEach(() => {
	clearManifestCache();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	delete (window as WindowWithInth).__inthDebug;
});

describe('manifest resolution in core', () => {
	test('resolves init locally from a cached manifest and geo headers', () => {
		const init = resolveManifestInit({
			headers: {
				'accept-language': 'de-DE,de;q=0.8,en;q=0.7',
				'x-inth-country': 'DE',
				'x-inth-region': 'BE',
			},
			manifest: createManifestFixture(),
		});

		expect(init).toMatchObject({
			branding: 'inth',
			location: {
				countryCode: 'DE',
				regionCode: 'BE',
			},
			policyResolution: {
				policy: { id: 'eu-opt-in', model: 'opt-in' },
				status: 'matched',
			},
		});
		expect(init.translations.language).toBe('de');
	});

	test('maps Sec-GPC through to resolver inputs', () => {
		expect(
			getResolverInputsFromHeaders({
				'accept-language': 'en-US,en;q=0.9',
				'sec-gpc': '1',
				'x-vercel-ip-country': 'US',
				'x-vercel-ip-country-region': 'CA',
			})
		).toEqual({
			country: 'US',
			gpc: true,
			language: 'en',
			region: 'CA',
		});
	});
});

describe('plain Vue modes', () => {
	test('manifest() resolves an inline snapshot without fetching policy', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>();
		const context = createVueConsentKernelContext({
			config: {},
			mode: manifest({
				fetch,
				inputs: { country: 'DE' },
				projectUrl: 'https://consent.example.com',
				snapshot: createManifestFixture(),
			}),
		});
		try {
			await context.kernel.commands.init();
			expect(context.snapshot.value.resolution).toMatchObject({
				policy: { id: 'eu-opt-in' },
				status: 'matched',
			});
			expect(fetch).not.toHaveBeenCalled();
		} finally {
			context.dispose();
		}
	});

	test("manifest() without a location sends the visitor to the backend's /v1/consent/init", async () => {
		// A region-based policy resolved for an unknown location could apply
		// the wrong region's rules. Core's default, shared with React,
		// Svelte and the browser package, asks the backend instead.
		const fetch = vi
			.fn<typeof globalThis.fetch>()
			.mockRejectedValue(new Error('offline'));
		const mode = manifest({
			fetch,
			projectUrl: 'https://consent.example.com',
			snapshot: createManifestFixture(),
		});
		const transport = mode({} as Parameters<typeof mode>[0]);
		await transport
			.init?.({
				journey: undefined,
				overrides: {},
			} as unknown as Parameters<NonNullable<typeof transport.init>>[0])
			.catch(() => null);
		expect(String(fetch.mock.calls[0]?.[0])).toContain(
			'https://consent.example.com/v1/consent/init'
		);
	});

	test('manifest({ initFallback: false }) resolves the unknown-location policy without a request', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>();
		const context = createVueConsentKernelContext({
			config: {},
			mode: manifest({
				fetch,
				initFallback: false,
				projectUrl: 'https://consent.example.com',
				snapshot: createManifestFixture(),
			}),
		});
		try {
			await context.kernel.commands.init();
			expect(context.snapshot.value.resolution).toMatchObject({
				matchedBy: 'fallback',
				policy: { id: 'eu-opt-in' },
			});
			expect(fetch).not.toHaveBeenCalled();
		} finally {
			context.dispose();
		}
	});

	test('manifest() reads the manifest from the backend without a build snapshot', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
			new Response(JSON.stringify(createManifestFixture()), {
				headers: { 'content-type': 'application/json' },
				status: 200,
			})
		);
		const context = createVueConsentKernelContext({
			config: {},
			mode: manifest({
				fetch,
				inputs: { country: 'DE' },
				projectUrl: 'https://consent.example.com',
			}),
		});
		try {
			await context.kernel.commands.init();
			expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
				'https://consent.example.com/v1/consent/manifest?manifestLevel=2',
			]);
			expect(context.snapshot.value.policyRule.id).toBe('eu-opt-in');
		} finally {
			context.dispose();
		}
	});

	test('manifest() and the hosted backend name the plugin when no backend URL is set', () => {
		// No `consentManifest()` plugin in this test, so the build supplied
		// no backend URL.
		expect(() => manifest()).toThrow('consentManifest() from @inth/vue/vite');
		expect(() => selectedMode({})).toThrow(
			'inth: `projectUrl` is required. Add consentManifest() from @inth/vue/vite to vite.config.ts and set VITE_INTH_PROJECT_URL, or pass `projectUrl`.'
		);
	});

	test('the plugin picks the hosted backend for a backend URL alone', () => {
		expect(selectedMode({ projectUrl: '/api/inth' }).kind).toBe('hosted');
	});

	test('the plugin rejects a config without a backend', () => {
		expect(() => createVueConsentKernelContext({ config: {} })).toThrow(
			'pass `projectUrl`'
		);
	});
});

describe('Nuxt modes', () => {
	test('manifest() is the default and gets the consent route', () => {
		const manifestMode = { type: 'manifest' as const };
		expect(readNuxtMode({})).toEqual({ type: 'manifest' });
		expect(readNuxtRoutePrefix({})).toBe('/api/inth');
		expect(readNuxtRoutePrefix({ mode: manifestMode })).toBe('/api/inth');
		expect(
			readNuxtRoutePrefix({ mode: manifestMode, routePrefix: '/consent/' })
		).toBe('/consent');
		expect(
			readNuxtRoutePrefix({ mode: manifestMode, routePrefix: false })
		).toBeUndefined();
		// Only manifest mode has a consent route.
		expect(
			readNuxtRoutePrefix({ mode: { type: 'hosted' }, routePrefix: '/c' })
		).toBeUndefined();
	});

	test('the server resolves the hosted backend and manifest(), the browser the rest', () => {
		expect(resolvesOnServer({ type: 'manifest' })).toBe(true);
		expect(resolvesOnServer({ type: 'hosted' })).toBe(true);
		expect(resolvesOnServer({ resolve: 'browser', type: 'manifest' })).toBe(
			false
		);
		expect(resolvesOnServer({ type: 'testing' })).toBe(false);
	});

	test('a server-resolved manifest re-inits through the consent route and saves to the backend', async () => {
		const init = resolveManifestInit({
			headers: {
				'accept-language': 'de',
				'x-inth-country': 'DE',
				'x-inth-region': 'BE',
			},
			manifest: createManifestFixture(),
		}) satisfies InitOutput;
		const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
			const url = String(input);
			if (url.split('?')[0] === '/internal/consent/v1/consent/init') {
				return new Response(JSON.stringify(init), {
					headers: { 'content-type': 'application/json' },
					status: 200,
				});
			}
			if (url.endsWith('/v1/consent/records')) {
				return new Response(
					JSON.stringify({
						recordId: '0193e5a8-8a00-7d3a-9b1c-6e3f8a0b1c2d',
						subjectId: '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c',
					}),
					{
						headers: { 'content-type': 'application/json' },
						status: 200,
					}
				);
			}
			return new Response('not found', { status: 404 });
		});
		vi.stubGlobal('fetch', fetchMock);

		const context = createVueConsentKernelContext({
			config: {},
			mode: clientMode(
				{ type: 'manifest' },
				{
					projectUrl: 'https://backend.example',
					routePrefix: '/internal/consent',
				}
			),
		});

		await context.kernel.commands.init();
		await context.kernel.commands.save('all');

		expect(
			fetchMock.mock.calls.map(([url]) => String(url).split('?')[0])
		).toEqual([
			'/internal/consent/v1/consent/init',
			'https://backend.example/v1/consent/records',
		]);
		expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'POST' });
		// The consent route resolves the manifest on the server and issues no
		// snapshot token, so the save must still assert the decision it was
		// made against.
		const body = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
		expect(body).toMatchObject({
			country: 'DE',
			fingerprint:
				createManifestFixture().policyPacks?.[0]?.fingerprints.policy,
			language: 'de',
			policyId: 'eu-opt-in',
			region: 'BE',
		});
		expect(typeof body.givenAt).toBe('number');
		context.dispose();
	});

	test('browser resolution reads the bundled snapshot and reports manifest mode', async () => {
		const fetchMock = vi.fn<typeof globalThis.fetch>();
		vi.stubGlobal('fetch', fetchMock);
		const context = createVueConsentKernelContext({
			config: {},
			mode: clientMode(
				{
					inputs: { country: 'DE' },
					resolve: 'browser',
					snapshot: createManifestFixture(),
					type: 'manifest',
				},
				{ projectUrl: 'https://backend.example' }
			),
		});
		try {
			context.start();
			await vi.waitFor(() => {
				expect(context.snapshot.value.policyRule.id).toBe('eu-opt-in');
			});
			expect(fetchMock).not.toHaveBeenCalled();
			expect((window as WindowWithInth).__inthDebug).toMatchObject({
				mode: 'manifest',
				pkg: '@inth/vue',
			});
		} finally {
			context.dispose();
		}
	});
});
