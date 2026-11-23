import {
	buildConsentManifestFromConfig,
	policyRulePresets,
} from '@inth/sdk/schema/types';
import { clearManifestCache } from '@inth/sdk/server';
import { enTranslations } from '@inth/sdk/translations';
import { baseTranslations } from '@inth/sdk/translations/all';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { completeGVL } from '../../../iab/src/__tests__/fixtures/gvl-sample';
import { resolveOptions } from '../integration';
import { createConsentMiddleware } from '../middleware-handler';
import { hosted as hostedMode, manifest as manifestMode } from '../mode';
import { testing as testingMode } from '../testing';
import type { InthAstroOptions, InthLocals } from '../types';
import { testRule, testWire } from './policy-fixture';

interface RunInput {
	headers?: Record<string, string>;
	options?: InthAstroOptions;
	isPrerendered?: boolean;
	fetch?: typeof globalThis.fetch;
	/** Extra `Astro.locals` fields, such as an adapter runtime. */
	locals?: Record<string, unknown>;
	experimentArm?: (context: {
		request: Request;
	}) => string | undefined | Promise<string | undefined>;
	/** Receives every `context.cookies.set` call. */
	setCookie?: (name: string, value: string, options: unknown) => void;
}

const run = async function run(input: RunInput = {}): Promise<InthLocals> {
	const middleware = createConsentMiddleware(
		resolveOptions(
			input.options ?? { mode: testingMode({ policy: [testRule] }) }
		),
		{ experimentArm: input.experimentArm, fetch: input.fetch }
	);
	const locals = { ...(input.locals ?? {}) } as { inth: InthLocals };
	const next = vi.fn(() => new Response('ok'));
	await middleware(
		{
			cookies: { set: input.setCookie ?? (() => undefined) },
			isPrerendered: input.isPrerendered ?? false,
			locals,
			request: new Request('https://example.com/', {
				headers: new Headers(input.headers ?? {}),
			}),
		} as never,
		next as never
	);
	expect(next).toHaveBeenCalledOnce();
	return locals.inth;
};

