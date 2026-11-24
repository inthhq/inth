/**
 * Wiring of the injected route onto the core consent route handler. The
 * route behaviour itself is pinned once, in
 * `packages/sdk/core/src/server/__tests__/consent-route.test.ts`.
 */
import {
	buildConsentManifestFromConfig,
	policyRulePresets,
} from '@inth/sdk/schema/types';
import { clearManifestCache } from '@inth/sdk/server';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { completeGVL } from '../../../iab/src/__tests__/fixtures/gvl-sample';
import { resolveOptions } from '../integration';
import { manifest as manifestMode } from '../mode';
import {
	createConsentRouteHandlers,
	resolveConsentContext,
	waitUntilFromLocals,
} from '../server';
import type { InthAstroOptions } from '../types';

const MANIFEST = await buildConsentManifestFromConfig({
	branding: 'inth',
	policyRules: [
		policyRulePresets.europeOptIn(),
		policyRulePresets.worldOptOutNoPrompt(),
	],
});

const BACKEND = 'https://consent.example.com';

const request = (path: string, headers: Record<string, string> = {}) =>
	new Request(`https://site.example.com${path}`, { headers });

const options = (
	astroOptions: InthAstroOptions = {
		mode: manifestMode(),
		projectUrl: BACKEND,
	}
) => resolveOptions(astroOptions);

const upstream = () =>
	vi.fn<typeof globalThis.fetch>(() =>
		Promise.resolve(
			Response.json(MANIFEST, { headers: { 'cache-control': 's-maxage=60' } })
		)
	);

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	clearManifestCache();
});

describe('createConsentRouteHandlers', () => {
	it('reads the manifest from the mode: manifestUrl or projectUrl', async () => {
		for (const [mode, expected] of [
			[manifestMode(), `${BACKEND}/v1/consent/manifest`],
			[
				manifestMode({ manifestUrl: 'https://cdn.example.com/m.json' }),
				'https://cdn.example.com/m.json',
			],
		] as const) {
			clearManifestCache();
			const fetch = upstream();
			// oxlint-disable-next-line no-await-in-loop -- one mode at a time keeps the failing case readable.
			await createConsentRouteHandlers({
				fetch,
				options: options({ mode, projectUrl: BACKEND }),
			}).manifest(request('/api/inth/v1/consent/manifest'));
			expect(fetch.mock.calls[0]?.[0]).toBe(expected);
		}
	});

	it("serves a browser-resolved mode's absolute manifestUrl on a same-origin backend", async () => {
		const fetch = upstream();
		const response = await createConsentRouteHandlers({
			fetch,
			options: options({
				mode: manifestMode({
					manifestUrl: 'https://cdn.example.com/m.json',
					resolve: 'browser',
				}),
				projectUrl: '',
			}),
		}).manifest(request('/api/inth/v1/consent/manifest'));
		expect(response.status).toBe(200);
		expect(fetch.mock.calls[0]?.[0]).toBe('https://cdn.example.com/m.json');
	});

	it('resolves an inline manifest without fetching it', async () => {
		const fetch = upstream();
		const handlers = createConsentRouteHandlers({
			fetch,
			options: options({
				mode: manifestMode({ snapshot: MANIFEST }),
				projectUrl: BACKEND,
			}),
		});
		const response = await handlers.init(
			request('/api/inth/v1/consent/init', { 'x-inth-country': 'DE' })
		);
		expect(response.status).toBe(200);
		expect(
			fetch.mock.calls.filter(([url]) => !String(url).endsWith('/sessions'))
		).toEqual([]);
	});

	it('applies the configured locale to init, not just Accept-Language', async () => {
		const handlers = createConsentRouteHandlers({
			fetch: upstream(),
			options: options({
				i18n: { locale: 'de' },
				mode: manifestMode(),
				projectUrl: BACKEND,
			}),
		});
		const payload = await (
			await handlers.init(
				request('/api/inth/v1/consent/init', {
					'accept-language': 'fr',
					'x-inth-country': 'DE',
				})
			)
		).json();
		expect(payload.translations.language).toBe('de');
	});

	it('GET dispatches the catch-all route by its rest parameter', async () => {
		const handlers = createConsentRouteHandlers({
			fetch: upstream(),
			options: options(),
		});
		const get = (path: string) =>
			handlers.GET(request(`/api/inth/${path}`), { path });
		const manifest = await get('v1/consent/manifest');
		const init = await get('v1/consent/init');
		const other = await get('v1/consent/records');
		expect(manifest.headers.get('cache-control')).toBe('s-maxage=60');
		expect(init.headers.get('cache-control')).toBe('private, no-store');
		expect(other.status).toBe(404);
	});

	it('rejects a backend under its own route prefix when it is built', () => {
		expect(() =>
			createConsentRouteHandlers({
				options: options({ projectUrl: '/api/inth/backend' }),
			})
		).toThrow(/beneath the consent route|names the consent route/u);
	});

	it('registers detached work with the waitUntil on locals', async () => {
		const waitUntil = vi.fn();
		await createConsentRouteHandlers({
			fetch: upstream(),
			options: options(),
		}).init(request('/api/inth/v1/consent/init'), {
			locals: { cfContext: { waitUntil } },
		});
		expect(waitUntil).toHaveBeenCalledTimes(1);
	});
});

