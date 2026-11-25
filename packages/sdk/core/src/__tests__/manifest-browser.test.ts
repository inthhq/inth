/**
 * The browser manifest resolver: English bundled, other languages loaded on
 * demand, and a location from the page, `geoUrl` or the backend's `/v1/consent/init`.
 */
import {
	createConsentManifestPolicyPack,
	policyRulePresets,
} from '@inth/sdk-schema/types';
import type { ConsentManifest } from '@inth/sdk-schema/types';
import { baseTranslations } from '@inth/sdk-translations/all';
import { translations as germanCopy } from '@inth/sdk-translations/de';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import type { InitContext } from '../consent-kernel.model';
import type { ConsentMode } from '../modes';
import { earlyInitModes } from '../transports/early-init-modes';
import {
	createBrowserManifestTransport,
	manifest,
	withEarlyInit,
} from '../transports/manifest-browser';
import { manifestNeedsLocation } from '../transports/manifest-browser-location';
import { mayBeLocationFree } from '../transports/manifest-browser-packs.model';

const everywhereManifest: ConsentManifest = {
	branding: 'inth',
	policyPacks: [
		createConsentManifestPolicyPack({
			...policyRulePresets.europeOptIn(),
			id: 'everywhere',
			match: { isDefault: true },
		}),
	],
	revision: '1',
	schemaVersion: 2,
};

const geoManifest: ConsentManifest = {
	...everywhereManifest,
	policyPacks: [
		createConsentManifestPolicyPack(policyRulePresets.europeOptIn()),
	],
};

const initContext = (overrides: InitContext['overrides'] = {}): InitContext =>
	({ overrides, user: null }) as unknown as InitContext;

const jsonResponse = (body: unknown): Response =>
	new Response(JSON.stringify(body), {
		headers: { 'content-type': 'application/json' },
		status: 200,
	});

describe('manifest() from manifest-browser', () => {
	test('carries its options as data and reports the manifest kind', () => {
		const mode = manifest({
			projectUrl: 'https://backend.example',
			snapshot: everywhereManifest,
		});

		expect(mode.kind).toBe('manifest');
		expect(mode.type).toBe('manifest');
		expect(mode.snapshot).toBe(everywhereManifest);
		const asMode: ConsentMode = mode;
		expect(asMode.type).toBe('manifest');
	});

	test('throws without a manifest source', () => {
		expect(() => manifest({})).toThrow('needs `snapshot`');
	});
});

