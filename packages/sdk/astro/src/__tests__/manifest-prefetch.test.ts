import {
	buildConsentManifestFromConfig,
	policyRulePresets,
} from '@inth/sdk/schema/types';
import { clearGvlCache, clearManifestCache } from '@inth/sdk/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { completeGVL } from '../../../iab/src/__tests__/fixtures/gvl-sample';
import { createConsentMiddleware } from '../create-consent-middleware';
import { resolveOptions } from '../integration';
import type { InthAstroOptions, InthLocals } from '../inth-options.model';
import { manifest as manifestMode } from '../mode';

const MANIFEST = await buildConsentManifestFromConfig({
	branding: 'inth',
	policyRules: [
		policyRulePresets.europeOptIn(),
		policyRulePresets.worldOptOutNoPrompt(),
	],
});

const manifestResponse = function manifestResponse(): Response {
	return new Response(JSON.stringify(MANIFEST), {
		headers: {
			'cache-control': 'public, s-maxage=300',
			'content-type': 'application/json',
			etag: '"manifest-1"',
		},
		status: 200,
	});
};

const options = function options(
	astroOptions: InthAstroOptions = {
		mode: manifestMode(),
		projectUrl: 'https://consent.example.com',
	}
) {
	return resolveOptions(astroOptions);
};

interface RenderInput {
	path?: string;
	method?: string;
	headers?: Record<string, string>;
	fetch?: typeof globalThis.fetch;
	astroOptions?: InthAstroOptions;
}

const render = async function render(
	input: RenderInput
): Promise<{ inth?: InthLocals; nextCalled: boolean }> {
	const middleware = createConsentMiddleware(options(input.astroOptions), {
		fetch: input.fetch,
	});
	const locals = {} as { inth?: InthLocals };
	const next = vi.fn(() => new Response('ok'));
	await middleware(
		{
			cookies: { set: () => undefined },
			isPrerendered: false,
			locals,
			request: new Request(`https://site.example.com${input.path ?? '/'}`, {
				headers: new Headers(input.headers ?? {}),
				method: input.method ?? 'GET',
			}),
		} as never,
		next as never
	);
	return { inth: locals.inth, nextCalled: next.mock.calls.length > 0 };
};

afterEach(() => {
	clearManifestCache();
	clearGvlCache();
});

describe('manifest-mode server prefetch', () => {
	it('reports each render to the backend, detached from the response', async () => {
		const fetchImpl = vi.fn((input: string) =>
			Promise.resolve(
				input.endsWith('/v1/consent/sessions')
					? new Response(null, { status: 204 })
					: manifestResponse()
			)
		);

		await render({
			fetch: fetchImpl as never,
			headers: {
				accept: 'text/html',
				'user-agent': 'Mozilla/5.0',
				'x-forwarded-for': '203.0.113.42',
				'x-inth-country': 'DE',
			},
		});
		await new Promise<void>((resolve) => {
			setTimeout(resolve, 0);
		});

		const report = fetchImpl.mock.calls.find(
			([url]) => url === 'https://consent.example.com/v1/consent/sessions'
		);
		expect(report).toBeDefined();
		const init = report?.[1] as RequestInit;
		expect((init.headers as Record<string, string>)['x-inth-client-ip']).toBe(
			'203.0.113.42'
		);
		expect(JSON.parse(init.body as string)).toMatchObject({
			adapter: '@inth/astro',
			country: 'DE',
			policy: { id: expect.any(String) },
			source: 'render',
		});
	});

	it('still resolves per-request geo off the cached manifest', async () => {
		const fetchImpl = vi.fn(() => Promise.resolve(manifestResponse()));

		const german = await render({
			fetch: fetchImpl as never,
			headers: { 'x-inth-country': 'DE' },
		});
		const american = await render({
			fetch: fetchImpl as never,
			headers: { 'x-inth-country': 'US' },
		});

		expect(
			fetchImpl.mock.calls.filter(([url]) =>
				String(url).endsWith('/v1/consent/manifest')
			)
		).toHaveLength(1);
		expect(german.inth?.shouldShowBanner).toBe(true);
		expect(american.inth?.shouldShowBanner).toBe(false);
	});

	it('serves an inline manifest without any fetch', async () => {
		const fetchImpl = vi.fn(() => Promise.resolve(manifestResponse()));
		const { inth } = await render({
			astroOptions: {
				mode: manifestMode({ snapshot: MANIFEST }),
				// Relative: no session report, so no request at all.
				projectUrl: '/api/self-host',
			},
			fetch: fetchImpl as never,
			headers: { 'x-inth-country': 'DE' },
		});
		expect(fetchImpl).not.toHaveBeenCalled();
		expect(inth?.shouldShowBanner).toBe(true);
	});
});

