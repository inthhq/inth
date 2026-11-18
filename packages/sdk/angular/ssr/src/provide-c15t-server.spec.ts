/**
 * `provideC15tServer()` on a real server render: the request reaches it
 * through `REQUEST`, the mode comes from `provideC15t()`, and the state
 * reaches the browser's `ConsentManager` through `TransferState`. The
 * resolution rules themselves are pinned in `@c15t/core/server`.
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
import { ConsentBanner, ConsentManager, provideC15t } from '@c15t/angular';
import type { C15tProviderOptions } from '@c15t/angular';
import type { RuntimePrefetch } from '@c15t/core/runtime';
import { clearManifestCache } from '@c15t/core/server';
import { EARLY_CONSENT_TAP_SCRIPT } from '@c15t/core/surface-actions';
import { hosted } from '@c15t/core/transports';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { testing } from '../../testing/src/testing-mode';
import { MANIFEST_FIXTURE } from './__tests__/manifest-fixture';
import { createConsentRoute } from './consent-route';
import { provideC15tServer } from './provide-c15t-server';
import type { C15tServerOptions } from './provide-c15t-server';

const SITE = 'https://shop.example';
const CONSENTED = `c15t=c.necessary:1,c.marketing:1,i.t:${Date.now()}`;

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
	template: `<c15t-consent-banner [hideBranding]="true" />`,
})
class BannerApp {}

const render = function render(
	c15t: C15tProviderOptions,
	server: C15tServerOptions = {},
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
						provideC15t(c15t),
						provideC15tServer(server),
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
		? (JSON.parse(state) as Record<string, RuntimePrefetch>).c15t
		: undefined;
};

beforeEach(() => {
	clearManifestCache();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('provideC15tServer', () => {
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
							provideC15t({ mode: testing() }),
							provideC15tServer(),
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
		)['c15t-boot'] ?? { s: { resolution: { status: 'missing' } } };
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
		const mode = hosted({ backendURL: '/api/c15t' });

		const html = await render(
			{ backendURL: '/api/c15t', mode },
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
			{ backendURL: '/api/c15t', mode },
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
					String(input).endsWith('/manifest')
						? Response.json(MANIFEST_FIXTURE)
						: Response.json({}, { status: 404 })
				)
			);
		const route = createConsentRoute({
			backendURL: '/api/c15t-upstream',
			fetch: upstream,
		});
		const request = new Request(`${SITE}/`, {
			headers: { 'x-vercel-ip-country': 'DE' },
		});

		const html = await render({ backendURL: '/api/c15t' }, { route }, request);

		expect(String(upstream.mock.calls[0]?.[0])).toBe(
			`${SITE}/api/c15t-upstream/manifest`
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
					String(input).endsWith('/manifest')
						? Response.json(MANIFEST_FIXTURE)
						: Response.json({}, { status: 404 })
				)
			);
		const route = createConsentRoute({
			backendURL: '/api/c15t-upstream',
			fetch: upstream,
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
			{ backendURL: '/api/c15t' },
			{ route, trustForwardedHeaders: true },
			request
		);

		expect(String(upstream.mock.calls[0]?.[0])).toBe(
			`${SITE}/api/c15t-upstream/manifest`
		);
		expect(transferred(html)?.initialPolicyResolution).toMatchObject({
			policyId: 'eu-opt-in',
		});
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
});

describe('the early-tap script', () => {
	const earlyTapScript = (html: string) =>
		new DOMParser()
			.parseFromString(html, 'text/html')
			.head.querySelector('script[data-c15t-early-tap]');

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
				provideC15t({ mode: testing(), persistence: false }),
			],
		});
		const consent = TestBed.inject(ConsentManager);
		// Before the runtime starts: only the transferred state has a policy.
		expect(consent.options().prefetch).toEqual(transferred(html));
		expect(consent.hasPolicy()).toBe(true);
		expect(consent.activeUI()).toBe('banner');
	});
});
