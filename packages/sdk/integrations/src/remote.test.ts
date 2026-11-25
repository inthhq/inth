// @vitest-environment node
// The Inth server resolves remote integrations without a DOM.
import type { Script } from '@inth/sdk/engine';
import { describe, expect, it } from 'vite-plus/test';

import { grantedServerStart } from './__tests__/helpers';
import { resolvedManifestToScript } from './engine/runtime';
import { remoteIntegrations, validateRemoteOptions } from './remote';
import type { RemoteIntegration } from './remote';
import { linkedinInsights } from './vendors/ads-and-pixels/linkedin-insights';
import { metaPixel } from './vendors/ads-and-pixels/meta-pixel';
import { tiktokPixel } from './vendors/ads-and-pixels/tiktok-pixel';
import { gtag } from './vendors/analytics/google-tag';
import { clarity } from './vendors/analytics/microsoft-clarity';
import { posthog } from './vendors/analytics/posthog';
import { googleTagManager } from './vendors/tag-managers/google-tag-manager';

type Options = Record<string, string>;

/**
 * The npm helper for each remote integration, called with the same option
 * names. Kept here, apart from the remote module, so a helper that stops
 * matching its remote resolver fails this test.
 */
const npmHelpers: Record<string, (options: Options) => Script> = {
	googleTagManager: (options) =>
		googleTagManager(options as Parameters<typeof googleTagManager>[0]),
	gtag: (options) => gtag(options as unknown as Parameters<typeof gtag>[0]),
	linkedinInsights: (options) =>
		linkedinInsights(options as Parameters<typeof linkedinInsights>[0]),
	metaPixel: (options) => metaPixel(options as Parameters<typeof metaPixel>[0]),
	'microsoft-clarity': (options) =>
		clarity(options as Parameters<typeof clarity>[0]),
	posthog: (options) => posthog(options as Parameters<typeof posthog>[0]),
	tiktokPixel: (options) =>
		tiktokPixel(options as Parameters<typeof tiktokPixel>[0]),
};

/** Hosts each integration may load its script from. */
const vendorHosts: Record<string, readonly string[]> = {
	googleTagManager: ['www.googletagmanager.com'],
	gtag: ['www.googletagmanager.com'],
	linkedinInsights: ['snap.licdn.com'],
	metaPixel: ['connect.facebook.net'],
	'microsoft-clarity': ['www.clarity.ms'],
	posthog: ['eu-assets.i.posthog.com', 'us-assets.i.posthog.com'],
	tiktokPixel: ['analytics.tiktok.com'],
};

const exampleId = function exampleId(
	integration: RemoteIntegration,
	name: string
): string {
	const spec = integration.options[name];
	if (spec?.kind !== 'id' || spec.example === undefined) {
		throw new Error(`${integration.key}.${name} has no example`);
	}
	return spec.example;
};

/** Every combination of enum values, with each ID set to its example. */
const sampleOptions = function sampleOptions(
	integration: RemoteIntegration
): Options[] {
	let samples: Options[] = [{}];
	for (const [name, spec] of Object.entries(integration.options)) {
		if (spec.kind === 'id') {
			samples = samples.map((sample) => ({
				...sample,
				[name]: exampleId(integration, name),
			}));
		} else {
			samples = samples.flatMap((sample) =>
				spec.values.map((value) => ({ ...sample, [name]: value }))
			);
		}
	}
	return samples;
};

const cases = Object.values(remoteIntegrations).flatMap((integration) =>
	sampleOptions(integration).map(
		(options) => [integration.key, JSON.stringify(options), options] as const
	)
);

const withoutFunctions = function withoutFunctions(
	script: Script
): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(script).filter(([, value]) => typeof value !== 'function')
	);
};

const functionNames = function functionNames(script: Script): string[] {
	return Object.entries(script)
		.filter(([, value]) => typeof value === 'function')
		.map(([name]) => name)
		.sort();
};

