import { clearManifestCache } from '@inth/sdk/server';
import { manifest as browserManifest } from '@inth/sdk/transports/manifest-browser';
import { beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import { transportMode } from '../../../__tests__/fixtures/transport-mode';
import { createConsentRoute } from '../create-consent-route';
import { inthHandle } from '../inth-handle';
import type { InthLocals } from '../kit-locals.model';
import { CONSENTED_COOKIE, createEvent } from './event';
import { MANIFEST_FIXTURE } from './manifest-fixture';

const runHandle = async function runHandle(
	event: ReturnType<typeof createEvent>,
	options?: Parameters<typeof inthHandle>[0]
) {
	const resolve = vi.fn(() => Promise.resolve(new Response('ok')));
	const response = await inthHandle(options)({ event, resolve });
	return {
		locals: (event.locals as { inth: InthLocals }).inth,
		resolve,
		response,
	};
};

describe('inthHandle', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	test('normalizes infra geo headers onto the request as x-inth-*', async () => {
		const event = createEvent({
			headers: {
				'cf-ipcountry': 'DE',
				'x-vercel-ip-country-region': 'BE',
			},
		});
		await runHandle(event);

		expect(event.request.headers.get('x-inth-country')).toBe('DE');
		expect(event.request.headers.get('x-inth-region')).toBe('BE');
	});

	test('normalizes GPC to sec-gpc and into the kernel overrides', async () => {
		const event = createEvent({ headers: { 'sec-gpc': '1' } });
		const { locals } = await runHandle(event);

		expect(event.request.headers.get('sec-gpc')).toBe('1');
		expect(locals.inputs.gpc).toBe(true);
		expect(locals.config.initialPrivacySignals?.gpc).toBe(true);
	});

	test('lets explicit x-inth-* headers beat infrastructure headers', async () => {
		const event = createEvent({
			headers: {
				'cf-ipcountry': 'DE',
				'x-inth-country': 'FR',
			},
		});
		const { locals } = await runHandle(event);

		expect(locals.inputs.country).toBe('FR');
		expect(event.request.headers.get('x-inth-country')).toBe('FR');
	});

	test('option overrides beat every header', async () => {
		const event = createEvent({ headers: { 'x-inth-country': 'FR' } });
		const { locals } = await runHandle(event, { country: 'US', region: 'CA' });

		expect(locals.inputs.country).toBe('US');
		expect(locals.inputs.region).toBe('CA');
	});

	test('rewrites accept-language to the language it resolved', async () => {
		const event = createEvent({
			headers: { 'accept-language': 'fr-FR,fr;q=0.9' },
		});
		const { locals } = await runHandle(event, { language: 'de' });

		expect(locals.inputs.language).toBe('de');
		// A downstream route re-reads `accept-language`, so it has to carry
		// the resolved language rather than the browser's original list.
		expect(event.request.headers.get('accept-language')).toBe('de');
	});

	test('parses the consent cookie into the kernel config', async () => {
		const event = createEvent({ headers: { cookie: CONSENTED_COOKIE } });
		const { locals } = await runHandle(event);

		expect(locals.config.initialRecords?.choice).not.toBeNull();
		expect(
			locals.config.initialRecords?.choice?.categories.marketing
		).toMatchObject({
			basis: { kind: 'legacy-v2' },
			value: true,
		});
	});

	test('records no choice when there is no request context', async () => {
		const event = createEvent();
		const { locals } = await runHandle(event);

		expect(locals.config).toMatchObject({
			// No signal is not a decision: an absent header stays undefined.
			initialPrivacySignals: { gpc: undefined },
			initialRecords: { choice: null },
			now: expect.any(Number),
		});
		// Nothing is stored before a choice, so there is no subject ID yet.
		expect(locals.config.initialRecords?.subject?.subjectId).toBeUndefined();
		expect(locals.inputs.country).toBeUndefined();
	});

	test('negotiates language q-values rather than splitting the first token', async () => {
		const event = createEvent({
			headers: { 'accept-language': 'en;q=0.4,de-DE;q=0.9' },
		});
		const { locals } = await runHandle(event);

		expect(locals.inputs.language).toBe('de');
	});

	test('continues when request headers are immutable', async () => {
		const event = createEvent({ headers: { 'cf-ipcountry': 'DE' } });
		vi.spyOn(event.request.headers, 'set').mockImplementation(() => {
			throw new TypeError('immutable');
		});

		const { locals, resolve } = await runHandle(event);

		expect(resolve).toHaveBeenCalledOnce();
		expect(locals.inputs.country).toBe('DE');
	});

	test('passes the event through to resolve and returns its response', async () => {
		const event = createEvent();
		const { resolve, response } = await runHandle(event);

		expect(resolve).toHaveBeenCalledWith(event, {
			transformPageChunk: expect.any(Function),
		});
		expect(await response.text()).toBe('ok');
	});

	test("links the on-demand chunks a page's provider names", async () => {
		const { resolve } = await runHandle(createEvent());
		const [, resolveOptions] = resolve.mock.calls[0] as unknown as [
			unknown,
			{
				transformPageChunk: (input: { done: boolean; html: string }) => string;
			},
		];

		// Outside a `consentManifest()` build no chunk is named, so no link
		// is added.
		const page =
			'<head><meta name="inth-modulepreload" content="loader-and-blocker"></head>';
		expect(resolveOptions.transformPageChunk({ done: true, html: page })).toBe(
			page
		);
		expect(
			resolveOptions.transformPageChunk({ done: true, html: '<p>page</p>' })
		).toBe('<p>page</p>');
	});
});