describe('createBrowserManifestTransport()', () => {
	test("loads the visitor's language and resolves with its base copy", async () => {
		const fetchSpy = vi.fn<typeof fetch>();
		const transport = createBrowserManifestTransport({
			fetch: fetchSpy,
			projectUrl: 'https://backend.example',
			snapshot: everywhereManifest,
		});

		const english = await transport.init?.(initContext({ language: 'en' }));
		const german = await transport.init?.(initContext({ language: 'de-DE' }));

		expect(english?.translations?.language).toBe('en');
		expect(german?.translations?.language).toBe('de');
		expect(german?.translations?.translations.common?.acceptAll).toBe(
			germanCopy.common.acceptAll
		);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	test('loads the base copy of every bundled language', async () => {
		const transport = createBrowserManifestTransport({
			projectUrl: 'https://backend.example',
			snapshot: everywhereManifest,
		});

		for (const [language, copy] of Object.entries(baseTranslations)) {
			// oxlint-disable-next-line no-await-in-loop -- One language at a time.
			const response = await transport.init?.(initContext({ language }));
			expect(response?.translations?.language).toBe(language);
			expect(response?.translations?.translations.common?.acceptAll).toBe(
				copy.common.acceptAll
			);
		}
	});

	test('loads the vendor list for an IAB policy', async () => {
		const vendorList = { vendorListVersion: 42, vendors: {} };
		const fetchSpy = vi.fn<typeof fetch>(() =>
			Promise.resolve(jsonResponse(vendorList))
		);
		const transport = createBrowserManifestTransport({
			fetch: fetchSpy,
			projectUrl: 'https://backend.example',
			snapshot: {
				...everywhereManifest,
				iab: {
					enabled: true,
					gvl: { url: 'https://gvl.example/vendor-list', version: 42 },
				},
				policyPacks: [
					createConsentManifestPolicyPack({
						categories: ['*'],
						id: 'everywhere-iab',
						match: { isDefault: true },
						model: 'iab',
						prompt: 'choice',
						scopeMode: 'strict',
					}),
				],
			},
		});

		const response = await transport.init?.(initContext({ language: 'en' }));

		expect(fetchSpy).toHaveBeenCalledWith(
			'https://gvl.example/vendor-list',
			expect.objectContaining({ method: 'GET' })
		);
		expect(response?.gvl).toEqual(vendorList);
		// A CORS simple request: only safelisted headers, so no preflight
		const headers = new Headers(fetchSpy.mock.calls[0]?.[1]?.headers);
		expect([...headers.keys()]).toEqual(['accept-language']);
	});

	test('loads Google Additional Consent providers beside the vendor list', async () => {
		const providers = {
			providers: {
				'89': { id: 89, name: 'Meta', policyUrl: 'https://meta.example/p' },
			},
		};
		const fetchSpy = vi.fn<typeof fetch>((input) =>
			Promise.resolve(
				jsonResponse(
					String(input).startsWith('https://lists.example/ac-browser')
						? providers
						: { vendorListVersion: 42, vendors: {} }
				)
			)
		);
		const transport = createBrowserManifestTransport({
			fetch: fetchSpy,
			projectUrl: 'https://backend.example',
			snapshot: {
				...everywhereManifest,
				iab: {
					additionalConsent: {
						providers: [89],
						url: 'https://lists.example/ac-browser',
					},
					enabled: true,
					gvl: { url: 'https://gvl.example/vendor-list', version: 42 },
				},
				policyPacks: [
					createConsentManifestPolicyPack({
						categories: ['*'],
						id: 'everywhere-iab',
						match: { isDefault: true },
						model: 'iab',
						prompt: 'choice',
						scopeMode: 'strict',
					}),
				],
			},
		});

		const response = await transport.init?.(initContext({ language: 'en' }));

		expect(response?.adTechProviders).toEqual([
			{ id: 89, name: 'Meta', policyUrl: 'https://meta.example/p' },
		]);
		// A CORS simple request: no custom header that would need a preflight
		const providerRequest = fetchSpy.mock.calls.find(([input]) =>
			String(input).startsWith('https://lists.example/ac-browser')
		);
		const headers = new Headers(providerRequest?.[1]?.headers);
		expect(headers.has('x-inth-version')).toBe(false);
		expect(headers.has('x-inth-policy-contract')).toBe(false);
	});

	test('withdraws ad tech providers once the manifest stops listing them', async () => {
		const transport = createBrowserManifestTransport({
			fetch: vi.fn<typeof fetch>(() =>
				Promise.resolve(jsonResponse({ vendorListVersion: 42, vendors: {} }))
			),
			projectUrl: 'https://backend.example',
			snapshot: {
				...everywhereManifest,
				iab: {
					enabled: true,
					gvl: { url: 'https://gvl.example/vendor-list', version: 42 },
				},
				policyPacks: [
					createConsentManifestPolicyPack({
						categories: ['*'],
						id: 'everywhere-iab',
						match: { isDefault: true },
						model: 'iab',
						prompt: 'choice',
						scopeMode: 'strict',
					}),
				],
			},
		});

		const response = await transport.init?.(initContext({ language: 'en' }));

		expect(response?.adTechProviders).toEqual([]);
	});

	test('asks geoUrl for a location the policy needs', async () => {
		const fetchSpy = vi.fn<typeof fetch>((input) =>
			Promise.resolve(
				String(input) === '/geo'
					? jsonResponse({ country: 'de' })
					: jsonResponse({})
			)
		);
		const transport = createBrowserManifestTransport({
			fetch: fetchSpy,
			geoUrl: '/geo',
			projectUrl: 'https://backend.example',
			snapshot: geoManifest,
		});

		const response = await transport.init?.(initContext({ language: 'en' }));
		await transport.init?.(initContext({ language: 'en' }));

		expect(fetchSpy.mock.calls.map(([url]) => String(url))).toEqual(['/geo']);
		expect(response?.location?.countryCode).toBe('DE');
	});

	test('falls back to GET /v1/consent/init without a location', async () => {
		const fetchSpy = vi.fn<typeof fetch>(() =>
			Promise.reject(new Error('offline'))
		);
		const transport = createBrowserManifestTransport({
			fetch: fetchSpy,
			projectUrl: 'https://backend.example',
			snapshot: geoManifest,
		});

		await transport.init?.(initContext({ language: 'en' })).catch(() => null);

		expect(String(fetchSpy.mock.calls[0]?.[0])).toContain(
			'https://backend.example/v1/consent/init'
		);
	});

	test('needs a region only for a country some pack splits by region', async () => {
		const fetchSpy = vi.fn<typeof fetch>(() =>
			Promise.reject(new Error('offline'))
		);
		const transport = createBrowserManifestTransport({
			fetch: fetchSpy,
			projectUrl: 'https://backend.example',
			snapshot: {
				...geoManifest,
				policyPacks: [
					...(geoManifest.policyPacks ?? []),
					createConsentManifestPolicyPack(
						policyRulePresets.usPrivacyStatesOptOut()
					),
				],
			},
		});

		const german = await transport.init?.(
			initContext({ country: 'DE', language: 'en' })
		);
		await transport
			.init?.(initContext({ country: 'US', language: 'en' }))
			.catch(() => null);

		expect(german?.location?.countryCode).toBe('DE');
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(String(fetchSpy.mock.calls[0]?.[0])).toContain('/v1/consent/init');
	});

	test('with initFallback off, resolves for an unknown location', async () => {
		const fetchSpy = vi.fn<typeof fetch>();
		const transport = createBrowserManifestTransport({
			fetch: fetchSpy,
			initFallback: false,
			projectUrl: 'https://backend.example',
			snapshot: geoManifest,
		});

		const response = await transport.init?.(initContext({ language: 'en' }));

		expect(fetchSpy).not.toHaveBeenCalled();
		expect(response?.location?.countryCode).toBeNull();
	});

	test('asks GET /v1/consent/init, with a warning, when the manifest is unavailable', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const fetchSpy = vi.fn<typeof fetch>((input) =>
			Promise.resolve(
				String(input).endsWith('/v1/consent/manifest')
					? new Response('missing', { status: 404 })
					: jsonResponse({
							location: { countryCode: 'DE', regionCode: null },
							translations: { language: 'en', translations: {} },
						})
			)
		);
		const transport = createBrowserManifestTransport({
			fetch: fetchSpy,
			projectUrl: 'https://fallback.example',
		});

		await transport.init?.(initContext({ language: 'en' }));

		expect(
			fetchSpy.mock.calls.map(([url]) => String(url).split('?')[0])
		).toEqual([
			'https://fallback.example/v1/consent/manifest',
			'https://fallback.example/v1/consent/init',
		]);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining(
				'could not read the consent manifest from https://fallback.example/v1/consent/manifest'
			)
		);
		warn.mockRestore();
	});

	test('fetches the manifest with the given headers and credentials', async () => {
		const fetchSpy = vi.fn<typeof fetch>(() =>
			Promise.resolve(jsonResponse(everywhereManifest))
		);
		const transport = createBrowserManifestTransport({
			credentials: 'include',
			fetch: fetchSpy,
			headers: { 'x-test': '1' },
			manifestUrl: 'https://backend.example/v1/consent/manifest',
		});

		await transport.init?.(initContext({ language: 'en' }));
		await transport.init?.(initContext({ language: 'en' }));

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [url, init] = fetchSpy.mock.calls[0] ?? [];
		expect(url).toBe('https://backend.example/v1/consent/manifest');
		expect(init?.credentials).toBe('include');
		expect(init?.headers).toMatchObject({
			accept: 'application/json',
			'x-test': '1',
		});
	});
});