describe('remoteIntegrations', () => {
	it('lists the allowlisted integrations under their registry keys', () => {
		expect(Object.keys(remoteIntegrations).sort()).toEqual(
			Object.keys(npmHelpers).sort()
		);
		for (const [key, integration] of Object.entries(remoteIntegrations)) {
			expect(integration.key).toBe(key);
		}
	});

	it('describes its options with serializable data', () => {
		for (const integration of Object.values(remoteIntegrations)) {
			const { resolveRemote: _resolve, ...data } = integration;
			expect(JSON.parse(JSON.stringify(data))).toEqual(data);
		}
	});

	it.each(cases)('%s %s survives a JSON round trip', (key, _label, options) => {
		const manifest = remoteIntegrations[key]?.resolveRemote(options);

		expect(JSON.parse(JSON.stringify(manifest))).toEqual(manifest);
		expect(manifest?.vendor).toBe(remoteIntegrations[key]?.vendor);
	});

	it.each(cases)(
		'%s %s builds the same script as the npm helper',
		(key, _label, options) => {
			const helper = npmHelpers[key] as (options: Options) => Script;
			const fromNpm = helper(options);
			const fromRemote = resolvedManifestToScript(
				remoteIntegrations[key]?.resolveRemote(options) as never
			);

			expect(withoutFunctions(fromRemote)).toEqual(withoutFunctions(fromNpm));
			expect(functionNames(fromRemote)).toEqual(functionNames(fromNpm));
			// The inline start a server render writes covers every step the
			// script runs before its file loads.
			expect(grantedServerStart(fromRemote)).toEqual(
				grantedServerStart(fromNpm)
			);
		}
	);

	it.each(cases)(
		'%s %s loads over https from its vendor',
		(key, _label, options) => {
			const manifest = remoteIntegrations[key]?.resolveRemote(options);
			const src = manifest?.loadScript?.src;

			expect(src).toBeDefined();
			const url = new URL(src as string);
			expect(url.protocol).toBe('https:');
			expect(vendorHosts[key]).toContain(url.host);
		}
	);

	it('returns a fresh manifest each time', () => {
		const integration = remoteIntegrations.googleTagManager;
		const options = { id: 'GTM-ABC123' };
		const first = integration?.resolveRemote(options);
		const second = integration?.resolveRemote(options);

		expect(second).toEqual(first);
		expect(second).not.toBe(first);
	});

	it('refuses options that did not pass validation', () => {
		const integration = remoteIntegrations.googleTagManager;

		expect(() =>
			integration?.resolveRemote({ id: 'https://evil.example/gtm.js' })
		).toThrow(/googleTagManager/u);
	});
});

