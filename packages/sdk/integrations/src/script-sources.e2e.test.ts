/**
 * @vitest-environment jsdom
 *
 * An integration loaded from a `scriptLoader.sources` entry, such as a
 * vetted copy on the site's own host, keeps its setup and attributes.
 */
import { createConsentRuntime } from '@inth/sdk/runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerVendorContractCleanup } from './__tests__/e2e-test-utils';
import type { TestWindow } from './__tests__/e2e-test-utils';
import { metaPixel } from './vendors/ads-and-pixels/meta-pixel';
import { plausibleAnalytics } from './vendors/analytics/plausible-analytics';
import { posthog } from './vendors/analytics/posthog';
import { rudderstack } from './vendors/analytics/rudderstack';

/** A mode with no backend: init answers nothing and nothing is saved. */
const noBackend = Object.assign(() => ({ init: () => Promise.resolve({}) }), {
	kind: 'custom' as const,
});

const REGISTRY_SRC = 'https://acme.example/scripts/posthog@0123456789abcdef.js';
const REGISTRY_INTEGRITY = 'sha384-registry';

/**
 * `hubspot` from a fresh module: HubSpot keeps one installation per page, as
 * a real page does until it reloads, so each test needs its own.
 */
const freshHubspot = async () => {
	vi.resetModules();
	return (await import('./vendors/analytics/hubspot')).hubspot;
};

const scriptBySrc = (prefix: string) =>
	[...document.head.querySelectorAll('script')].find((script) =>
		script.getAttribute('src')?.startsWith(prefix)
	);

