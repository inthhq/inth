import { createConsentManifestPolicyPack } from '@inth/sdk/schema/types';
/**
 * Wiring tests for `resolveConsent` on top of `resolveRequestConsent` from
 * `@inth/sdk/server`. The resolution rules (forwarding, budget, self-route
 * guard, deferral, shared renders) are pinned once in the core suite; these
 * check what the TanStack Start adapter supplies: the request, the
 * middleware's remembered inputs, the route prefix and the prerender flag.
 */
import { createManifestCache } from '@inth/sdk/server';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { rememberConsentInputs } from '../libs/request-inputs';
import { createConsentStateHandler, resolveConsent } from '../server';
import { loadStaticManifest } from '../static';
import { MANIFEST_FIXTURE } from './manifest-fixture';

const manifestFetch = () =>
	vi.fn<typeof globalThis.fetch>(() =>
		Promise.resolve(
			new Response(JSON.stringify(MANIFEST_FIXTURE), {
				headers: {
					'cache-control': 'public, s-maxage=60',
					'content-type': 'application/json',
				},
			})
		)
	);

const requestOf = (headers: Record<string, string> = {}) =>
	new Request('https://app.example.com/', { headers });

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('resolveConsent wiring', () => {
	test('the server function resolves a build-time snapshot without runtime policy requests', async () => {
		const manifest = await loadStaticManifest({
			fetch: manifestFetch(),
			manifestUrl: 'https://consent.example.com/v1/consent/manifest',
		});
		const fetch = vi.fn<typeof globalThis.fetch>();
		const handler = createConsentStateHandler({
			fetch,
			mode: { type: 'manifest' },
			projectUrl: 'https://consent.example.com',
			request: requestOf({
				'accept-language': 'de-DE',
				'sec-gpc': '1',
				'x-vercel-ip-country': 'DE',
			}),
			snapshot: manifest,
		});
		const state = await handler();
		expect(state.initialPolicyResolution).toMatchObject({
			policyId: 'eu-opt-in',
			status: 'matched',
		});
		expect(state.initialTranslations?.language).toBe('de');
		expect(state.initialPrivacySignals?.gpc).toBe(true);
		expect(state).not.toHaveProperty('transport');
		// No policy request; only the session report.
		expect(
			fetch.mock.calls.filter(([url]) => !String(url).endsWith('/sessions'))
		).toEqual([]);
	});

	test('resolves the backend manifest for the request', async () => {
		const fetch = manifestFetch();
		const state = await resolveConsent({
			cache: createManifestCache(),
			fetch,
			mode: { type: 'manifest' },
			projectUrl: 'https://consent.example.com',
			request: requestOf({ 'x-vercel-ip-country': 'DE' }),
		});
		expect(String(fetch.mock.calls[0]?.[0])).toBe(
			'https://consent.example.com/v1/consent/manifest'
		);
		expect(state.initialPolicyResolution).toMatchObject({
			policyId: 'eu-opt-in',
			status: 'matched',
		});
		expect(state).not.toHaveProperty('transport');
	});

	test('reports a page journey, and false or no reports turn it off', async () => {
		const sessions = vi.fn<typeof globalThis.fetch>(() =>
			Promise.resolve(new Response(null, { status: 204 }))
		);
		const tab = await resolveConsent({
			fetch: sessions,
			journey: 'tab',
			projectUrl: 'https://consent.example.com',
			request: requestOf({ 'x-vercel-ip-country': 'DE' }),
			snapshot: MANIFEST_FIXTURE,
		});
		await vi.waitFor(() => expect(sessions).toHaveBeenCalled());
		const report = JSON.parse(String(sessions.mock.calls[0]?.[1]?.body));
		// A server-rendered page is a page journey, even under 'tab'.
		expect(report.journey).toMatchObject({
			id: tab.journey?.id,
			scope: 'page',
		});

		for (const off of [{ journey: false as const }]) {
			// oxlint-disable-next-line no-await-in-loop -- One render at a time.
			const state = await resolveConsent({
				projectUrl: 'https://consent.example.com',
				request: requestOf({ 'x-vercel-ip-country': 'DE' }),
				snapshot: MANIFEST_FIXTURE,
				...off,
			});
			// The state tells InthProvider this page has no journey.
			expect(state.journey).toBeNull();
		}
	});

	test('uses what consentRequestMiddleware remembered for the request', async () => {
		const request = requestOf({ 'x-vercel-ip-country': 'US' });
		rememberConsentInputs(request, { country: 'DE' });
		const state = await resolveConsent({
			projectUrl: 'https://consent.example.com',
			request,
			snapshot: MANIFEST_FIXTURE,
		});
		expect(state.initialOverrides?.country).toBe('DE');
		expect(state.initialPolicyResolution).toMatchObject({
			policyId: 'eu-opt-in',
		});
	});

	test('never fetches its own route prefix and stays silent', async () => {
		const fetch = manifestFetch();
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const handler = createConsentStateHandler({
			cache: createManifestCache(),
			fetch,
			projectUrl: '/consent',
			request: requestOf({ cookie: 'inth=c.necessary:1,c.marketing:1,i.t:1' }),
			routePrefix: '/consent',
		});
		const state = await handler();
		expect(fetch).not.toHaveBeenCalled();
		expect(state.initialRecords?.choice).toBeTruthy();
		expect(state.initialPolicyResolution).toBeUndefined();
		expect(warn).not.toHaveBeenCalled();
		warn.mockRestore();
	});

	test('fetches a relative projectUrl that is not the route prefix', async () => {
		// A backend mounted elsewhere on the app's origin, beside the consent
		// route, as the TanStack Start browser bench's manifest-ssr arm does.
		const fetch = manifestFetch();
		const state = await resolveConsent({
			cache: createManifestCache(),
			fetch,
			mode: { type: 'manifest' },
			projectUrl: '/api/backend',
			request: requestOf({ 'x-vercel-ip-country': 'DE' }),
			routePrefix: '/api/inth',
			snapshot: undefined,
		});
		expect(String(fetch.mock.calls[0]?.[0])).toBe(
			'https://app.example.com/api/backend/v1/consent/manifest'
		);
		expect(state.initialPolicyResolution).toMatchObject({
			policyId: 'eu-opt-in',
			status: 'matched',
		});
	});

	test('never fetches the default /api/inth route, with no routePrefix set', async () => {
		const fetch = manifestFetch();
		const state = await createConsentStateHandler({
			cache: createManifestCache(),
			fetch,
			projectUrl: '/api/inth',
			request: requestOf({ cookie: 'inth=c.necessary:1,c.marketing:1,i.t:1' }),
		})();
		expect(fetch).not.toHaveBeenCalled();
		expect(state.initialRecords?.choice).toBeTruthy();
	});

	test('a prerender is a shared render: no visitor state, no prefetch', async () => {
		vi.stubEnv('TSS_PRERENDERING', 'true');
		const fetch = manifestFetch();
		const state = await resolveConsent({
			cache: createManifestCache(),
			fetch,
			projectUrl: 'https://consent.example.com',
			request: requestOf({
				cookie: 'inth=c.necessary:1,c.marketing:1,i.t:1',
				'x-vercel-ip-country': 'DE',
			}),
		});
		expect(fetch).not.toHaveBeenCalled();
		// Only what the browser needs to resolve the visitor itself.
		expect(state).toEqual({ projectUrl: 'https://consent.example.com' });
	});

	test('a deferred vendor list points at the route prefix, trailing slash trimmed', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>();
		vi.stubGlobal(
			'fetch',
			vi.fn<typeof globalThis.fetch>((input) =>
				Promise.resolve(
					new Response(
						JSON.stringify(
							String(input).includes('vendor-list')
								? {
										purposes: { '1': { id: 1, name: 'Store' } },
										vendorListVersion: 7,
										vendors: { '1': { id: 1, name: 'V', purposes: [1] } },
									}
								: {}
						)
					)
				)
			)
		);
		const state = await resolveConsent({
			projectUrl: 'https://consent.example.com',
			request: requestOf(),
			routePrefix: '/api/consent/',
			snapshot: {
				...MANIFEST_FIXTURE,
				cmpId: 28,
				iab: {
					enabled: true,
					gvl: { url: 'https://gvl.example/vendor-list.json' },
				},
				policyPacks: [
					createConsentManifestPolicyPack({
						id: 'iab',
						match: { fallback: true },
						model: 'iab',
						prompt: 'choice',
					}),
				],
			} as unknown as typeof MANIFEST_FIXTURE,
		});
		vi.unstubAllGlobals();
		expect(fetch).not.toHaveBeenCalled();
		expect(state.initialIab?.gvlReference?.url).toMatch(
			/^\/api\/consent\/v1\/consent\/init\?inth-gvl=7/u
		);
		expect(state.routePrefix).toBe('/api/consent');
	});

	test('rejects a route prefix of / when the handler is created', async () => {
		const message =
			"@inth/tanstack-start: `routePrefix` can't be '/': a consent route at the site root would catch every page. Use a path such as '/api/inth'.";
		expect(() => createConsentStateHandler({ routePrefix: '/' })).toThrow(
			message
		);
		await expect(
			resolveConsent({ request: requestOf(), routePrefix: '/' })
		).rejects.toThrow(message);
	});
});
