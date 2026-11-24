/**
 * Contract suite for the consent route handler every server adapter mounts.
 *
 * Next.js, TanStack Start, SvelteKit, Astro and Nuxt each used to carry
 * their own copy of these routes, and the copies drifted. Each test here
 * pins one rule for all of them; the adapters only test their wiring.
 */
import type {
	ConsentManifest,
	GlobalVendorList,
	InitOutput,
} from '@inth/sdk-schema/types';
import {
	createConsentManifestPolicyPack,
	resolvePolicyRules,
	writePolicyResolutionWire,
} from '@inth/sdk-schema/types';
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	test,
	vi,
} from 'vite-plus/test';

import { clearManifestCache } from '../../libs/manifest-cache-runtime';
import type { ManifestFetch } from '../../libs/manifest-cache-runtime';
import { clearGvlCache } from '../../transports/gvl-cache';
import {
	CONSENT_ROUTE_TIMEOUT_HEADER,
	createConsentRouteHandler,
	readRequestForwarding,
	readWaitUntil,
} from '../consent-route';
import type { ConsentRouteHandlerOptions } from '../consent-route';
import { GVL_FETCH_TIMEOUT_MS } from '../gvl-cache';

const BACKEND = 'https://consent.example.com';
const APP = 'https://app.example.com';
const GVL_URL = 'https://gvl.example/vendor-list.json';

const MANIFEST: ConsentManifest = {
	branding: 'inth',
	policyPacks: [
		createConsentManifestPolicyPack({
			categories: ['measurement', 'marketing'],
			id: 'eu-opt-in',
			match: { countries: ['DE'] },
			model: 'opt-in',
			prompt: 'choice',
			scopeMode: 'strict',
			validity: { choiceDays: 365 },
		}),
		createConsentManifestPolicyPack({
			categories: [],
			id: 'notice-default',
			match: { isDefault: true },
			model: 'opt-out',
			prompt: 'none',
			scopeMode: 'permissive',
			validity: { choiceDays: 30 },
		}),
	],
	revision: 'manifest-revision',
	schemaVersion: 2,
	translations: {
		i18n: {
			defaultProfile: 'default',
			messages: {
				default: {
					fallbackLanguage: 'en',
					translations: {
						de: { common: { acceptAll: 'Alle akzeptieren' } },
						en: { common: { acceptAll: 'Accept all' } },
					},
				},
			},
		},
	},
} as unknown as ConsentManifest;

const IAB_MANIFEST = {
	...MANIFEST,
	cmpId: 28,
	iab: { enabled: true, gvl: { url: GVL_URL } },
	policyPacks: [
		createConsentManifestPolicyPack({
			id: 'iab',
			match: { fallback: true },
			model: 'iab',
			prompt: 'choice',
		}),
	],
} as unknown as ConsentManifest;

const GVL = {
	purposes: { '1': { id: 1, name: 'Store and/or access information' } },
	vendorListVersion: 42,
	vendors: { '1': { id: 1, name: 'Vendor', purposes: [1] } },
} as unknown as GlobalVendorList;

type FetchMock = ReturnType<typeof vi.fn<ManifestFetch>>;

const json = function json(
	body: unknown,
	headers: Record<string, string> = {},
	status = 200
): Response {
	return new Response(JSON.stringify(body), {
		headers: { 'content-type': 'application/json', ...headers },
		status,
	});
};

/** A fetch that serves the manifest, the vendor list and session reports. */
const upstream = function upstream(
	manifest: ConsentManifest = MANIFEST,
	manifestHeaders: Record<string, string> = {
		'cache-control': 'public, s-maxage=120, stale-while-revalidate=60',
		'content-language': 'en',
		etag: '"manifest-revision"',
		'last-modified': 'Tue, 01 Sep 2026 00:00:00 GMT',
		vary: 'accept-language',
	}
): FetchMock {
	return vi.fn<ManifestFetch>((input) => {
		const url = String(input instanceof Request ? input.url : input);
		if (url.startsWith(GVL_URL)) {
			return Promise.resolve(json(GVL));
		}
		if (url.endsWith('/sessions')) {
			return Promise.resolve(new Response(null, { status: 202 }));
		}
		return Promise.resolve(json(manifest, manifestHeaders));
	});
};

const route = function route(
	options: Partial<ConsentRouteHandlerOptions> = {}
) {
	return createConsentRouteHandler({
		adapter: '@c15t/test',
		projectUrl: BACKEND,
		...options,
	});
};

const request = function request(
	path: string,
	init: RequestInit & { headers?: Record<string, string> } = {}
): Request {
	return new Request(`${APP}${path}`, init);
};

const calledURLs = (fetch: FetchMock): string[] =>
	fetch.mock.calls.map(([input]) => String(input));

const callHeaders = (fetch: FetchMock, index = 0): Headers =>
	new Headers(fetch.mock.calls[index]?.[1]?.headers);

const flush = () =>
	new Promise<void>((resolve) => {
		setTimeout(resolve, 0);
	});