describe('scriptLoader.sources with integrations', () => {
	registerVendorContractCleanup();

	afterEach(() => {
		delete (window as { __inthDebug?: unknown }).__inthDebug;
	});

	it('loads PostHog from its source with integrity, after its setup ran', () => {
		const runtime = createConsentRuntime({
			// Consent management off grants every category, so both load now.
			enabled: false,
			mode: noBackend,
			persistence: false,
			scriptLoader: {
				sources: {
					posthog: { integrity: REGISTRY_INTEGRITY, src: REGISTRY_SRC },
				},
			},
			scripts: [posthog({ id: 'phc_registry' }), metaPixel({ pixelId: '1' })],
		});
		runtime.start();

		const loader = scriptBySrc(REGISTRY_SRC);
		expect({
			crossorigin: loader?.getAttribute('crossorigin'),
			dataApiHost: loader?.getAttribute('data-api-host'),
			integrity: loader?.getAttribute('integrity'),
		}).toEqual({
			crossorigin: 'anonymous',
			dataApiHost: 'https://eu.i.posthog.com',
			integrity: REGISTRY_INTEGRITY,
		});
		expect(scriptBySrc('https://eu-assets.i.posthog.com')).toBeUndefined();
		// The bootstrap queued the init tuple the loader reads.
		expect((window as TestWindow).posthog).toMatchObject({
			_i: [['phc_registry', expect.any(Object), 'posthog']],
		});

		// An integration without an entry loads from the vendor as before.
		const pixel = scriptBySrc('https://connect.facebook.net/');
		expect(pixel?.getAttribute('integrity')).toBeNull();
		expect(typeof (window as TestWindow).fbq).toBe('function');
		runtime.dispose();
	});

	it('loads HubSpot, which creates its own element, from its source with integrity', async () => {
		const hubspot = await freshHubspot();
		const hubspotSource =
			'https://acme.example/scripts/hubspot@0123456789abcdef.js';
		const runtime = createConsentRuntime({
			enabled: false,
			mode: noBackend,
			persistence: false,
			scriptLoader: {
				sources: {
					hubspot: { integrity: REGISTRY_INTEGRITY, src: hubspotSource },
				},
			},
			scripts: [hubspot({ portalId: '53' })],
		});
		runtime.start();

		const loader = document.getElementById('hs-script-loader');
		expect({
			crossorigin: loader?.getAttribute('crossorigin'),
			integrity: loader?.getAttribute('integrity'),
			src: loader?.getAttribute('src'),
		}).toEqual({
			crossorigin: 'anonymous',
			integrity: REGISTRY_INTEGRITY,
			src: hubspotSource,
		});
		expect(scriptBySrc('https://js.hs-scripts.com/')).toBeUndefined();
		runtime.dispose();
	});

	it.each([
		[
			'HubSpot',
			async () => (await freshHubspot())({ portalId: '53' }),
			() => document.getElementById('hs-script-loader'),
		],
		[
			'ActiveCampaign',
			async () =>
				(
					await import('./vendors/email-and-sms/activecampaign')
				).activeCampaignTracking({ accountId: '123456' }),
			() => scriptBySrc('https://acme.example/scripts/'),
		],
	])(
		"runs %s's onError when its source's copy fails its integrity check",
		async (_name, build, loader) => {
			vi.resetModules();
			const onError = vi.fn();
			const script = { ...(await build()), onError };
			const runtime = createConsentRuntime({
				enabled: false,
				mode: noBackend,
				persistence: false,
				scriptLoader: {
					sources: {
						[script.id]: {
							integrity: REGISTRY_INTEGRITY,
							src: 'https://acme.example/scripts/vendor@0123456789abcdef.js',
						},
					},
				},
				scripts: [script],
			});
			runtime.start();
			await vi.waitFor(() =>
				expect(loader()?.getAttribute('src')).toBeTruthy()
			);

			// What the browser fires for an SRI mismatch, a 423 hold or a 410.
			loader()?.dispatchEvent(new Event('error'));

			await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
			expect(onError).toHaveBeenCalledWith(
				expect.objectContaining({ id: script.id })
			);
			runtime.dispose();
			// The vendor cleanup leaves ActiveCampaign's globals behind.
			for (const name of ['pgo', 'prismGlobalObjectAlias']) {
				Reflect.deleteProperty(window, name);
			}
		}
	);

	it('will not reuse a HubSpot loader that skips the integrity its source asks for', async () => {
		const hubspot = await freshHubspot();
		const hubspotSource =
			'https://acme.example/scripts/hubspot@0123456789abcdef.js';
		const existing = document.createElement('script');
		existing.id = 'hs-script-loader';
		existing.src = hubspotSource;
		document.head.appendChild(existing);
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const runtime = createConsentRuntime({
			enabled: false,
			mode: noBackend,
			persistence: false,
			scriptLoader: {
				sources: {
					hubspot: { integrity: REGISTRY_INTEGRITY, src: hubspotSource },
				},
			},
			scripts: [hubspot({ portalId: '53' })],
		});
		runtime.start();

		expect(document.getElementById('hs-script-loader')).toBe(existing);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining('incompatible URL, nonce or integrity')
		);
		runtime.dispose();
		warn.mockRestore();
	});

	it('will not let a second HubSpot configuration change the required integrity', async () => {
		const hubspot = await freshHubspot();
		const hubspotSource =
			'https://acme.example/scripts/hubspot@0123456789abcdef.js';
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const withIntegrity = (integrity: string) =>
			createConsentRuntime({
				enabled: false,
				mode: noBackend,
				persistence: false,
				scriptLoader: {
					sources: { hubspot: { integrity, src: hubspotSource } },
				},
				scripts: [hubspot({ portalId: '53' })],
			});
		const first = withIntegrity(REGISTRY_INTEGRITY);
		first.start();
		const second = withIntegrity('sha384-other');
		second.start();

		expect(
			document.getElementById('hs-script-loader')?.getAttribute('integrity')
		).toBe(REGISTRY_INTEGRITY);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining('explicit nonce or integrity')
		);
		second.dispose();
		first.dispose();
		warn.mockRestore();
	});

	it.each([
		[
			'ActiveCampaign',
			async () =>
				(
					await import('./vendors/email-and-sms/activecampaign')
				).activeCampaignTracking({ accountId: '123456' }),
		],
		[
			'Oracle Eloqua',
			async () =>
				(await import('./vendors/analytics/oracle-eloqua')).eloquaTracking({
					siteId: '1973398186',
				}),
		],
	])(
		'keeps %s, which resets its own loader URL, on its source',
		async (_name, build) => {
			vi.resetModules();
			const script = await build();
			const source = 'https://acme.example/scripts/vendor@0123456789abcdef.js';
			const runtime = createConsentRuntime({
				enabled: false,
				mode: noBackend,
				persistence: false,
				scriptLoader: {
					sources: {
						[script.id]: { integrity: REGISTRY_INTEGRITY, src: source },
					},
				},
				scripts: [script],
			});
			runtime.start();

			await vi.waitFor(() => {
				expect(scriptBySrc(source)?.getAttribute('integrity')).toBe(
					REGISTRY_INTEGRITY
				);
			});
			expect(scriptBySrc(script.src ?? 'missing')).toBeUndefined();
			runtime.dispose();
		}
	);

	it('does not start ActiveCampaign twice when the page already loads its source', async () => {
		vi.resetModules();
		const { activeCampaignTracking } =
			await import('./vendors/email-and-sms/activecampaign');
		const script = activeCampaignTracking({ accountId: '123456' });
		const source = 'https://acme.example/scripts/activecampaign.js';
		// An earlier test's tracker leaves its globals behind.
		for (const name of ['pgo', 'prismGlobalObjectAlias']) {
			Reflect.deleteProperty(window, name);
		}
		const original = document.createElement('script');
		original.src = source;
		document.head.append(original);
		const error = vi
			.spyOn(console, 'error')
			.mockImplementation(() => undefined);
		const runtime = createConsentRuntime({
			enabled: false,
			mode: noBackend,
			persistence: false,
			scriptLoader: { sources: { [script.id]: { src: source } } },
			scripts: [script],
		});
		runtime.start();

		await vi.waitFor(() => {
			expect(error).toHaveBeenCalledWith(
				expect.stringContaining('an unmanaged tracker exists')
			);
		});
		expect(
			[...document.scripts].filter((element) => element.src === source)
		).toEqual([original]);
		runtime.dispose();
		error.mockRestore();
	});

	it('refuses a second ActiveCampaign runtime that asks for another source', async () => {
		vi.resetModules();
		const { activeCampaignTracking } =
			await import('./vendors/email-and-sms/activecampaign');
		for (const name of ['pgo', 'prismGlobalObjectAlias']) {
			Reflect.deleteProperty(window, name);
		}
		const source = 'https://acme.example/scripts/activecampaign.js';
		const error = vi
			.spyOn(console, 'error')
			.mockImplementation(() => undefined);
		const runtimes = [undefined, { src: source }].map((entry) => {
			const script = activeCampaignTracking({ accountId: '123456' });
			const runtime = createConsentRuntime({
				enabled: false,
				mode: noBackend,
				persistence: false,
				scriptLoader: entry ? { sources: { [script.id]: entry } } : {},
				scripts: [script],
			});
			runtime.start();
			return runtime;
		});

		// The first runtime's tracker loads from the vendor's URL.
		const pgo = vi.fn();
		Reflect.set(window, 'pgo', pgo);
		scriptBySrc(
			'https://diffuser-cdn.app-us1.com/diffuser/diffuser.js'
		)?.dispatchEvent(new Event('load'));

		await vi.waitFor(() => {
			expect(error).toHaveBeenCalledWith(
				expect.stringContaining('conflicting registrations')
			);
		});
		expect(pgo).not.toHaveBeenCalled();
		expect(scriptBySrc(source)).toBeUndefined();
		Reflect.deleteProperty(window, 'pgo');
		for (const runtime of runtimes) {
			runtime.dispose();
		}
		error.mockRestore();
	});

	it('accepts the default.com forms SDK loaded from its source', async () => {
		vi.resetModules();
		const { defaultComFormsSdk } =
			await import('./vendors/analytics/default-com');
		const script = defaultComFormsSdk({ publicKey: 'pk_test' });
		const source =
			'https://acme.example/scripts/default-com@0123456789abcdef.js';
		const error = vi
			.spyOn(console, 'error')
			.mockImplementation(() => undefined);
		const runtime = createConsentRuntime({
			enabled: false,
			mode: noBackend,
			persistence: false,
			scriptLoader: { sources: { [script.id]: { src: source } } },
			scripts: [script],
		});
		runtime.start();
		scriptBySrc(source)?.dispatchEvent(new Event('load'));

		expect(scriptBySrc(source)).toBeDefined();
		expect(error).not.toHaveBeenCalled();
		runtime.dispose();
		error.mockRestore();
	});

	it('loads integrations from the sources the registry lists, with integrity and tag attributes', async () => {
		const hubspot = await freshHubspot();
		const hash = (key: string) =>
			`https://acme.inth.app/scripts/${key}@0123456789abcdef.js`;
		const integrity = (key: string) => `sha384-${key}RegistryHash`;
		const entry = (key: string, attributes?: Record<string, string | null>) =>
			attributes
				? { attributes, integrity: integrity(key), src: hash(key) }
				: { integrity: integrity(key), src: hash(key) };
		// The manifest's list: Meta Pixel has no entry, so it loads from the
		// vendor as it did before enrolment.
		const scriptSources = {
			hubspot: entry('hubspot'),
			'plausible-analytics': entry('plausible-analytics', {
				'data-api': 'https://plausible.io/api/event',
			}),
			posthog: entry('posthog'),
			rudderstack: entry('rudderstack', { 'data-rsa-write-key': null }),
		};
		const runtime = createConsentRuntime({
			enabled: false,
			experimentalScriptRegistry: true,
			mode: noBackend,
			persistence: false,
			// The init a server resolved from the manifest.
			prefetch: { initialScriptRegistry: { sources: scriptSources } },
			scripts: [
				posthog({ id: 'phc_registry' }),
				metaPixel({ pixelId: '1' }),
				hubspot({ portalId: '53' }),
				plausibleAnalytics({ domain: 'example.com' }),
				rudderstack({
					dataPlaneUrl: 'https://dataplane.example.com',
					writeKey: 'wk_registry',
				}),
			],
		});
		runtime.start();

		await vi.waitFor(() =>
			expect(document.getElementById('hs-script-loader')).not.toBeNull()
		);
		const tag = (src: string) => {
			const element = scriptBySrc(src);
			return {
				crossorigin: element?.getAttribute('crossorigin'),
				integrity: element?.getAttribute('integrity'),
			};
		};
		const signed = (key: string) => ({
			crossorigin: 'anonymous',
			integrity: integrity(key),
		});
		expect({
			hubspot: tag(hash('hubspot')),
			plausible: tag(hash('plausible-analytics')),
			posthog: tag(hash('posthog')),
			rudderstack: tag(hash('rudderstack')),
		}).toEqual({
			hubspot: signed('hubspot'),
			plausible: signed('plausible-analytics'),
			posthog: signed('posthog'),
			rudderstack: signed('rudderstack'),
		});

		// The integration's own attributes and setup stay.
		expect(scriptBySrc(hash('posthog'))?.getAttribute('data-api-host')).toBe(
			'https://eu.i.posthog.com'
		);
		expect((window as TestWindow).posthog).toMatchObject({
			_i: [['phc_registry', expect.any(Object), 'posthog']],
		});
		// Plausible sends to its vendor, not the gateway, and keeps its domain.
		const plausibleTag = scriptBySrc(hash('plausible-analytics'));
		expect({
			api: plausibleTag?.getAttribute('data-api'),
			domain: plausibleTag?.getAttribute('data-domain'),
		}).toEqual({
			api: 'https://plausible.io/api/event',
			domain: 'example.com',
		});
		// RudderStack finds its plugins on its CDN, not next to the tag.
		const rudderTag = scriptBySrc(hash('rudderstack'));
		expect({
			loader: rudderTag?.getAttribute('data-loader'),
			writeKey: rudderTag?.hasAttribute('data-rsa-write-key'),
		}).toEqual({ loader: 'RS_JS_SDK', writeKey: false });

		// No entry: the vendor's own URL.
		expect(scriptBySrc('https://connect.facebook.net/')).toBeDefined();
		expect(typeof (window as TestWindow).fbq).toBe('function');
		for (const vendor of [
			'https://js.hs-scripts.com/',
			'https://plausible.io/js/',
			'https://cdn.rudderlabs.com/',
			'https://eu-assets.i.posthog.com/',
		]) {
			expect(scriptBySrc(vendor)).toBeUndefined();
		}
		expect(
			[...document.querySelectorAll('script')].filter((script) =>
				script.getAttribute('src')?.includes('?src=')
			)
		).toEqual([]);
		runtime.dispose();
	});

	it('keeps a page that pins Plausible to its own proxy on that proxy', async () => {
		const runtime = createConsentRuntime({
			enabled: false,
			experimentalScriptRegistry: true,
			mode: noBackend,
			persistence: false,
			prefetch: {
				initialScriptRegistry: {
					sources: {
						'plausible-analytics': {
							attributes: { 'data-api': 'https://plausible.io/api/event' },
							integrity: 'sha384-plausibleRegistryHash',
							src: 'https://acme.inth.app/scripts/plausible-analytics@0123456789abcdef.js',
						},
					},
				},
			},
			scripts: [
				plausibleAnalytics({
					domain: 'example.com',
					endpoint: 'https://example.com/proxy/api/event',
				}),
			],
		});
		runtime.start();

		await vi.waitFor(() =>
			expect(scriptBySrc('https://acme.inth.app/scripts/')).toBeDefined()
		);
		expect(
			scriptBySrc('https://acme.inth.app/scripts/')?.getAttribute('data-api')
		).toBe('https://example.com/proxy/api/event');
		runtime.dispose();
	});
});