/**
 * Keyed by location, but every location gets the same opt-in banner: only
 * the policy ids differ.
 */
const sameBannerEverywhere: ConsentManifest = {
	...everywhereManifest,
	policyPacks: [
		createConsentManifestPolicyPack(policyRulePresets.europeOptIn()),
		createConsentManifestPolicyPack(policyRulePresets.quebecOptIn()),
		createConsentManifestPolicyPack({
			...policyRulePresets.europeOptIn(),
			id: 'world_opt_in',
			match: { isDefault: true },
		}),
	],
};

/** A banner in Europe and Quebec, none in California or anywhere else. */
const bannerSomewhere: ConsentManifest = {
	...everywhereManifest,
	policyPacks: [
		createConsentManifestPolicyPack(policyRulePresets.europeOptIn()),
		createConsentManifestPolicyPack(policyRulePresets.quebecOptIn()),
		createConsentManifestPolicyPack(policyRulePresets.californiaOptOut()),
		createConsentManifestPolicyPack(policyRulePresets.worldNone()),
	],
};

describe('manifestNeedsLocation()', () => {
	test('is false when every location gets the same banner', () => {
		expect(manifestNeedsLocation(sameBannerEverywhere)).toBe(false);
	});

	test('is true when some location gets a different banner or none', () => {
		expect(manifestNeedsLocation(bannerSomewhere)).toBe(true);
		expect(manifestNeedsLocation(geoManifest)).toBe(true);
	});

	test('is true when two locations get the same behavior in another layout', () => {
		const [europe, quebec] = sameBannerEverywhere.policyPacks ?? [];
		const drawer = createConsentManifestPolicyPack({
			...policyRulePresets.europeOptIn(),
			id: 'world_opt_in',
			match: { isDefault: true },
			surface: { container: { side: 'end', type: 'drawer' } },
		});
		expect(drawer.fingerprints.policy).toBe(europe?.fingerprints.policy);
		const layouts = {
			...everywhereManifest,
			policyPacks: [europe, quebec, drawer].filter(
				(pack) => pack !== undefined
			),
		};
		expect(mayBeLocationFree(layouts)).toBe(false);
		expect(manifestNeedsLocation(layouts)).toBe(true);
	});

	test('is false when every location gets the same layout from its policy', () => {
		const surface = { container: { edge: 'top', type: 'banner' } } as const;
		const layouts = {
			...everywhereManifest,
			policyPacks: [
				createConsentManifestPolicyPack({
					...policyRulePresets.europeOptIn(),
					surface,
				}),
				createConsentManifestPolicyPack({
					...policyRulePresets.europeOptIn(),
					id: 'world_opt_in',
					match: { isDefault: true },
					surface,
				}),
			],
		};
		expect(mayBeLocationFree(layouts)).toBe(true);
		expect(manifestNeedsLocation(layouts)).toBe(false);
	});

	test('is true when a country with region packs and no region fails to match', () => {
		// Default but no fallback: a Canadian visitor without a province is
		// insufficient input, which shows no banner.
		expect(
			manifestNeedsLocation({
				...everywhereManifest,
				policyPacks: [
					createConsentManifestPolicyPack(policyRulePresets.quebecOptIn()),
					createConsentManifestPolicyPack({
						...policyRulePresets.quebecOptIn(),
						id: 'world_opt_in',
						match: { isDefault: true },
					}),
				],
			})
		).toBe(true);
	});
});