beforeEach(() => {
	clearManifestCache();
	clearGvlCache();
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

describe('dispatch', () => {
	test.each([
		['v1/consent/init', 'init'],
		['', 'init'],
		['/v1/consent/init/', 'init'],
		['v1/consent/manifest', 'manifest'],
	])('path %j answers %s', async (path, expected) => {
		const handle = route({ fetch: upstream() });
		const response = await handle(request('/api/inth/x'), { path });
		expect(response.headers.get('cache-control')).toBe(
			expected === 'init'
				? 'private, no-store'
				: 'public, s-maxage=120, stale-while-revalidate=60'
		);
	});

	test('a fixed mount picks the manifest from its last segment and init otherwise', async () => {
		const handle = route({ fetch: upstream() });
		const manifest = await handle(request('/api/inth/v1/consent/manifest'));
		const init = await handle(request('/api/inth'));
		expect(manifest.headers.get('etag')).toBe('"manifest-revision"');
		expect(init.headers.get('cache-control')).toBe('private, no-store');
	});

	test('without the proxy an unknown read is a 404, a write a 405, and neither reaches upstream', async () => {
		const fetch = upstream();
		const handle = route({ fetch });
		const unknown = await handle(request('/api/inth/subjects'), {
			path: 'subjects',
		});
		const write = await handle(
			request('/api/inth/v1/consent/records', { body: '{}', method: 'POST' }),
			{ path: 'v1/consent/records' }
		);
		expect(unknown.status).toBe(404);
		expect(write.status).toBe(405);
		expect(fetch).not.toHaveBeenCalled();
	});

	test('rejects long unknown paths in linear time', async () => {
		const path = `unknown/${'/'.repeat(100_000)}missing///`;
		const handle = route({ fetch: upstream() });
		const start = performance.now();
		const response = await handle(request(`/api/inth/${path}`), {
			path: `///${path}`,
		});
		expect(performance.now() - start).toBeLessThan(1000);
		expect(response.status).toBe(404);
	});
});

describe('upstream source', () => {
	test('reads the manifest below projectUrl, or manifestUrl when set', async () => {
		const fromBackend = upstream();
		await route({ fetch: fromBackend })(
			request('/api/inth/v1/consent/manifest')
		);
		const fromManifestUrl = upstream();
		await route({
			fetch: fromManifestUrl,
			manifestUrl: 'https://cdn.example.com/m.json',
		})(request('/api/inth/v1/consent/manifest'));
		expect(calledURLs(fromBackend)).toEqual([`${BACKEND}/v1/consent/manifest`]);
		expect(calledURLs(fromManifestUrl)).toEqual([
			'https://cdn.example.com/m.json',
		]);
	});

	test('a relative URL resolves against request.url, never a forged forwarding header', async () => {
		const fetch = upstream();
		await route({ fetch, projectUrl: '/consent-backend' })(
			request('/api/inth/v1/consent/manifest', {
				headers: { 'x-forwarded-host': 'evil.example' },
			})
		);
		expect(calledURLs(fetch)).toEqual([
			`${APP}/consent-backend/v1/consent/manifest`,
		]);
	});

	test('a relative URL resolves against forwarding headers when they are trusted', async () => {
		const fetch = upstream();
		await route({
			fetch,
			projectUrl: '/consent-backend',
			trustForwardedHeaders: true,
		})(
			request('/api/inth/v1/consent/manifest', {
				headers: {
					'x-forwarded-host': 'public.example',
					'x-forwarded-proto': 'https',
				},
			})
		);
		expect(calledURLs(fetch)).toEqual([
			'https://public.example/consent-backend/v1/consent/manifest',
		]);
	});

	test('with localFetch a relative URL is fetched in-process by path, whatever the Host', async () => {
		const fetch = upstream();
		const localFetch = upstream();
		await route({ fetch, projectUrl: '/api/self-host' })(
			new Request('http://evil.example/api/inth/v1/consent/manifest'),
			{ localFetch, route: 'manifest' }
		);
		expect(calledURLs(localFetch)).toEqual([
			'/api/self-host/v1/consent/manifest',
		]);
		expect(fetch).not.toHaveBeenCalled();
	});

	test('an absolute URL uses the configured fetch even with localFetch', async () => {
		const fetch = upstream();
		const localFetch = upstream();
		await route({ fetch })(request('/api/inth/v1/consent/manifest'), {
			localFetch,
		});
		expect(calledURLs(fetch)).toEqual([`${BACKEND}/v1/consent/manifest`]);
		expect(localFetch).not.toHaveBeenCalled();
	});

	test('throws without a configured URL, whatever the environment says', async () => {
		vi.stubEnv('INTH_PROJECT_URL', BACKEND);
		vi.stubEnv('C15T_BACKEND_URL', BACKEND);
		const handle = route({ projectUrl: undefined });
		await expect(handle(request('/api/inth/v1/consent/init'))).rejects.toThrow(
			'@c15t/test: pass projectUrl or manifestUrl.'
		);
		await expect(
			handle(request('/api/inth/v1/consent/manifest'))
		).rejects.toThrow('@c15t/test: pass projectUrl or manifestUrl.');
	});

	test('rejects a projectUrl or manifestUrl it cannot resolve', async () => {
		await expect(
			route({ projectUrl: 'consent.example.com' })(
				request('/api/inth/v1/consent/init')
			)
		).rejects.toThrow('@c15t/test: invalid projectUrl.');
		await expect(
			route({ manifestUrl: '//evil.example/manifest' })(
				request('/api/inth/v1/consent/manifest')
			)
		).rejects.toThrow('@c15t/test: invalid manifestUrl.');
	});

	test('an invalid manifestUrl is an error, not a reason to fall back to /v1/consent/init', async () => {
		const fetch = upstream();
		await expect(
			route({ fetch, manifestUrl: 'not a url' })(
				request('/api/inth/v1/consent/init')
			)
		).rejects.toThrow('@c15t/test: invalid manifestUrl.');
		expect(fetch).not.toHaveBeenCalled();
	});

	test('passes the framework fetch hint to the manifest request', async () => {
		const fetch = upstream();
		await route({ fetch, manifestFetchInit: { cache: 'force-cache' } })(
			request('/api/inth/v1/consent/init')
		);
		expect(fetch.mock.calls[0]?.[1]).toMatchObject({ cache: 'force-cache' });
	});
});

describe('manifest route', () => {
	test('passes the backend cache headers through and invents none', async () => {
		const handle = route({ fetch: upstream() });
		const response = await handle(request('/api/inth/v1/consent/manifest'));
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('application/json');
		expect(response.headers.get('cache-control')).toBe(
			'public, s-maxage=120, stale-while-revalidate=60'
		);
		expect(response.headers.get('etag')).toBe('"manifest-revision"');
		expect(response.headers.get('last-modified')).toBe(
			'Tue, 01 Sep 2026 00:00:00 GMT'
		);
		expect(response.headers.get('content-language')).toBe('en');
		// The body depends only on the URL.
		expect(response.headers.get('vary')).toBeNull();
		expect(await response.json()).toEqual(MANIFEST);

		clearManifestCache();
		const bare = await route({ fetch: upstream(MANIFEST, {}) })(
			request('/api/inth/v1/consent/manifest')
		);
		expect(bare.headers.get('cache-control')).toBeNull();
		expect(bare.headers.get('x-inth-next-revalidate')).toBeNull();
	});

	test.each([false, true])(
		'forwards the remaining Age from one upstream read, conditional=%s',
		async (conditional) => {
			const clock = vi.spyOn(Date, 'now').mockReturnValue(0);
			const fetch = upstream(MANIFEST, {
				age: '55',
				'cache-control': 's-maxage=60',
				etag: '"v1"',
			});
			const handle = route({ fetch });
			const first = await handle(request('/api/inth/v1/consent/manifest'));
			expect(first.headers.get('age')).toBe('55');
			clock.mockReturnValue(2000);
			const second = await handle(
				request('/api/inth/v1/consent/manifest', {
					headers: conditional ? { 'if-none-match': '"v1"' } : {},
				})
			);
			expect(second.status).toBe(conditional ? 304 : 200);
			expect(await second.text()).toBe(
				conditional ? '' : JSON.stringify(MANIFEST)
			);
			expect(second.headers.get('age')).toBe('57');
			expect(second.headers.get('cache-control')).toBe('s-maxage=60');
			expect(fetch).toHaveBeenCalledTimes(1);
		}
	);

	test('serves the body when the ETag does not match', async () => {
		const response = await route({ fetch: upstream() })(
			request('/api/inth/v1/consent/manifest', {
				headers: { 'if-none-match': '"old"' },
			})
		);
		expect(response.status).toBe(200);
	});

	test("hands a stale read's refresh to waitUntil", async () => {
		vi.useFakeTimers();
		const fetch = upstream(MANIFEST, {
			'cache-control': 'public, s-maxage=1, stale-while-revalidate=600',
		});
		const registered: Promise<void>[] = [];
		const handle = route({ fetch });
		const waitUntil = (task: Promise<void>) => {
			registered.push(task);
		};
		await handle(request('/api/inth/v1/consent/manifest'), { waitUntil });
		expect(registered).toHaveLength(0);
		vi.advanceTimersByTime(1500);
		const stale = await handle(request('/api/inth/v1/consent/manifest'), {
			waitUntil,
		});
		expect(stale.status).toBe(200);
		expect(registered).toHaveLength(1);
		await expect(registered[0]).resolves.toBeUndefined();
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	test.each([
		['DE-de', '?language=de-de'],
		['fr', '?language=fr'],
		['<script>', ''],
		['a'.repeat(40), ''],
	])(
		'forwards only a validated language query: %s',
		async (language, search) => {
			const fetch = upstream();
			await route({ fetch })(
				request(
					`/api/inth/v1/consent/manifest?utm_source=mail&language=${encodeURIComponent(language)}&visitor=42`
				)
			);
			expect(calledURLs(fetch)).toEqual([
				`${BACKEND}/v1/consent/manifest${search}`,
			]);
		}
	);

	test('the visitor query never splits the cache', async () => {
		const fetch = upstream();
		const handle = route({ fetch });
		await handle(request('/api/inth/v1/consent/manifest?a=1'));
		await handle(request('/api/inth/v1/consent/manifest?b=2'));
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	test("copies the manifest's script registry list onto the init it serves", async () => {
		const scriptSources = {
			posthog: {
				integrity: 'sha384-posthog',
				src: 'https://acme.inth.app/scripts/posthog@0123456789abcdef.js',
			},
		};
		const handle = route({
			fetch: upstream(),
			manifest: { ...MANIFEST, scriptRegistry: { sources: scriptSources } },
		});
		const init = await handle(request('/api/inth/v1/consent/init'), {
			inputs: { country: 'DE' },
		});
		expect((await init.json()).scriptRegistry?.sources).toEqual(scriptSources);
	});

	test('serves an inline manifest without fetching', async () => {
		const fetch = upstream();
		const handle = route({ fetch, manifest: MANIFEST });
		const response = await handle(request('/api/inth/v1/consent/manifest'));
		expect(await response.json()).toEqual(MANIFEST);
		const init = await handle(request('/api/inth/v1/consent/init'), {
			inputs: { country: 'DE' },
		});
		expect(await init.json()).toMatchObject({
			policyResolution: { policyId: 'eu-opt-in' },
		});
		expect(calledURLs(fetch).every((url) => url.endsWith('/sessions'))).toBe(
			true
		);
	});
});

describe('manifest request credentials', () => {
	test('with the proxy on, sends the named cookies and extra headers only', async () => {
		const fetch = upstream();
		await route({
			fetch,
			proxy: { cookieNames: ['inth'], forwardHeaders: ['authorization'] },
		})(
			request('/api/inth/v1/consent/manifest', {
				headers: {
					authorization: 'Bearer tenant',
					cookie: 'session=secret; inth=abc',
				},
			})
		);
		const headers = callHeaders(fetch);
		expect(headers.get('cookie')).toBe('inth=abc');
		expect(headers.get('authorization')).toBe('Bearer tenant');
	});

	test('without the proxy, sends no credentials', async () => {
		const fetch = upstream();
		await route({ fetch })(
			request('/api/inth/v1/consent/manifest', {
				headers: { cookie: 'inth=abc' },
			})
		);
		expect(callHeaders(fetch).get('cookie')).toBeNull();
	});

	test('answers a credentialed read private, without validators', async () => {
		const fetch = upstream(MANIFEST, {
			'cache-control': 'public, s-maxage=120',
			etag: '"rev"',
		});
		const handle = route({ fetch, proxy: { cookieNames: ['inth'] } });
		const credentialed = await handle(
			request('/api/inth/v1/consent/manifest', {
				headers: { cookie: 'inth=abc', 'if-none-match': '"rev"' },
			})
		);
		expect(credentialed.status).toBe(200);
		expect(credentialed.headers.get('cache-control')).toBe('private, no-store');
		expect(credentialed.headers.get('etag')).toBeNull();
		const anonymous = await handle(request('/api/inth/v1/consent/manifest'));
		expect(anonymous.headers.get('cache-control')).toBe('public, s-maxage=120');
	});

	test('never copies the client hop chain onto the manifest request', async () => {
		const fetch = upstream();
		await route({
			fetch,
			proxy: {
				forwardHeaders: [
					'x-forwarded-host',
					'x-forwarded-for',
					'x-forwarded-proto',
				],
			},
		})(
			request('/api/inth/v1/consent/manifest', {
				headers: {
					'x-forwarded-for': '203.0.113.7',
					'x-forwarded-host': 'evil.example',
					'x-forwarded-proto': 'http',
				},
			})
		);
		const headers = callHeaders(fetch);
		expect(headers.get('x-forwarded-host')).toBeNull();
		expect(headers.get('x-forwarded-for')).toBeNull();
		expect(headers.get('x-forwarded-proto')).toBeNull();
	});

	test('drops identity headers before a cleartext manifest request', async () => {
		const fetch = upstream();
		const response = await route({
			fetch,
			projectUrl: 'http://backend.example',
			proxy: { forwardHeaders: ['x-api-key', 'accept-language'] },
		})(
			request('/api/inth/v1/consent/manifest', {
				headers: { 'accept-language': 'de', 'x-api-key': 'tenant-a' },
			})
		);
		expect(response.status).toBe(200);
		const headers = callHeaders(fetch);
		expect(headers.get('x-api-key')).toBeNull();
		expect(headers.get('accept-language')).toBe('de');
	});
});

describe('init route', () => {
	test('resolves geo, language and GPC locally and is never shared-cached', async () => {
		const fetch = upstream();
		const response = await route({ fetch })(
			request('/api/inth/v1/consent/init', {
				headers: {
					'accept-language': 'de-DE,de;q=0.9',
					'x-inth-gpc': '1',
					'x-vercel-ip-country': 'DE',
					'x-vercel-ip-country-region': 'BE',
				},
			})
		);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(response.headers.has('x-inth-policy-contract')).toBe(false);
		const body = (await response.json()) as InitOutput;
		expect(body.location).toEqual({ countryCode: 'DE', regionCode: 'BE' });
		expect(body.translations.language).toBe('de');
		expect(body.policyResolution).toMatchObject({
			policyId: 'eu-opt-in',
			status: 'matched',
		});
		// Init resolves in-process: the backend sees the manifest request and
		// the session report, never `/v1/consent/init`.
		expect(calledURLs(fetch).sort()).toEqual([
			`${BACKEND}/v1/consent/manifest`,
			`${BACKEND}/v1/consent/sessions`,
		]);
	});

	test('echoes the resolved inputs so a server-rendered page keeps GPC', async () => {
		const response = await route({ fetch: upstream() })(
			request('/api/inth/v1/consent/init', {
				headers: { 'x-inth-country': 'DE', 'x-inth-gpc': '1' },
			})
		);
		expect(await response.json()).toMatchObject({
			resolvedOverrides: { country: 'DE', language: 'en' },
			resolvedPrivacySignals: { gpc: true },
		});
	});

	test('adapter-supplied inputs win over the request headers', async () => {
		const response = await route({ fetch: upstream() })(
			request('/api/inth/v1/consent/init', {
				headers: { 'accept-language': 'en', 'x-inth-country': 'US' },
			}),
			{ inputs: { country: 'DE', language: 'de' } }
		);
		expect(await response.json()).toMatchObject({
			location: { countryCode: 'DE' },
			policyResolution: { policyId: 'eu-opt-in' },
			translations: { language: 'de' },
		});
	});

	test('reads the inputs a browser sends as query parameters', async () => {
		const response = await route({ fetch: upstream() })(
			request('/api/inth/v1/consent/init?country=DE&gpc=1', {
				headers: { 'x-inth-country': 'US' },
			})
		);
		expect(await response.json()).toMatchObject({
			location: { countryCode: 'DE' },
			policyResolution: { policyId: 'eu-opt-in', status: 'matched' },
			resolvedPrivacySignals: { gpc: true },
		});
	});

	test('reads query inputs from a proxied request, as the App Router passes it', async () => {
		// Next.js wraps the request in a Proxy that reads every property from
		// the real request. Node 24's Request constructor rejects the Proxy
		// itself as an input.
		const real = request('/api/inth/v1/consent/init?country=DE&gpc=1', {
			headers: { 'x-inth-country': 'US' },
		});
		const proxied = new Proxy(real, {
			get: (target, property) => target[property as keyof Request],
		});
		const response = await route({ fetch: upstream() })(proxied);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			location: { countryCode: 'DE' },
			resolvedPrivacySignals: { gpc: true },
		});
	});

	test('query overrides win over adapter-supplied inputs, as override headers did', async () => {
		const response = await route({ fetch: upstream() })(
			request('/api/inth/v1/consent/init?country=DE'),
			{ inputs: { country: 'US', language: 'de' } }
		);
		expect(await response.json()).toMatchObject({
			location: { countryCode: 'DE' },
			translations: { language: 'de' },
		});
	});
});

describe('Google Additional Consent providers', () => {
	const AC_URL = 'https://lists.example/ac-route';
	const providerManifest = {
		...IAB_MANIFEST,
		iab: {
			...IAB_MANIFEST.iab,
			additionalConsent: { providers: [89], url: AC_URL },
		},
	} as unknown as ConsentManifest;
	const withProviders = (manifest: ConsentManifest): FetchMock => {
		const base = upstream(manifest);
		return vi.fn<ManifestFetch>((input, init) => {
			const url = String(input instanceof Request ? input.url : input);
			return url.startsWith(AC_URL)
				? Promise.resolve(
						json({
							providers: {
								'89': {
									id: 89,
									name: 'Meta',
									policyUrl: 'https://meta.example/privacy',
								},
							},
						})
					)
				: base(input, init);
		});
	};

	test('are served with the IAB init the manifest resolves', async () => {
		const response = await route({
			fetch: withProviders(providerManifest),
		})(request('/api/inth/v1/consent/init'));
		const body = (await response.json()) as InitOutput;
		expect(body.adTechProviders).toEqual([
			{ id: 89, name: 'Meta', policyUrl: 'https://meta.example/privacy' },
		]);
	});

	test('are not loaded for a policy that is not IAB, or a failed contract', async () => {
		const optIn = withProviders({
			...MANIFEST,
			iab: providerManifest.iab,
		} as ConsentManifest);
		const notIab = await route({ fetch: optIn })(
			request('/api/inth/v1/consent/init', {
				headers: { 'x-inth-country': 'DE' },
			})
		);
		expect(await notIab.json()).not.toHaveProperty('adTechProviders');
		expect(calledURLs(optIn).some((url) => url.startsWith(AC_URL))).toBe(false);
	});

	/** The provider manifest with a relative endpoint, and its answer. */
	const relativeEndpoint = (path: string) => {
		const manifest = {
			...IAB_MANIFEST,
			iab: {
				...IAB_MANIFEST.iab,
				additionalConsent: { providers: [89], url: path },
			},
		} as unknown as ConsentManifest;
		const answer = () =>
			Promise.resolve(
				json({
					providers: {
						'89': {
							id: 89,
							name: 'Meta',
							policyUrl: 'https://meta.example/privacy',
						},
					},
				})
			);
		return { answer, manifest };
	};

	test('load from a relative endpoint on the request origin', async () => {
		const { answer, manifest } = relativeEndpoint('/api/ac-relative');
		const base = upstream(manifest);
		const fetch = vi.fn<ManifestFetch>((input, init) =>
			String(input).includes('/api/ac-relative') ? answer() : base(input, init)
		);
		const response = await route({ fetch })(
			request('/api/inth/v1/consent/init')
		);
		const body = (await response.json()) as InitOutput;
		expect(body.adTechProviders?.map(({ id }) => id)).toEqual([89]);
		expect(calledURLs(fetch)).toContain(
			`${APP}/api/ac-relative?providerIds=89`
		);
	});

	test('load from a relative endpoint in-process with localFetch', async () => {
		const { answer, manifest } = relativeEndpoint('/api/ac-local');
		const fetch = upstream(manifest);
		const localFetch = vi.fn<ManifestFetch>(() => answer());
		const response = await route({ fetch })(
			request('/api/inth/v1/consent/init'),
			{
				localFetch,
			}
		);
		const body = (await response.json()) as InitOutput;
		expect(body.adTechProviders?.map(({ id }) => id)).toEqual([89]);
		expect(calledURLs(localFetch)).toEqual(['/api/ac-local?providerIds=89']);
	});

	test('from localFetch are cached per handler, not across apps', async () => {
		const { answer, manifest } = relativeEndpoint('/api/ac-tenant');
		const fetch = upstream(manifest);
		const first = route({ fetch });
		const second = route({ fetch });
		const firstLocal = vi.fn<ManifestFetch>(() => answer());
		const secondLocal = vi.fn<ManifestFetch>(() => answer());
		const nextRequest = vi.fn<ManifestFetch>(() => answer());
		await first(request('/api/inth/v1/consent/init'), {
			localFetch: firstLocal,
		});
		await second(request('/api/inth/v1/consent/init'), {
			localFetch: secondLocal,
		});
		await first(request('/api/inth/v1/consent/init'), {
			localFetch: nextRequest,
		});
		expect(firstLocal).toHaveBeenCalledOnce();
		expect(secondLocal).toHaveBeenCalledOnce();
		// Adapters pass a new localFetch per request; the handler's cache
		// still serves the list it loaded.
		expect(nextRequest).not.toHaveBeenCalled();
	});

	test('are withdrawn with an empty list once the manifest stops listing them', async () => {
		const response = await route({
			fetch: withProviders(IAB_MANIFEST as unknown as ConsentManifest),
		})(request('/api/inth/v1/consent/init'));
		const body = (await response.json()) as InitOutput;
		expect(body.adTechProviders).toEqual([]);
	});
});

describe('vendor list', () => {
	test('is not loaded for a policy that is not IAB', async () => {
		const fetchGvl = vi.fn(() => Promise.resolve(GVL));
		await route({ fetch: upstream(), fetchGvl })(
			request('/api/inth/v1/consent/init', {
				headers: { 'x-inth-country': 'DE' },
			})
		);
		expect(fetchGvl).not.toHaveBeenCalled();
	});

	test('is loaded in the resolved language, deferred to this route and served by version', async () => {
		const fetchGvl = vi.fn(() => Promise.resolve(GVL));
		const handle = route({ fetch: upstream(IAB_MANIFEST), fetchGvl });
		const response = await handle(
			request('/privacy/v1/consent/init', {
				headers: { 'accept-language': 'de-DE,de;q=0.9' },
			})
		);
		const body = (await response.json()) as InitOutput;
		expect(fetchGvl).toHaveBeenCalledWith(
			expect.objectContaining({ language: 'de', reference: { url: GVL_URL } })
		);
		expect(body.gvl).toBeNull();
		expect(body.cmpId).toBe(28);
		expect(body.gvlReference).toMatchObject({
			language: 'de',
			summary: { vendorCount: 1 },
			url: '/privacy/v1/consent/init?inth-gvl=42&language=de',
			vendorListVersion: 42,
		});

		const list = await handle(request(body.gvlReference?.url ?? ''));
		expect(list.headers.get('cache-control')).toBe('public, max-age=86400');
		expect(await list.json()).toEqual(GVL);
		const mismatch = await handle(
			request('/privacy/v1/consent/init?inth-gvl=43&language=de')
		);
		expect(mismatch.status).toBe(409);
		const invalid = await handle(
			request('/privacy/v1/consent/init?inth-gvl=42&language=../en')
		);
		expect(invalid.status).toBe(400);
	});

	test('the default loader reads through the process cache with the protocol headers', async () => {
		const fetch = upstream(IAB_MANIFEST);
		const handle = route({ fetch });
		await handle(request('/api/inth/v1/consent/init'));
		await handle(request('/api/inth/v1/consent/init'));
		await handle(request('/api/inth/v1/consent/init?inth-gvl=42&language=en'));
		const gvlCalls = fetch.mock.calls.filter(([url]) =>
			String(url).startsWith(GVL_URL)
		);
		expect(gvlCalls).toHaveLength(1);
		const headers = new Headers(gvlCalls[0]?.[1]?.headers);
		expect(headers.get('accept-language')).toBe('en');
		expect(headers.get('x-inth-policy-contract')).toBe('1');
	});

	test('a list that cannot be loaded fails the request instead of turning IAB off', async () => {
		const fetch = upstream(IAB_MANIFEST);
		const handle = route({
			fetch,
			fetchGvl: () => Promise.reject(new Error('gvl is down')),
		});
		await expect(handle(request('/api/inth/v1/consent/init'))).rejects.toThrow(
			'gvl is down'
		);
		await flush();
		// No resolution was served, so none is reported.
		expect(calledURLs(fetch).some((url) => url.endsWith('/sessions'))).toBe(
			false
		);
	});

	test('the default loader gives up on a hung list after its deadline', async () => {
		const deadlines: AbortController[] = [];
		const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => {
			const controller = new AbortController();
			deadlines.push(controller);
			return controller.signal;
		});
		const fetch = vi.fn<ManifestFetch>((input, init) => {
			if (String(input).startsWith(GVL_URL)) {
				return new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener('abort', () =>
						reject(new Error('deadline'))
					);
				});
			}
			return Promise.resolve(json(IAB_MANIFEST));
		});
		const pending = route({ fetch })(request('/api/inth/v1/consent/init'));
		await flush();
		expect(timeout).toHaveBeenCalledWith(GVL_FETCH_TIMEOUT_MS);
		deadlines.at(-1)?.abort();
		await expect(pending).rejects.toThrow('deadline');
	});
});

describe('session reports', () => {
	const reportCall = (fetch: FetchMock) =>
		fetch.mock.calls.find(
			([url]) => String(url) === `${BACKEND}/v1/consent/sessions`
		);

	test('reports the resolution to the backend, detached and without cookies', async () => {
		const fetch = upstream();
		const registered: Promise<void>[] = [];
		const response = await route({ fetch })(
			request('/api/inth/v1/consent/init', {
				headers: {
					cookie: 'inth=secret',
					'user-agent': 'Mozilla/5.0',
					'x-forwarded-for': '203.0.113.42',
					'x-inth-gpc': '1',
					'x-vercel-ip-country': 'DE',
				},
			}),
			{ waitUntil: (task) => registered.push(task) }
		);
		expect(response.status).toBe(200);
		expect(registered).toHaveLength(1);
		await registered[0];
		const init = reportCall(fetch)?.[1];
		expect(init?.method).toBe('POST');
		const headers = init?.headers as Record<string, string>;
		expect(headers['x-inth-client-ip']).toBe('203.0.113.42');
		expect(headers['user-agent']).toBe('Mozilla/5.0');
		expect(headers).not.toHaveProperty('cookie');
		expect(JSON.parse(init?.body as string)).toMatchObject({
			adapter: '@c15t/test',
			country: 'DE',
			gpc: true,
			policy: { id: 'eu-opt-in' },
			revision: 'manifest-revision',
			source: 'route',
		});
	});

	test('puts the journey from the browser request on the report', async () => {
		const fetch = upstream();
		const registered: Promise<void>[] = [];
		const id = '3b241101-e2bb-4255-8caf-4136c566a962';
		await route({ fetch })(
			request(
				`/api/inth/v1/consent/init?journey=${id}&journeyScope=page&stored=0`,
				{
					headers: { 'x-vercel-ip-country': 'DE' },
				}
			),
			{ waitUntil: (task) => registered.push(task) }
		);
		await registered[0];
		expect(JSON.parse(reportCall(fetch)?.[1]?.body as string).journey).toEqual({
			id,
			prompt: 'due',
			property: 'app.example.com',
			scope: 'page',
			storedChoice: false,
		});
	});

	test('reports no journey for malformed parameters', async () => {
		const fetch = upstream();
		const registered: Promise<void>[] = [];
		await route({ fetch })(
			request(
				'/api/inth/v1/consent/init?journey=visitor-42&journeyScope=page&stored=0'
			),
			{ waitUntil: (task) => registered.push(task) }
		);
		await registered[0];
		expect(
			JSON.parse(reportCall(fetch)?.[1]?.body as string)
		).not.toHaveProperty('journey');
	});

	test.each([
		['a HEAD probe', {}, { method: 'HEAD' }],
		['a relative projectUrl', { projectUrl: '/api/self-host' }, {}],
		[
			'a manifestUrl alone',
			{ manifestUrl: `${BACKEND}/v1/consent/manifest`, projectUrl: undefined },
			{},
		],
	] as const)('sends none for %s', async (_, options, init) => {
		const fetch = upstream();
		const response = await route({ fetch, ...options })(
			request('/api/inth/v1/consent/init', init)
		);
		expect(response.status).toBe(200);
		await flush();
		expect(calledURLs(fetch).some((url) => url.endsWith('/sessions'))).toBe(
			false
		);
	});

	test('sends none for a request whose client went away', async () => {
		const fetch = upstream();
		const controller = new AbortController();
		controller.abort();
		await route({ fetch })(
			request('/api/inth/v1/consent/init', { signal: controller.signal })
		);
		await flush();
		expect(reportCall(fetch)).toBeUndefined();
	});
});

describe('client abort', () => {
	test('hands the rest of an abandoned request to waitUntil', async () => {
		let finish: (response: Response) => void = () => undefined;
		const fetch = vi.fn<ManifestFetch>(
			() =>
				new Promise<Response>((resolve) => {
					finish = resolve;
				})
		);
		const controller = new AbortController();
		const registered: Promise<void>[] = [];
		const pending = route({ fetch })(
			request('/api/inth/v1/consent/init', { signal: controller.signal }),
			{ waitUntil: (task) => registered.push(task) }
		);
		await flush();
		controller.abort();
		expect(registered).toHaveLength(1);
		finish(json(MANIFEST));
		await pending;
		await expect(registered[0]).resolves.toBeUndefined();
	});
});

describe('request budget', () => {
	const hanging: ManifestFetch = (_url, init) =>
		new Promise((_resolve, reject) => {
			init?.signal?.addEventListener('abort', () =>
				reject(init.signal?.reason)
			);
		});

	test('fails within the budget header without falling back to /v1/consent/init', async () => {
		const fetch = vi.fn<ManifestFetch>(hanging);
		const startedAt = Date.now();
		// The cache gets what is left of the header's 20 ms, which is less
		// once a millisecond ticks before the read starts.
		await expect(
			route({ fetch })(
				request('/api/inth/v1/consent/init', {
					headers: { [CONSENT_ROUTE_TIMEOUT_HEADER]: '20' },
				})
			)
		).rejects.toThrow(/no manifest within (?:1?\d|20) ms/u);
		expect(Date.now() - startedAt).toBeLessThan(2000);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	test('bounds the vendor list and leaves it filling for the next request', async () => {
		let finishList: (response: Response) => void = () => undefined;
		const fetch = vi.fn<ManifestFetch>((url) =>
			String(url) === GVL_URL
				? new Promise<Response>((resolve) => {
						finishList = resolve;
					})
				: Promise.resolve(json(IAB_MANIFEST))
		);
		const registered: Promise<void>[] = [];
		await expect(
			route({ fetch })(
				request('/api/inth/v1/consent/init', {
					headers: { [CONSENT_ROUTE_TIMEOUT_HEADER]: '50' },
				}),
				{ waitUntil: (task) => registered.push(task) }
			)
		).rejects.toThrow(/did not finish/u);
		expect(
			calledURLs(fetch).some((url) => url.endsWith('/v1/consent/init'))
		).toBe(false);
		expect(registered).toHaveLength(1);
		finishList(json(GVL));
		await expect(registered[0]).resolves.toBeUndefined();
	});

	test('bounds the /init fallback, even through a fetch that drops the signal', async () => {
		const localFetch = vi.fn<ManifestFetch>((url) =>
			String(url).endsWith('/v1/consent/manifest')
				? Promise.resolve(new Response('missing', { status: 404 }))
				: new Promise(() => {
						// Never answers.
					})
		);
		const startedAt = Date.now();
		await expect(
			route({ projectUrl: '/api/self-host' })(
				request('/api/inth/v1/consent/init', {
					headers: { [CONSENT_ROUTE_TIMEOUT_HEADER]: '50' },
				}),
				{ localFetch }
			)
		).rejects.toThrow();
		expect(Date.now() - startedAt).toBeLessThan(2000);
		expect(localFetch).toHaveBeenLastCalledWith(
			'/api/self-host/v1/consent/init',
			expect.objectContaining({ signal: expect.any(AbortSignal) })
		);
	});

	test.each(['soon', '-1', '1.5'])(
		'ignores a budget header of %j',
		async (value) => {
			const response = await route({ fetch: upstream() })(
				request('/api/inth/v1/consent/init', {
					headers: { [CONSENT_ROUTE_TIMEOUT_HEADER]: value },
				})
			);
			expect(response.status).toBe(200);
		}
	);
});

describe('init fallback for a backend without /v1/consent/manifest', () => {
	const backendInit = (
		body: Record<string, unknown>,
		headers: Record<string, string> = {}
	) =>
		vi.fn<ManifestFetch>((url) =>
			Promise.resolve(
				String(url).endsWith('/v1/consent/manifest')
					? new Response('missing', { status: 404 })
					: json(body, headers)
			)
		);

	const matchedIab = () =>
		writePolicyResolutionWire(
			resolvePolicyRules({
				countryCode: 'DE',
				regionCode: null,
				rules: [
					{
						id: 'iab',
						match: { isDefault: true },
						model: 'iab',
						prompt: 'choice',
					},
				],
			})
		);

	test('asks backend /init in-process, forwarding only the consent request headers', async () => {
		const localFetch = backendInit({
			location: { countryCode: null, regionCode: null },
			translations: { language: 'en', translations: {} },
		});
		const response = await route({ projectUrl: '/api/self-host' })(
			request('/api/inth/v1/consent/init', {
				headers: {
					cookie: 'inth=secret',
					'user-agent': 'Mozilla/5.0',
					'x-forwarded-for': '203.0.113.42',
					'x-inth-country': 'DE',
				},
			}),
			{ localFetch }
		);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(response.headers.has('x-inth-policy-contract')).toBe(false);
		expect(await response.json()).toMatchObject({
			location: { countryCode: null, regionCode: null },
		});
		expect(localFetch).toHaveBeenLastCalledWith(
			'/api/self-host/v1/consent/init',
			expect.anything()
		);
		const headers = callHeaders(localFetch, 1);
		expect(headers.get('x-inth-country')).toBe('DE');
		expect(headers.has('x-inth-policy-contract')).toBe(false);
		expect(headers.get('cookie')).toBeNull();
		expect(headers.get('user-agent')).toBeNull();
		expect(headers.get('x-forwarded-for')).toBeNull();
	});

	test('forwards the browser journey to backend /init and nothing else from the query', async () => {
		const localFetch = backendInit({
			location: { countryCode: null, regionCode: null },
			translations: { language: 'en', translations: {} },
		});
		const id = '3b241101-e2bb-4255-8caf-4136c566a962';
		await route({ projectUrl: '/api/self-host' })(
			request(
				`/api/inth/v1/consent/init?utm_source=mail&journey=${id}&journeyScope=tab&stored=1`
			),
			{ localFetch }
		);
		expect(localFetch).toHaveBeenLastCalledWith(
			`/api/self-host/v1/consent/init?journey=${id}&journeyScope=tab&stored=1`,
			expect.anything()
		);
	});

	test('forwards the browser query overrides to backend /init as headers', async () => {
		// Server to server there is no CORS, and every backend version reads
		// the headers.
		const localFetch = backendInit({
			location: { countryCode: null, regionCode: null },
			translations: { language: 'en', translations: {} },
		});
		await route({ projectUrl: '/api/self-host' })(
			request('/api/inth/v1/consent/init?country=DE&gpc=0&contract=1'),
			{ localFetch }
		);
		expect(localFetch).toHaveBeenLastCalledWith(
			'/api/self-host/v1/consent/init',
			expect.anything()
		);
		const headers = callHeaders(localFetch, 1);
		expect(headers.get('x-inth-country')).toBe('DE');
		expect(headers.get('x-inth-gpc')).toBe('0');
	});

	test('names the page origin on the backend /init it forwards a journey to', async () => {
		const fetch = backendInit({
			location: { countryCode: null, regionCode: null },
			translations: { language: 'en', translations: {} },
		});
		const id = '3b241101-e2bb-4255-8caf-4136c566a962';
		const handle = route({ fetch, projectUrl: BACKEND });
		const query = `?journey=${id}&journeyScope=page&stored=0`;
		const lastInitOrigin = () =>
			new Headers(
				fetch.mock.calls.findLast(([url]) =>
					String(url).includes('/v1/consent/init')
				)?.[1]?.headers
			).get('origin');
		// A same-origin GET carries no Origin: the request URL is the page's.
		await handle(request(`/api/inth/init${query}`));
		expect(lastInitOrigin()).toBe(APP);
		// One the browser sent wins.
		await handle(
			request(`/api/inth/init${query}`, {
				headers: { origin: 'https://www.example.org' },
			})
		);
		expect(lastInitOrigin()).toBe('https://www.example.org');
		// Without a journey nothing is added.
		await handle(request('/api/inth/v1/consent/init'));
		expect(lastInitOrigin()).toBeNull();
	});

	test('forwards vendors and privacy signals from backend /v1/consent/init', async () => {
		const acmeVendor = {
			category: 'marketing',
			id: 'acme',
			name: 'Acme',
			privacyPolicyUrl: 'https://acme.example/privacy',
		};
		const fetch = backendInit({
			// A v2 backend still sends the jurisdiction label; v3 drops it.
			jurisdiction: 'GDPR',
			location: { countryCode: 'DE', regionCode: null },
			resolvedPrivacySignals: { gpc: true },
			translations: { language: 'en', translations: {} },
			vendorListVersion: '2026-09',
			vendors: [acmeVendor],
		});
		const response = await route({ fetch })(
			request('/api/inth/v1/consent/init', {
				headers: { 'x-inth-country': 'DE' },
			})
		);
		const body = await response.json();
		expect(body).toMatchObject({
			resolvedPrivacySignals: { gpc: true },
			vendorListVersion: '2026-09',
			vendors: [acmeVendor],
		});
		expect(body).not.toHaveProperty('jurisdiction');
	});

	test('keeps the script registry list from backend /v1/consent/init', async () => {
		const scriptSources = {
			posthog: {
				integrity: 'sha384-posthog',
				src: 'https://acme.inth.app/scripts/posthog@0123456789abcdef.js',
			},
		};
		const fetch = backendInit({
			location: { countryCode: 'DE', regionCode: null },
			scriptRegistry: { sources: scriptSources },
			translations: { language: 'en', translations: {} },
		});
		const response = await route({ fetch })(
			request('/api/inth/v1/consent/init', {
				headers: { 'x-inth-country': 'DE' },
			})
		);
		expect((await response.json()).scriptRegistry?.sources).toEqual(
			scriptSources
		);
	});

	test('keeps a deferred vendor list from the backend', async () => {
		const gvlReference = {
			language: 'en',
			summary: { items: ['Storage'], vendorCount: 2 },
			url: '/vendor-list',
			vendorListVersion: 42,
		};
		const fetch = backendInit({
			cmpId: 28,
			gvlReference,
			location: { countryCode: 'DE', regionCode: null },
			policyResolution: matchedIab(),
			translations: { language: 'en', translations: {} },
		});
		const response = await route({ fetch })(
			request('/api/inth/v1/consent/init')
		);
		expect(await response.json()).toMatchObject({ cmpId: 28, gvlReference });
	});

	test.each([
		{ reason: 'transport', status: 'failed' },
		{ status: 'no-match' },
		{ status: 'unconfigured' },
	])(
		'drops stale policy evidence after a $status answer',
		async (resolution) => {
			const fetch = backendInit({
				branding: 'inth',
				cmpId: 7,
				customVendors: [{ id: 'stale' }],
				gvl: { vendorListVersion: 1 },
				location: { countryCode: 'DE', regionCode: null },
				policy: { id: 'stale', model: 'iab' },
				policyDecision: { policyId: 'stale' },
				policyResolution: { policy: null, version: 1, ...resolution },
				policySnapshotToken: 'stale-token',
				subjectId: 'backend+literal',
				translations: { language: 'en', translations: {} },
			});
			const response = await route({ fetch })(
				request('/api/inth/v1/consent/init')
			);
			const body = await response.json();
			expect(body.policyResolution.status).toBe(resolution.status);
			for (const key of [
				'policy',
				'policyDecision',
				'policySnapshotToken',
				'gvl',
				'cmpId',
				'customVendors',
			]) {
				expect(body).not.toHaveProperty(key);
			}
			expect(body.branding).toBe('inth');
			expect(body.subjectId).toBe('backend+literal');
		}
	);

	test('a backend answer without a policy resolution is a failed payload', async () => {
		const fetch = backendInit({
			location: { countryCode: 'DE', regionCode: null },
			policy: { id: 'legacy', model: 'opt-in' },
			translations: { language: 'en', translations: {} },
		});
		const response = await route({ fetch })(
			request('/api/inth/v1/consent/init')
		);
		expect(await response.json()).toMatchObject({
			policyResolution: { reason: 'invalid-payload', status: 'failed' },
		});
	});

	test('falls back to /init while the manifest backs off, without asking the manifest again', async () => {
		const fetch = vi.fn<ManifestFetch>(() =>
			Promise.resolve(new Response('unavailable', { status: 503 }))
		);
		const handle = route({ fetch });
		await expect(handle(request('/api/inth/v1/consent/init'))).rejects.toThrow(
			/503/u
		);
		await expect(
			handle(request('/api/inth/v1/consent/init'))
		).rejects.toThrow();
		expect(calledURLs(fetch)).toEqual([
			`${BACKEND}/v1/consent/manifest`,
			`${BACKEND}/v1/consent/init`,
			`${BACKEND}/v1/consent/init`,
		]);
	});

	test('answers from /init with a warning when the manifest fails', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const answer = backendInit({
			location: { countryCode: 'DE', regionCode: null },
			policyResolution: matchedIab(),
			translations: { language: 'en', translations: {} },
		});
		const fetch = vi.fn<ManifestFetch>((url, init) =>
			String(url).endsWith('/v1/consent/manifest')
				? Promise.resolve(new Response('unavailable', { status: 500 }))
				: answer(url, init)
		);
		const handle = route({ fetch, projectUrl: `${BACKEND}/warn` });
		expect((await handle(request('/api/inth/v1/consent/init'))).ok).toBe(true);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining(
				`could not read the consent manifest from ${BACKEND}/warn/v1/consent/manifest`
			)
		);
		warn.mockRestore();
	});

	test('keeps falling back for a backend that has no /v1/consent/manifest', async () => {
		const fetch = backendInit({
			location: { countryCode: 'DE', regionCode: null },
			policyResolution: matchedIab(),
			translations: { language: 'en', translations: {} },
		});
		const handle = route({ fetch });
		expect((await handle(request('/api/inth/v1/consent/init'))).ok).toBe(true);
		expect((await handle(request('/api/inth/v1/consent/init'))).ok).toBe(true);
		expect(
			calledURLs(fetch).filter((url) => url.endsWith('/v1/consent/init'))
		).toEqual([`${BACKEND}/v1/consent/init`, `${BACKEND}/v1/consent/init`]);
	});

	test('surfaces the failure when only a manifestUrl is configured', async () => {
		const fetch = vi.fn<ManifestFetch>(() =>
			Promise.resolve(new Response('nope', { status: 503 }))
		);
		await expect(
			route({
				fetch,
				manifestUrl: `${BACKEND}/v1/consent/manifest`,
				projectUrl: undefined,
			})(request('/api/inth/v1/consent/manifest'))
		).rejects.toThrow(/503/u);
		expect(fetch).toHaveBeenCalledTimes(1);
	});
});

describe('proxy', () => {
	test('keeps manifest and init in-process and forwards other paths and writes', async () => {
		const fetch = upstream();
		const handle = route({ fetch, proxy: true });
		await handle(request('/api/inth/v1/consent/manifest'), {
			path: 'v1/consent/manifest',
		});
		await handle(request('/api/inth/v1/consent/init'), {
			path: 'v1/consent/init',
		});
		// Init resolves in-process: the backend sees the manifest request and
		// the session report, never `/v1/consent/init`.
		expect(calledURLs(fetch).sort()).toEqual([
			`${BACKEND}/v1/consent/manifest`,
			`${BACKEND}/v1/consent/sessions`,
		]);

		fetch.mockImplementation(() =>
			Promise.resolve(json({ ok: true }, {}, 201))
		);
		const saved = await handle(
			request('/api/inth/v1/consent/records?x=1', {
				body: '{"answer":{"categories":{}}}',
				headers: { 'content-type': 'application/json' },
				method: 'POST',
			}),
			{ path: 'v1/consent/records' }
		);
		expect(saved.status).toBe(201);
		const [url, init] = fetch.mock.calls.at(-1) ?? [];
		expect(url).toBe(`${BACKEND}/v1/consent/records?x=1`);
		expect(init?.method).toBe('POST');
		// A session report comes from a server only; a browser cannot send one.
		const report = await handle(
			request('/api/inth/v1/consent/sessions', { method: 'POST' }),
			{
				path: 'v1/consent/sessions',
			}
		);
		expect(report.status).toBe(404);
		const other = await handle(
			request('/api/inth/reports/v1/consent/manifest'),
			{
				path: 'reports/manifest',
			}
		);
		expect(other.status).toBe(404);
	});

	test('a dedicated proxy mount forwards its last segment', async () => {
		const fetch = vi.fn<ManifestFetch>(() => Promise.resolve(json({})));
		await route({ fetch, proxy: { paths: ['status'] } })(
			request('/api/inth/status'),
			{
				route: 'proxy',
			}
		);
		expect(calledURLs(fetch)).toEqual([`${BACKEND}/status`]);
	});

	test('without trusted forwarding, believes only the request URL', async () => {
		const fetch = vi.fn<ManifestFetch>(() => Promise.resolve(json({})));
		await route({ fetch, proxy: true })(
			request('/api/inth/v1/consent/records', {
				headers: {
					'x-forwarded-for': '198.51.100.1',
					'x-forwarded-host': 'evil.example',
				},
				method: 'POST',
			}),
			{ path: 'v1/consent/records' }
		);
		const headers = callHeaders(fetch);
		expect(headers.get('x-forwarded-host')).toBe('app.example.com');
		expect(headers.get('x-forwarded-proto')).toBe('https');
		expect(headers.get('x-forwarded-for')).toBeNull();
		expect(headers.get('x-inth-proxy')).toBe('@c15t/test');
	});

	test('with trusted forwarding, keeps the chain and appends the client address', async () => {
		const fetch = vi.fn<ManifestFetch>(() => Promise.resolve(json({})));
		await route({ fetch, proxy: true, trustForwardedHeaders: true })(
			request('/api/inth/v1/consent/records', {
				headers: {
					'cf-connecting-ip': '203.0.113.9',
					'x-forwarded-host': 'public.example',
					'x-forwarded-proto': 'https',
				},
				method: 'POST',
			}),
			{ path: 'v1/consent/records' }
		);
		const headers = callHeaders(fetch);
		expect(headers.get('x-forwarded-host')).toBe('public.example');
		expect(headers.get('x-forwarded-for')).toBe('203.0.113.9');
	});

	test('uses the hop chain the adapter vouches for', async () => {
		const fetch = vi.fn<ManifestFetch>(() => Promise.resolve(json({})));
		await route({ fetch, proxy: true })(
			request('/api/inth/v1/consent/records', { method: 'POST' }),
			{
				forwarding: () => ({
					for: '192.0.2.5',
					host: 'framework.example',
					proto: 'https',
				}),
				path: 'v1/consent/records',
			}
		);
		const headers = callHeaders(fetch);
		expect(headers.get('x-forwarded-for')).toBe('192.0.2.5');
		expect(headers.get('x-forwarded-host')).toBe('framework.example');
	});

	test('forwards to a relative backend through localFetch', async () => {
		const localFetch = vi.fn<ManifestFetch>(() => Promise.resolve(json({})));
		await route({ projectUrl: '/api/self-host', proxy: true })(
			new Request('http://evil.example/api/inth/v1/consent/records', {
				method: 'POST',
			}),
			{ localFetch, path: 'v1/consent/records' }
		);
		expect(calledURLs(localFetch)).toEqual([
			'/api/self-host/v1/consent/records',
		]);
	});

	test('needs a projectUrl', async () => {
		await expect(
			route({
				manifestUrl: `${BACKEND}/v1/consent/manifest`,
				projectUrl: undefined,
				proxy: true,
			})(request('/api/inth/v1/consent/records', { method: 'POST' }), {
				path: 'v1/consent/records',
			})
		).rejects.toThrow('@c15t/test: pass projectUrl to use proxy.');
	});
});

describe('readWaitUntil', () => {
	test('binds the platform method to its holder', () => {
		const holder = {
			tasks: [] as Promise<unknown>[],
			waitUntil(task: Promise<unknown>) {
				this.tasks.push(task);
			},
		};
		const task = Promise.resolve();
		readWaitUntil(holder)?.(task);
		expect(holder.tasks).toEqual([task]);
		expect(readWaitUntil({})).toBeUndefined();
		expect(readWaitUntil(undefined)).toBeUndefined();
	});
});

describe('readRequestForwarding', () => {
	const forwardingFor = (headers: Record<string, string>) =>
		readRequestForwarding(
			new Request('https://shop.example/api/inth/v1/consent/init', { headers }),
			true
		).for;

	test('takes the client from an RFC 7239 Forwarded header', () => {
		expect(
			forwardingFor({ forwarded: 'for=192.0.2.60;proto=https;by=203.0.113.43' })
		).toBe('192.0.2.60');
	});

	test('reads a quoted IPv6 client with its port', () => {
		expect(forwardingFor({ forwarded: 'for="[2001:db8:cafe::17]:4711"' })).toBe(
			'2001:db8:cafe::17'
		);
	});

	test('forwards no client for an unknown or obfuscated one', () => {
		expect(
			forwardingFor({ forwarded: 'for=unknown;proto=https' })
		).toBeUndefined();
		expect(forwardingFor({ forwarded: 'for=_gazonk' })).toBeUndefined();
	});
});