describe('consent middleware', () => {
	afterEach(() => {
		clearManifestCache();
		vi.useRealTimers();
	});

	it("hands a stale manifest's background refresh to locals.runtime.ctx.waitUntil", async () => {
		vi.useFakeTimers();
		const manifest = await buildConsentManifestFromConfig({
			branding: 'inth',
			policyRules: [policyRulePresets.europeOptIn()],
		});
		const fetchImpl = vi.fn(() =>
			Promise.resolve(
				new Response(JSON.stringify(manifest), {
					headers: {
						'cache-control': 'public, s-maxage=1, stale-while-revalidate=600',
						'content-type': 'application/json',
						etag: 'W/"v1"',
					},
					status: 200,
				})
			)
		) as unknown as typeof globalThis.fetch;
		const registered: Promise<unknown>[] = [];
		const locals = {
			runtime: {
				ctx: {
					waitUntil: (promise: Promise<unknown>) => {
						registered.push(promise);
					},
				},
			},
		};
		// A relative backend sends no session report, so the registrations
		// counted below are the refresh alone.
		const options: InthAstroOptions = {
			mode: manifestMode({
				manifestUrl: 'https://consent.example.com/v1/consent/manifest',
			}),
			projectUrl: '/api/self-host',
		};

		await run({ fetch: fetchImpl, locals, options });
		expect(registered).toHaveLength(0);

		vi.setSystemTime(Date.now() + 1500);
		await run({ fetch: fetchImpl, locals, options });
		expect(registered).toHaveLength(1);
		await expect(registered[0]).resolves.toBeUndefined();
		expect(fetchImpl).toHaveBeenCalledTimes(2);
	});

	it('resolves the experiment arm per request', async () => {
		const options: InthAstroOptions = {
			experiment: {
				arms: { bar: { prompt: { container: { type: 'banner' } } } },
				id: 'banner-shape',
			},
			middleware: false,
			mode: testingMode({ policy: [testRule] }),
		};
		const experimentArm = ({ request }: { request: Request }) =>
			request.headers.get('x-arm') ?? undefined;
		const bar = await run({
			experimentArm,
			headers: { 'x-arm': 'bar' },
			options,
		});
		const control = await run({
			experimentArm,
			headers: { 'x-arm': 'control' },
			options,
		});
		const none = await run({ experimentArm, options });
		expect(bar.snapshot.experiment?.arm).toBe('bar');
		expect(control.snapshot.experiment?.arm).toBe('control');
		expect(none.snapshot.experiment).toBeNull();
		// Nothing is held: the banner is server HTML either way.
		expect(none.snapshot.experimentPending).toBe(false);
	});

	it('populates locals for a first-time visitor', async () => {
		const inth = await run();
		expect(inth.shouldShowBanner).toBe(true);
		expect(inth.snapshot.explicitChoice).toBeNull();
	});

	it('reads geo through the shared header precedence', async () => {
		const inth = await run({
			headers: {
				'cf-ipcountry': 'FR',
				'x-inth-country': 'DE',
				'x-vercel-ip-country-region': 'BY',
			},
		});
		// `x-inth-*` always outranks infrastructure headers.
		expect(inth.inputs.country).toBe('DE');
		expect(inth.inputs.region).toBe('BY');
		expect(inth.config.initialOverrides?.country).toBe('DE');
	});

	it('reads GPC', async () => {
		expect((await run({ headers: { 'sec-gpc': '1' } })).inputs.gpc).toBe(true);
		expect((await run({ headers: { 'sec-gpc': '0' } })).inputs.gpc).toBe(false);
		expect((await run()).inputs.gpc).toBeUndefined();
	});

	it('negotiates the language from accept-language', async () => {
		const inth = await run({
			headers: { 'accept-language': 'de-DE,de;q=0.9,en;q=0.8' },
		});
		expect(inth.inputs.language).toBe('de');
		expect(inth.snapshot.translations?.language).toBe('de');
	});

	it('lets an explicit locale beat accept-language', async () => {
		const inth = await run({
			headers: { 'accept-language': 'de-DE' },
			options: {
				i18n: { locale: 'fr' },
				mode: testingMode({ policy: [testRule] }),
			},
		});
		expect(inth.snapshot.translations?.language).toBe('fr');
	});

	it('keeps the other labels in a group when i18n.messages overrides one', async () => {
		const inth = await run({
			options: {
				i18n: {
					locale: 'en',
					messages: {
						en: {
							common: { acceptAll: 'Yes please' },
							cookieBanner: { title: 'Cookies here' },
						},
					},
				},
				mode: testingMode({ policy: [testRule] }),
			},
		});
		const translations = inth.snapshot.translations?.translations;
		expect(translations?.common.acceptAll).toBe('Yes please');
		expect(translations?.common.rejectAll).toBe(
			enTranslations.common.rejectAll
		);
		expect(translations?.common.customize).toBe(
			enTranslations.common.customize
		);
		expect(translations?.cookieBanner.title).toBe('Cookies here');
		expect(translations?.cookieBanner.description).toBe(
			enTranslations.cookieBanner.description
		);
	});

	it('renders a regional locale over its primary language bundle', async () => {
		const stock = baseTranslations.de;
		const inth = await run({
			options: {
				i18n: {
					locale: 'de-AT',
					messages: {
						'de-AT': {
							...stock,
							cookieBanner: { ...stock.cookieBanner, title: 'Servus' },
						},
					},
				},
				mode: testingMode({ policy: [testRule] }),
			},
		});
		const copy = inth.snapshot.translations?.translations;
		expect(inth.snapshot.translations?.language).toBe('de-AT');
		expect(copy?.cookieBanner.title).toBe('Servus');
		expect(copy?.cookieBanner.description).toBe(stock.cookieBanner.description);
		expect(copy?.common.acceptAll).toBe(stock.common.acceptAll);
	});

	it('sets no subject cookie for a new visitor, and the render has no subject', async () => {
		const setCookie = vi.fn();
		const inth = await run({
			headers: { cookie: 'theme=dark' },
			options: {
				mode: testingMode({ policy: [testRule] }),
				storageConfig: { crossSubdomain: true, storageKey: 'consent' },
			},
			setCookie,
		});
		expect(setCookie).not.toHaveBeenCalled();
		expect(inth.config.initialRecords?.subject?.subjectId).toBeUndefined();
		expect(inth.config.initialRecords?.choice).toBeNull();
	});

	it('skips the network prefetch on a prerendered route', async () => {
		const fetchImpl = vi.fn();
		const inth = await run({
			fetch: fetchImpl as never,
			isPrerendered: true,
			options: {
				mode: hostedMode(),
				projectUrl: 'https://consent.example.com',
			},
		});
		expect(fetchImpl).not.toHaveBeenCalled();
		// No request to resolve means no server-side decision, so the banner
		// stays out of the cached HTML and the browser decides instead.
		expect(inth.shouldShowBanner).toBe(false);
		expect(inth.snapshot.resolution.status).toBe('unconfigured');
	});

	it('folds a hosted /init response into the config', async () => {
		const fetchImpl = vi.fn(() =>
			Response.json({
				branding: 'inth',
				consents: {},
				hasConsented: false,
				location: { countryCode: 'DE', regionCode: null },
				policyResolution: testWire({ id: 'gdpr' }),
				translations: { language: 'en', translations: {} },
			})
		);
		const inth = await run({
			fetch: fetchImpl as never,
			headers: { 'x-inth-country': 'DE' },
			options: {
				mode: hostedMode(),
				projectUrl: 'https://consent.example.com',
			},
		});
		expect(fetchImpl).toHaveBeenCalledOnce();
		const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
		// The query carries the consent journey the render started.
		expect(url.split('?')[0]).toBe(
			'https://consent.example.com/v1/consent/init'
		);
		expect((init.headers as Record<string, string>)['x-inth-country']).toBe(
			'DE'
		);
		expect(inth.config.initialLocation?.countryCode).toBe('DE');
	});

	it('keeps an app i18n override over hosted /init translations for the same language', async () => {
		const fetchImpl = vi.fn(() =>
			Response.json({
				location: { countryCode: 'DE', regionCode: null },
				policyResolution: testWire({ id: 'gdpr' }),
				translations: {
					language: 'en',
					translations: {
						cookieBanner: {
							description: 'Backend description',
							title: 'Backend title',
						},
					},
				},
			})
		);
		const inth = await run({
			fetch: fetchImpl as never,
			options: {
				i18n: { messages: { en: { cookieBanner: { title: 'App title' } } } },
				mode: hostedMode(),
				projectUrl: 'https://consent.example.com',
			},
		});
		const copy = inth.snapshot.translations?.translations;
		expect(copy?.cookieBanner.title).toBe('App title');
		expect(copy?.cookieBanner.description).toBe('Backend description');
		// The page's inlined config carries the same copy the server rendered.
		expect(
			inth.config.initialTranslations?.translations.cookieBanner.title
		).toBe('App title');
	});

	it('shows a backend edit when i18n passes the stock bundle for that language', async () => {
		const stock = baseTranslations.de;
		const fetchImpl = vi.fn(() =>
			Response.json({
				location: { countryCode: 'DE', regionCode: null },
				policyResolution: testWire({ id: 'gdpr' }),
				translations: {
					language: 'de',
					translations: {
						...stock,
						cookieBanner: { ...stock.cookieBanner, title: 'Vom Backend' },
					},
				},
			})
		);
		const inth = await run({
			fetch: fetchImpl as never,
			options: {
				i18n: { locale: 'de', messages: { de: { ...stock } } },
				mode: hostedMode(),
				projectUrl: 'https://consent.example.com',
			},
		});
		expect(inth.snapshot.translations?.translations.cookieBanner.title).toBe(
			'Vom Backend'
		);
	});

	it('deep-merges a partial i18n section over the bundled copy', async () => {
		const inth = await run({
			options: {
				i18n: { messages: { en: { cookieBanner: { title: 'App title' } } } },
				mode: testingMode({ policy: [testRule] }),
			},
		});
		const copy = inth.snapshot.translations?.translations;
		expect(copy?.cookieBanner.title).toBe('App title');
		expect(copy?.cookieBanner.description).toBeTruthy();
	});

	it('degrades silently when the backend is down', async () => {
		const fetchImpl = vi.fn(() => {
			throw new Error('ECONNREFUSED');
		});
		const inth = await run({
			fetch: fetchImpl as never,
			options: {
				mode: hostedMode(),
				projectUrl: 'https://consent.example.com',
			},
		});
		expect(inth.config.initialTranslations?.language).toBe('en');
	});

	it('sends init no cookie, a consent cookie included', async () => {
		const fetchImpl = vi.fn(() => Response.json({}));
		await run({
			fetch: fetchImpl as never,
			headers: { cookie: 'session=abc; inth=c.necessary:1' },
			options: {
				mode: hostedMode(),
				projectUrl: 'https://consent.example.com',
			},
		});
		const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
		expect((init.headers as Record<string, string>).cookie).toBeUndefined();
	});

	it('resolves a relative backend against the request, not the caller', async () => {
		// A forged `x-forwarded-host` must not steer the server-side fetch.
		const fetchImpl = vi.fn(() => Response.json({}));
		await run({
			fetch: fetchImpl as never,
			headers: { 'x-forwarded-host': 'evil.example' },
			options: { mode: hostedMode(), projectUrl: '/api/consent' },
		});
		const [url] = fetchImpl.mock.calls[0] as [string, RequestInit];
		expect(url.split('?')[0]).toBe(
			'https://example.com/api/consent/v1/consent/init'
		);
	});

	it('never fetches its own injected init route', async () => {
		const fetchImpl = vi.fn(() => Response.json({}));
		const result = await run({
			fetch: fetchImpl as never,
			options: { mode: hostedMode(), projectUrl: '/api/inth' },
		});
		expect(fetchImpl).not.toHaveBeenCalled();
		expect(result.hasPolicy).toBe(false);
	});
});

it.each(['inth=consent', 'session=unrelated'])(
	'defers the hosted vendor list to the browser when the request cookie is %s',
	async (cookie) => {
		const fetch = vi.fn(() =>
			Promise.resolve(
				Response.json({
					branding: 'inth',
					gvl: completeGVL,
					location: { countryCode: 'DE', regionCode: null },
					policyResolution: testWire({ model: 'iab' }),
					translations: { language: 'en', translations: {} },
				})
			)
		);
		vi.stubGlobal('fetch', fetch);
		try {
			const result = await run({
				headers: { cookie },
				// IAB is opt-in: without `iab` an IAB policy throws.
				options: {
					iab: { cmpId: 28 },
					mode: hostedMode(),
					projectUrl: 'https://consent.example.com',
				},
			});
			expect(fetch).toHaveBeenCalledOnce();
			// No cookie travels to init, so the browser can ask it for the list.
			expect(result.config.initialIab?.gvl).toBeNull();
			expect(result.config.initialIab?.gvlReference).toBeDefined();
		} finally {
			vi.unstubAllGlobals();
		}
	}
);