describe('createBrowserManifestTransport() for an unknown location', () => {
	test('answers in the browser when every location gets the same banner', async () => {
		const fetchSpy = vi.fn<typeof fetch>();
		const transport = createBrowserManifestTransport({
			fetch: fetchSpy,
			projectUrl: 'https://backend.example',
			snapshot: sameBannerEverywhere,
		});

		const response = await transport.init?.(initContext({ language: 'en' }));

		expect(fetchSpy).not.toHaveBeenCalled();
		expect(response?.location).toEqual({ countryCode: null, regionCode: null });
		expect(response?.policyResolution).toMatchObject({ status: 'matched' });
	});

	test('skips geoUrl when every location gets the same banner', async () => {
		const fetchSpy = vi.fn<typeof fetch>();
		const transport = createBrowserManifestTransport({
			fetch: fetchSpy,
			geoUrl: '/geo',
			projectUrl: 'https://backend.example',
			snapshot: sameBannerEverywhere,
		});

		await transport.init?.(initContext({ language: 'en' }));

		expect(fetchSpy).not.toHaveBeenCalled();
	});

	test('asks /init when the runtime mounts GPP', async () => {
		const fetchSpy = vi.fn<typeof fetch>(() =>
			Promise.reject(new Error('offline'))
		);
		const transport = createBrowserManifestTransport(
			{
				fetch: fetchSpy,
				projectUrl: 'https://backend.example',
				snapshot: sameBannerEverywhere,
			},
			{ gppEnabled: true }
		);

		await transport.init?.(initContext({ language: 'en' })).catch(() => null);

		expect(String(fetchSpy.mock.calls[0]?.[0])).toContain('/v1/consent/init');
	});

	test('starts the /init request within the init() call', () => {
		const fetchSpy = vi.fn<typeof fetch>(
			() =>
				new Promise<Response>(() => {
					/* never settles */
				})
		);
		const transport = createBrowserManifestTransport({
			fetch: fetchSpy,
			projectUrl: 'https://backend.example',
			snapshot: bannerSomewhere,
		});

		void transport.init?.(initContext({ language: 'en' }));

		expect(fetchSpy).toHaveBeenCalledOnce();
		expect(String(fetchSpy.mock.calls[0]?.[0])).toContain('/v1/consent/init');
	});
});

