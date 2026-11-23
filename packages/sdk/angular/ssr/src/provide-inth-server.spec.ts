/**
 * `provideInthServer()` on a real server render: the request reaches it
 * through `REQUEST`, the mode comes from `provideInth()`, and the state
 * reaches the browser's `ConsentManager` through `TransferState`. The
 * resolution rules themselves are pinned in `@inth/sdk/server`.
 */
import {
	APP_ID,
	ChangeDetectionStrategy,
	Component,
	inject,
	provideAppInitializer,
	provideZonelessChangeDetection,
	REQUEST,
} from '@angular/core';
import type { StaticProvider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { bootstrapApplication } from '@angular/platform-browser';
import {
	provideServerRendering,
	renderApplication,
} from '@angular/platform-server';
import { ConsentBanner, ConsentManager, provideInth } from '@inth/angular';
import type { InthProviderOptions } from '@inth/angular';
import type { RuntimePrefetch } from '@inth/sdk/runtime';
import { clearManifestCache } from '@inth/sdk/server';
import { EARLY_CONSENT_TAP_SCRIPT } from '@inth/sdk/surface-actions';
import { hosted } from '@inth/sdk/transports';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { testing } from '../../testing/src/testing';
import { MANIFEST_FIXTURE } from './__tests__/manifest-fixture';
import { createConsentRoute } from './consent-route.api';
import { provideInthServer } from './provide-inth-server';
import type { InthServerOptions } from './provide-inth-server';

const SITE = 'https://shop.example';
const CONSENTED = `inth=c.necessary:1,c.marketing:1,i.t:${Date.now()}`;

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'app-root',
	template: `<p data-testid="ui">{{ consent.activeUI() }}</p>`,
})
class App {
	protected readonly consent = inject(ConsentManager);
}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentBanner],
	selector: 'app-root',
	template: `<inth-consent-banner [hideBranding]="true" />`,
})
class BannerApp {}

const render = function render(
	inth: InthProviderOptions,
	server: InthServerOptions = {},
	request: Request | null = new Request(`${SITE}/`),
	root: new () => unknown = App
): Promise<string> {
	const platformProviders: StaticProvider[] = request
		? [{ provide: REQUEST, useValue: request }]
		: [];
	return renderApplication(
		(context) =>
			bootstrapApplication(
				root,
				{
					providers: [
						provideZonelessChangeDetection(),
						provideServerRendering(),
						provideInth(inth),
						provideInthServer(server),
					],
				},
				context
			),
		{
			document: '<html><head></head><body><app-root></app-root></body></html>',
			platformProviders,
			url: '/',
		}
	);
};

/** The consent state the page hands the browser. */
const transferred = function transferred(
	html: string
): RuntimePrefetch | undefined {
	const state = new DOMParser()
		.parseFromString(html, 'text/html')
		.querySelector('script#ng-state')?.textContent;
	return state
		? (JSON.parse(state) as Record<string, RuntimePrefetch>).inth
		: undefined;
};