describe('inthHandle mode', () => {
	test('stores manifest() by default, with the route prefix and backend', async () => {
		const { locals } = await runHandle(createEvent(), {
			projectUrl: 'https://consent.example.com',
			routePrefix: '/api/inth',
		});
		expect(locals).toMatchObject({
			mode: { type: 'manifest' },
			projectUrl: 'https://consent.example.com',
			routePrefix: '/api/inth',
		});
	});

	test('stores testing() as data', async () => {
		const { locals } = await runHandle(createEvent(), {
			mode: { type: 'testing' },
		});
		expect(locals.mode).toEqual({ type: 'testing' });
	});

	test('keeps only the data of a transport factory', async () => {
		const { locals } = await runHandle(createEvent(), {
			mode: browserManifest({ projectUrl: 'https://consent.example.com' }),
		});
		expect(locals.mode).toMatchObject({
			projectUrl: 'https://consent.example.com',
			type: 'manifest',
		});
		expect(typeof locals.mode).toBe('object');
	});

	test('trims a trailing slash off the route prefix', async () => {
		const { locals } = await runHandle(createEvent(), {
			routePrefix: '/api/inth/',
		});
		expect(locals.routePrefix).toBe('/api/inth');
	});

	test('rejects a route prefix of / when the hook is created', () => {
		expect(() => inthHandle({ routePrefix: '/' })).toThrow(
			"@inth/svelte: `routePrefix` can't be '/': a consent route at the site root would catch every page. Use a path such as '/api/inth'."
		);
	});

	test('rejects transportMode(), which cannot reach the browser as data', () => {
		const mode = transportMode({ init: () => Promise.resolve({}) });
		expect(() => inthHandle({ mode: mode as never })).toThrow(
			/cannot reach the browser/u
		);
	});
});

// The consent route never renders a page, and its manifest is public data a
// shared cache keeps.
describe('inthHandle on the consent route', () => {
	beforeEach(() => {
		clearManifestCache();
	});

	test.each([
		[
			'the configured routePrefix',
			'/api/self-host',
			{ routePrefix: '/api/self-host' },
		],
		['the default route', '/api/inth', {}],
	] as const)(
		'the public manifest under %s gets no subject cookie',
		async (_, prefix, options) => {
			const setCookie = vi.fn();
			const event = createEvent({
				route: {
					id: `${prefix}/[...path]`,
					params: { path: 'v1/consent/manifest' },
				},
				setCookie,
				url: `https://shop.example${prefix}/v1/consent/manifest`,
			});
			const { GET } = createConsentRoute({
				fetch: vi.fn<typeof globalThis.fetch>().mockResolvedValue(
					Response.json(MANIFEST_FIXTURE, {
						headers: { 'cache-control': 'public, s-maxage=120' },
					})
				),
				projectUrl: 'https://consent.example.com',
			});
			const response = await inthHandle(options)({
				event,
				resolve: () => GET(event),
			});
			expect(setCookie).not.toHaveBeenCalled();
			expect(response.headers.get('cache-control')).toBe(
				'public, s-maxage=120'
			);
			expect(await response.json()).toEqual(MANIFEST_FIXTURE);
		}
	);

	test('a page request sets no subject cookie', async () => {
		const setCookie = vi.fn();
		const event = createEvent({
			headers: { cookie: 'theme=dark' },
			setCookie,
			url: 'https://shop.example/pricing',
		});
		await runHandle(event);
		expect(setCookie).not.toHaveBeenCalled();
		expect(event.request.headers.get('cookie')).toBe('theme=dark');
	});
});