describe('waitUntilFromLocals', () => {
	it('prefers locals.cfContext and never reads the Astro 6 runtime getter then', () => {
		const cfContext = { waitUntil: vi.fn() };
		const locals = {
			cfContext,
			get runtime(): never {
				throw new Error('Astro 6 removed locals.runtime');
			},
		};
		const task = Promise.resolve();
		waitUntilFromLocals(task, locals);
		expect(cfContext.waitUntil).toHaveBeenCalledWith(task);
	});

	it('falls back to locals.runtime.ctx before Astro 6', () => {
		const ctx = { waitUntil: vi.fn() };
		const task = Promise.resolve();
		waitUntilFromLocals(task, { runtime: { ctx } });
		expect(ctx.waitUntil).toHaveBeenCalledWith(task);
		expect(() => waitUntilFromLocals(task, undefined)).not.toThrow();
	});
});

it('serves Astro manifest SSR references through the same-origin init route', async () => {
	const manifest = await buildConsentManifestFromConfig({
		branding: 'inth',
		iab: {
			cmpId: 28,
			enabled: true,
			gvl: { url: 'https://server-only.example/list.json' },
		},
		policyRules: [policyRulePresets.europeIab()],
	});
	if (!manifest.iab) {
		throw new Error('Expected IAB manifest');
	}
	manifest.iab.gvl = { url: 'https://server-only.example/list.json' };
	const gvlUpstream = vi.fn(() => Promise.resolve(Response.json(completeGVL)));
	vi.stubGlobal('fetch', gvlUpstream);
	const resolved = options({
		// IAB is opt-in: without `iab` an IAB policy throws.
		iab: { cmpId: 28 },
		mode: manifestMode({ snapshot: manifest }),
		projectUrl: BACKEND,
		routePrefix: '/privacy',
	});
	const context = await resolveConsentContext({
		headers: new Headers({ 'x-inth-country': 'DE' }),
		options: resolved,
		url: 'https://site.example.com/page',
	});
	const reference = context.config.initialIab?.gvlReference;
	expect(context.config.initialIab?.gvl).toBeNull();
	expect(reference?.url).toBe(
		`/privacy/v1/consent/init?inth-gvl=${completeGVL.vendorListVersion}&language=en`
	);
	const handlers = createConsentRouteHandlers({ options: resolved });
	const init = await handlers.init(
		request('/privacy/v1/consent/init', { 'x-inth-country': 'DE' })
	);
	expect((await init.json()).gvlReference.url).toBe(reference?.url);
	const list = await handlers.init(request(reference?.url ?? ''));
	expect(list.status).toBe(200);
	expect(await list.json()).toEqual(completeGVL);
	// The render, the init route and the list request share one download.
	expect(
		gvlUpstream.mock.calls.filter(([url]) => !String(url).endsWith('/sessions'))
	).toHaveLength(1);
});