describe('middleware skip list', () => {
	it('leaves the injected init and manifest routes alone', async () => {
		const fetchImpl = vi.fn(() => Promise.resolve(manifestResponse()));

		const results = await Promise.all(
			['/api/inth/v1/consent/init', '/api/inth/v1/consent/manifest'].map(
				(path) => render({ fetch: fetchImpl as never, path })
			)
		);
		// Resolving consent here would fetch the manifest from this same
		// process, which would resolve consent again: the request never
		// returns.
		for (const result of results) {
			expect(result.inth).toBeUndefined();
			expect(result.nextCalled).toBe(true);
		}
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it('honours a custom routePrefix', async () => {
		const fetchImpl = vi.fn(() => Promise.resolve(manifestResponse()));
		const astroOptions: InthAstroOptions = {
			mode: manifestMode(),
			projectUrl: 'https://consent.example.com',
			routePrefix: '/consent',
		};
		expect(
			(
				await render({
					astroOptions,
					fetch: fetchImpl as never,
					path: '/consent/v1/consent/init',
				})
			).inth
		).toBeUndefined();
		expect(
			(
				await render({
					astroOptions,
					fetch: fetchImpl as never,
					path: '/api/inth/v1/consent/init',
				})
			).inth
		).toBeDefined();
	});

	it('skips the paths the site listed', async () => {
		const fetchImpl = vi.fn(() => Promise.resolve(manifestResponse()));
		const astroOptions: InthAstroOptions = {
			middleware: { skip: ['/healthz', '/api/webhooks/'] },
			mode: manifestMode(),
			projectUrl: 'https://consent.example.com',
		};
		const skipped = await Promise.all(
			['/healthz', '/api/webhooks', '/api/webhooks/stripe'].map((path) =>
				render({ astroOptions, fetch: fetchImpl as never, path })
			)
		);
		for (const result of skipped) {
			expect(result.inth).toBeUndefined();
		}
		// A prefix must not claim a sibling that merely starts with it.
		expect(
			(
				await render({
					astroOptions,
					fetch: fetchImpl as never,
					path: '/healthz-report',
				})
			).inth
		).toBeDefined();
	});
});

it.each(['public', 'custom'] as const)(
	'preserves %s Astro SSR vendor loading through the caching loader',
	async (loader) => {
		const manifest = await buildConsentManifestFromConfig({
			branding: 'inth',
			iab: {
				cmpId: 28,
				enabled: true,
				gvl: { url: `https://vendors.example/${loader}.json` },
			},
			policyRules: [policyRulePresets.europeIab()],
		});
		const fetch = vi.fn(() => Promise.resolve(Response.json(completeGVL)));
		vi.stubGlobal('fetch', fetch);
		try {
			const result = await render({
				// IAB is opt-in: without `iab` an IAB policy throws.
				astroOptions: {
					iab: { cmpId: 28 },
					mode: manifestMode({ snapshot: manifest }),
					projectUrl: 'https://consent.example.com',
				},
				fetch: loader === 'custom' ? fetch : undefined,
				headers: { 'x-inth-country': 'DE' },
			});
			// The list, besides the render's session report.
			expect(
				fetch.mock.calls.filter(([url]) => !String(url).endsWith('/sessions'))
			).toHaveLength(1);
			expect(result.inth?.config.initialIab?.gvl).toEqual(
				loader === 'public' ? null : completeGVL
			);
			expect(Boolean(result.inth?.config.initialIab?.gvlReference)).toBe(
				loader === 'public'
			);
		} finally {
			vi.unstubAllGlobals();
		}
	}
);