describe('validateRemoteOptions', () => {
	it('fills enum defaults', () => {
		expect(validateRemoteOptions('posthog', { id: 'phc_abc123' })).toEqual({
			ok: true,
			options: { id: 'phc_abc123', loadMode: 'always', region: 'eu' },
		});
	});

	it('accepts every sample option set', () => {
		for (const [key, , options] of cases) {
			expect(validateRemoteOptions(key, options), key).toEqual({
				ok: true,
				options,
			});
		}
	});

	it('rejects an unknown integration', () => {
		expect(validateRemoteOptions('hubspot', { id: '123' })).toEqual({
			issues: [expect.stringContaining('hubspot')],
			ok: false,
		});
	});

	it.each([null, 'GTM-ABC', ['GTM-ABC'], 42])(
		'rejects %j as the options object',
		(input) => {
			expect(validateRemoteOptions('googleTagManager', input).ok).toBe(false);
		}
	);

	it.each([
		'config',
		'script',
		'scriptSrc',
		'scriptUrl',
		'apiHost',
		'initOptions',
		'consentMapping',
		'dataLayer',
		'__proto__',
	])('rejects the unknown option %s', (name) => {
		for (const integration of Object.values(remoteIntegrations)) {
			const [sample] = sampleOptions(integration);
			const input = JSON.parse(
				JSON.stringify({ ...sample, [name]: 'value' })
			) as unknown;

			expect(
				validateRemoteOptions(integration.key, input),
				integration.key
			).toEqual({
				issues: [expect.stringContaining(name)],
				ok: false,
			});
		}
	});

	it('rejects a missing required ID', () => {
		for (const integration of Object.values(remoteIntegrations)) {
			const [sample] = sampleOptions(integration);
			for (const [name, spec] of Object.entries(integration.options)) {
				if (spec.kind !== 'id' || !spec.required) {
					continue;
				}
				const { [name]: _removed, ...rest } = sample as Options;

				expect(validateRemoteOptions(integration.key, rest)).toEqual({
					issues: [expect.stringContaining(name)],
					ok: false,
				});
			}
		}
	});

	it.each([
		['googleTagManager', { id: 'UA-12345' }],
		['googleTagManager', { id: 'gtm-abc' }],
		['googleTagManager', { id: ' GTM-ABC' }],
		['gtag', { category: 'measurement', id: 'GTM-ABC' }],
		['metaPixel', { pixelId: '12345abc' }],
		['posthog', { id: 'phx_abc' }],
		['microsoft-clarity', { id: 'ABC DEF' }],
		['tiktokPixel', { pixelId: 'abc-123' }],
		['linkedinInsights', { id: '12a' }],
	])('rejects a pattern mismatch for %s %j', (key, options) => {
		expect(validateRemoteOptions(key, options).ok).toBe(false);
	});

	it('rejects ID values that could change the script URL', () => {
		for (const integration of Object.values(remoteIntegrations)) {
			for (const [name, spec] of Object.entries(integration.options)) {
				if (spec.kind !== 'id') {
					continue;
				}
				const [sample] = sampleOptions(integration);
				const example = exampleId(integration, name);
				for (const suffix of ['/', '.', '&', '#', '?', ':', '%2F', '\n']) {
					expect(
						validateRemoteOptions(integration.key, {
							...sample,
							[name]: `${example}${suffix}`,
						}).ok,
						`${integration.key}.${name} + ${JSON.stringify(suffix)}`
					).toBe(false);
				}
			}
		}
	});

	it.each([
		'https://evil.example/gtm.js',
		'//evil.example/gtm.js',
		// oxlint-disable-next-line no-script-url -- A value the validator must refuse.
		'javascript:alert(1)',
		'data:text/javascript,alert(1)',
	])('rejects the URL-shaped value %s', (value) => {
		for (const integration of Object.values(remoteIntegrations)) {
			const [sample] = sampleOptions(integration);
			for (const name of Object.keys(integration.options)) {
				const result = validateRemoteOptions(integration.key, {
					...sample,
					[name]: value,
				});

				expect(result.ok, `${integration.key}.${name}`).toBe(false);
				expect(
					result.ok ? [] : result.issues,
					`${integration.key}.${name}`
				).toEqual([expect.stringContaining(name)]);
			}
		}
	});

	it.each([
		['googleTagManager', { id: 'GTM-ABC', loadMode: 'never' }],
		['gtag', { category: 'necessary-ish', id: 'G-ABC' }],
		['posthog', { id: 'phc_abc', region: 'eu-central' }],
		['posthog', { id: 'phc_abc', loadMode: 'disabled' }],
	])('rejects an unknown enum value for %s %j', (key, options) => {
		const result = validateRemoteOptions(key, options);

		expect(result.ok).toBe(false);
	});

	it('rejects values that are not strings', () => {
		expect(validateRemoteOptions('metaPixel', { pixelId: 123_456 }).ok).toBe(
			false
		);
		expect(
			validateRemoteOptions('googleTagManager', {
				id: 'GTM-ABC',
				loadMode: ['always'],
			}).ok
		).toBe(false);
	});

	it('reports every problem at once', () => {
		const result = validateRemoteOptions('googleTagManager', {
			extra: '1',
			loadMode: 'sometimes',
		});

		expect(result.ok ? [] : result.issues).toHaveLength(3);
	});
});