describe('withEarlyInit()', () => {
	const options = (snapshot: ConsentManifest, fetchSpy: typeof fetch) => ({
		fetch: fetchSpy,
		projectUrl: 'https://backend.example',
		snapshot,
	});

	afterEach(() => {
		delete (window as Window & { __gpp?: unknown }).__gpp;
	});

	test('says the first init asks the backend only when the snapshot cannot answer', () => {
		const fetchSpy = vi.fn<typeof fetch>();
		const somewhere = earlyInitModes.get(
			withEarlyInit(manifest(options(bannerSomewhere, fetchSpy)))
		);
		const same = earlyInitModes.get(
			withEarlyInit(manifest(options(sameBannerEverywhere, fetchSpy)))
		);
		const fetched = earlyInitModes.get(
			withEarlyInit(
				manifest({
					fetch: fetchSpy,
					manifestUrl: 'https://x.test/v1/consent/manifest',
				})
			)
		);

		expect(somewhere?.requestsInit({ language: 'en' })).toBe(true);
		expect(
			somewhere?.requestsInit({ country: 'US', language: 'en', region: 'NY' })
		).toBe(false);
		expect(same?.requestsInit({ language: 'en' })).toBe(false);
		// A fetched manifest cannot tell before its request.
		expect(fetched?.requestsInit({ language: 'en' })).toBe(false);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	test('asks /init when __gpp is installed', () => {
		const early = earlyInitModes.get(
			withEarlyInit(manifest(options(sameBannerEverywhere, vi.fn())))
		);
		expect(early?.requestsInit({ language: 'en' })).toBe(false);

		(window as Window & { __gpp?: unknown }).__gpp = () => undefined;

		expect(early?.requestsInit({ language: 'en' })).toBe(true);
	});

	test('builds a transport of its own for every call', () => {
		const mode = manifest(options(bannerSomewhere, vi.fn()));
		expect(mode({} as never)).not.toBe(mode({} as never));
	});

	test('recognizes a mode built again with an equal snapshot', () => {
		const fetchSpy = vi.fn<typeof fetch>();
		const register = (snapshot: ConsentManifest) =>
			earlyInitModes.get(withEarlyInit(manifest(options(snapshot, fetchSpy))));
		const first = register(structuredClone(bannerSomewhere));
		const again = register(structuredClone(bannerSomewhere));
		const edited = register({
			...structuredClone(bannerSomewhere),
			appName: 'other',
		});
		const other = register(sameBannerEverywhere);

		expect(first && again && first.sameAs(again)).toBe(true);
		expect(first && edited && first.sameAs(edited)).toBe(false);
		expect(first && other && first.sameAs(other)).toBe(false);
	});
});