beforeEach(() => {
	clearManifestCache();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('provideInthServer', () => {
	test('renders the banner for a new visitor and hands the state over', async () => {
		const html = await render({ mode: testing() });
		expect(html).toContain('data-testid="ui">banner</p>');
		const state = transferred(html);
		expect(state?.initialPolicyResolution?.status).toBe('matched');
		expect(state?.now).toEqual(expect.any(Number));
	});

	test('renders the resolved banner when an earlier initializer builds ConsentManager', async () => {
		// Angular runs every initializer before it awaits any: this one
		// builds the manager before the server state is resolved.
		const html = await renderApplication(
			(context) =>
				bootstrapApplication(
					BannerApp,
					{
						providers: [
							provideZonelessChangeDetection(),
							provideServerRendering(),
							provideAppInitializer(() => {
								inject(ConsentManager);
							}),
							provideInth({ mode: testing() }),
							provideInthServer(),
						],
					},
					context
				),
			{
				document:
					'<html><head></head><body><app-root></app-root></body></html>',
				platformProviders: [
					{ provide: REQUEST, useValue: new Request(`${SITE}/`) },
				],
				url: '/',
			}
		);
		expect(html).toContain('data-testid="consent-banner-root"');
		expect(transferred(html)?.initialPolicyResolution?.status).toBe('matched');
		const boot = new DOMParser()
			.parseFromString(html, 'text/html')
			.querySelector('script#ng-state')?.textContent;
		const { s } = (
			JSON.parse(boot ?? '{}') as Record<
				string,
				{ s: { resolution: { status: string } } }
			>
		)['inth-boot'] ?? { s: { resolution: { status: 'missing' } } };
		expect(s.resolution.status).toBe('matched');
	});

	test('reads the consent cookie, so a returning visitor gets no banner', async () => {
		const html = await render(
			{ mode: testing() },
			{},
			new Request(`${SITE}/`, { headers: { cookie: CONSENTED } })
		);
		expect(html).toContain('data-testid="ui">none</p>');
		expect(transferred(html)?.initialRecords?.choice).not.toBeNull();
	});

	test('resolves a backend on the consent route in-process', async () => {
		const network = vi.spyOn(globalThis, 'fetch');
		const route = createConsentRoute({
			snapshot: MANIFEST_FIXTURE,
		});
		const request = () =>
			new Request(`${SITE}/`, { headers: { 'x-vercel-ip-country': 'DE' } });
		const mode = hosted({ projectUrl: '/api/inth' });

		const html = await render(
			{ mode, projectUrl: '/api/inth' },
			{ route },
			request()
		);
		expect(html).toContain('data-testid="ui">banner</p>');
		expect(transferred(html)?.initialPolicyResolution).toMatchObject({
			policyId: 'eu-opt-in',
		});
		expect(network).not.toHaveBeenCalled();

		// Without the route the render never fetches its own origin: the
		// browser resolves the policy after hydration.
		const alone = await render(
			{ mode, projectUrl: '/api/inth' },
			{},
			request()
		);
		expect(alone).toContain('data-testid="ui">none</p>');
		expect(transferred(alone)?.initialPolicyResolution).toBeUndefined();
		expect(network).not.toHaveBeenCalled();
	});

	test('resolves in-process against the site origin for a site-relative upstream', async () => {
		const upstream = vi
			.fn<typeof globalThis.fetch>()
			.mockImplementation((input) =>
				Promise.resolve(
					String(input).endsWith('/v1/consent/manifest')
						? Response.json(MANIFEST_FIXTURE)
						: Response.json({}, { status: 404 })
				)
			);
		const route = createConsentRoute({
			fetch: upstream,
			projectUrl: '/api/inth-upstream',
		});
		const request = new Request(`${SITE}/`, {
			headers: { 'x-vercel-ip-country': 'DE' },
		});

		const html = await render({ projectUrl: '/api/inth' }, { route }, request);

		expect(String(upstream.mock.calls[0]?.[0])).toBe(
			`${SITE}/api/inth-upstream/v1/consent/manifest`
		);
		expect(transferred(html)?.initialPolicyResolution).toMatchObject({
			policyId: 'eu-opt-in',
		});
		expect(html).toContain('data-testid="ui">banner</p>');
	});

	test('resolves in-process on the forwarded origin when the route trusts it', async () => {
		const upstream = vi
			.fn<typeof globalThis.fetch>()
			.mockImplementation((input) =>
				Promise.resolve(
					String(input).endsWith('/v1/consent/manifest')
						? Response.json(MANIFEST_FIXTURE)
						: Response.json({}, { status: 404 })
				)
			);
		const route = createConsentRoute({
			fetch: upstream,
			projectUrl: '/api/inth-upstream',
			trustForwardedHeaders: true,
		});
		const request = new Request('http://internal:4000/', {
			headers: {
				'x-forwarded-host': new URL(SITE).host,
				'x-forwarded-proto': 'https',
				'x-vercel-ip-country': 'DE',
			},
		});

		const html = await render(
			{ projectUrl: '/api/inth' },
			{ route, trustForwardedHeaders: true },
			request
		);

		expect(String(upstream.mock.calls[0]?.[0])).toBe(
			`${SITE}/api/inth-upstream/v1/consent/manifest`
		);
		expect(transferred(html)?.initialPolicyResolution).toMatchObject({
			policyId: 'eu-opt-in',
		});
	});

	test("leaves a transport of the app's own to the browser", async () => {
		const network = vi.spyOn(globalThis, 'fetch');
		const html = await render(
			{
				mode: Object.assign(() => ({}), { kind: 'offline' as const }),
				projectUrl: '/api/inth',
			},
			{},
			new Request(`${SITE}/`, { headers: { cookie: CONSENTED } })
		);
		const state = transferred(html);
		expect(state?.initialPolicyResolution).toBeUndefined();
		expect(state?.initialRecords?.choice).not.toBeNull();
		expect(network).not.toHaveBeenCalled();
	});

	test('a render without a request is shared: no visitor clock', async () => {
		const html = await render({ mode: testing() }, {}, null);
		expect(html).toContain('data-testid="ui">banner</p>');
		expect(transferred(html)?.now).toBeUndefined();
	});

	test('leaves an explicit prefetch alone', async () => {
		const html = await render({
			mode: testing(),
			prefetch: {},
		});
		expect(transferred(html)).toBeUndefined();
	});

	test('starts the scripts stored consent allows before hydration', async () => {
		const scripts = [
			{
				category: 'marketing' as const,
				id: 'pixel',
				serverStart: () => ({ code: 'window.pixelReady = true' }),
				src: 'https://cdn.example/pixel.js',
			},
		];
		const returning = await render(
			{ mode: testing(), nonce: 'n0nce', scripts },
			{},
			new Request(`${SITE}/`, { headers: { cookie: CONSENTED } })
		);
		const { body } = new DOMParser().parseFromString(returning, 'text/html');
		const start = [...body.querySelectorAll('script:not([type])')].find(
			(script) => script.textContent?.includes('pixel.js')
		);
		expect(start?.getAttribute('nonce')).toBe('n0nce');

		// A visitor who still owes a choice starts nothing.
		const fresh = await render({ mode: testing(), scripts });
		expect(fresh).not.toContain('pixel.js');
	});

	test('starts an integration from the registry source the manifest lists with experimentalScriptRegistry', async () => {
		const registrySrc =
			'https://acme.inth.app/scripts/pixel@0123456789abcdef.js';
		const route = createConsentRoute({
			snapshot: {
				...MANIFEST_FIXTURE,
				scriptRegistry: {
					sources: {
						pixel: { integrity: 'sha384-registry', src: registrySrc },
					},
				},
			},
		});
		// The URL and attributes the server start inserts the pixel's tag with.
		const started = async (experimentalScriptRegistry?: boolean) => {
			const html = await render(
				{
					experimentalScriptRegistry,
					mode: hosted({ projectUrl: '/api/inth' }),
					projectUrl: '/api/inth',
					scripts: [
						{
							category: 'necessary',
							id: 'pixel',
							integration: 'pixel',
							serverStart: () => ({ code: '' }),
							src: 'https://cdn.example/pixel.js',
						},
					],
				},
				{ route }
			);
			return {
				...(/i\("pixel",(?<src>"[^"]+")(?:,\{"attributes":(?<attributes>\{[^}]*\}))?/u.exec(
					html
				)?.groups ?? {}),
			};
		};

		expect(await started(true)).toEqual({
			attributes: '{"integrity":"sha384-registry","crossorigin":"anonymous"}',
			src: JSON.stringify(registrySrc),
		});
		expect((await started()).src).toBe(
			JSON.stringify('https://cdn.example/pixel.js')
		);
	});
});

describe('the early-tap script', () => {
	const earlyTapScript = (html: string) =>
		new DOMParser()
			.parseFromString(html, 'text/html')
			.head.querySelector('script[data-inth-early-tap]');

	test('goes into <head> with the nonce when the banner renders', async () => {
		const html = await render(
			{ mode: testing(), nonce: 'n0nce' },
			{},
			undefined,
			BannerApp
		);
		expect(html).toContain('data-testid="consent-banner-root"');
		const script = earlyTapScript(html);
		expect(script?.getAttribute('nonce')).toBe('n0nce');
		expect(script?.textContent).toBe(EARLY_CONSENT_TAP_SCRIPT);
	});

	test('is left out when no banner renders', async () => {
		const returning = await render(
			{ mode: testing() },
			{},
			new Request(`${SITE}/`, { headers: { cookie: CONSENTED } }),
			BannerApp
		);
		expect(returning).not.toContain('data-testid="consent-banner-root"');
		expect(earlyTapScript(returning)).toBeNull();

		// A page without the stock banner holds nothing.
		expect(earlyTapScript(await render({ mode: testing() }))).toBeNull();
	});
});

describe('the browser side', () => {
	afterEach(() => {
		document.getElementById('ng-state')?.remove();
	});

	test('ConsentManager starts from the state the server rendered with', async () => {
		const html = await render({ mode: testing() });
		const page = new DOMParser().parseFromString(html, 'text/html');
		const script = page.querySelector('script#ng-state');
		expect(script).not.toBeNull();
		// The browser's TransferState reads the page's state script.
		document.body.append(document.importNode(script as Element, true));

		TestBed.configureTestingModule({
			providers: [
				// The id the server render wrote the state under.
				{ provide: APP_ID, useValue: 'ng' },
				provideInth({ mode: testing(), persistence: false }),
			],
		});
		const consent = TestBed.inject(ConsentManager);
		// Before the runtime starts: only the transferred state has a policy.
		expect(consent.options().prefetch).toEqual(transferred(html));
		expect(consent.hasPolicy()).toBe(true);
		expect(consent.activeUI()).toBe('banner');
	});
});
