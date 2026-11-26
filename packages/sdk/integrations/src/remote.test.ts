/* oxlint-disable unicorn/no-thenable -- `if` and `callGlobal` steps have a `then` field. */
// @vitest-environment node
// The Inth server resolves remote integrations without a DOM.
import type { Script } from '@inth/sdk/engine';
import {
	isDeclarableGlobal,
	MANIFEST_RUNTIME_LEVEL,
	manifestRoots,
	parseResolvedManifest,
} from '@inth/sdk/manifest-runtime';
import { describe, expect, it } from 'vite-plus/test';

import { grantedServerStart } from './__tests__/helpers';
import { resolvedManifestToScript } from './engine/runtime';
import type { BuiltInScriptIntegrationKey } from './registry';
import {
	manifestLevel,
	remoteIntegrations,
	validateRemoteOptions,
} from './remote';
import type {
	RemoteIntegration,
	RemoteOptionSpec,
	RemoteOptionValue,
} from './remote';
import { vendorModules } from './remote-catalogue';

type Options = Record<string, RemoteOptionValue>;

/** npm helpers not named after their registry key. */
const helperNames: Partial<Record<BuiltInScriptIntegrationKey, string>> = {
	'microsoft-clarity': 'clarity',
};

/**
 * The npm helper exported beside a remote definition. The test calls it with
 * the same options, so a helper that stops matching its resolver fails.
 */
const npmHelper = function npmHelper(
	key: string
): (options: Options) => Script {
	const typedKey = key as BuiltInScriptIntegrationKey;
	const module: Record<string, unknown> = vendorModules[typedKey];
	const name = helperNames[typedKey] ?? key;
	const helper = module[name];
	if (typeof helper !== 'function') {
		throw new TypeError(`${key} has no npm helper named ${name}`);
	}
	return helper as (options: Options) => Script;
};

/**
 * Options the remote form defaults that a site passes to the npm helper to
 * get the same script: the helper's type requires them, or its own default
 * differs. The npm call takes the remote default for these; every other
 * option is passed as the sample has it.
 */
const npmRequired: Partial<Record<BuiltInScriptIntegrationKey, string[]>> = {
	gtag: ['category'],
	// The helper defaults to consent mode, which the server does not send.
	pardotTracking: ['mode'],
};

/**
 * Callbacks an npm helper wraps around its manifest's own to share one
 * script between registrations with equal options. The Inth server sends one
 * registration per vendor, so the remote script has nothing to share.
 */
const sharedRegistrationCallbacks: Partial<
	Record<BuiltInScriptIntegrationKey, string[]>
> = {
	attentiveTag: ['onBeforeLoad', 'onConsentChange', 'onDispose', 'onLoad'],
};

/** `options` as a site would pass them to the npm helper. */
const npmInput = function npmInput(key: string, options: Options): Options {
	const integration = remoteIntegrations[key] as RemoteIntegration;
	const required = npmRequired[key as BuiltInScriptIntegrationKey] ?? [];
	const input = { ...options };
	for (const name of required) {
		const spec = integration.options[name];
		if (input[name] === undefined && spec && 'default' in spec) {
			input[name] = spec.default;
		}
	}
	return input;
};

/** Hosts each integration may load its script from. */
const vendorHosts: Record<string, readonly string[]> = {
	adobeAnalytics: ['assets.adobedtm.com'],
	adrollPixel: ['s.adroll.com'],
	ahrefsAnalytics: ['analytics.ahrefs.com'],
	amplitude: ['cdn.amplitude.com'],
	appcues: ['fast.appcues.com', 'fast.eu.appcues.com'],
	attentiveTag: ['cdn.attn.tv'],
	clay: ['static.claydar.com'],
	clearbit: ['tag.clearbitscripts.com'],
	cloudflareWebAnalytics: ['static.cloudflareinsights.com'],
	crisp: ['client.crisp.chat'],
	fathomAnalytics: ['cdn.usefathom.com'],
	frontChat: ['chat-assets.frontapp.com'],
	googleTagManager: ['www.googletagmanager.com'],
	gtag: ['www.googletagmanager.com'],
	heap: ['cdn.us.heap-api.com'],
	hightouch: ['cdn.hightouch-events.com'],
	hotjar: ['static.hotjar.com'],
	insiderTag: ['acmestore.api.useinsider.com'],
	intercom: ['widget.intercom.io'],
	klaviyo: ['static.klaviyo.com'],
	linkedinInsights: ['snap.licdn.com'],
	liveIntentTag: ['b-code.liadm.com'],
	logRocket: ['cdn.logrocket.io'],
	marketoMunchkin: ['munchkin.marketo.net'],
	matomoAnalytics: ['cdn.matomo.cloud'],
	metaPixel: ['connect.facebook.net'],
	'microsoft-clarity': ['www.clarity.ms'],
	microsoftUet: ['bat.bing.com'],
	mixpanelAnalytics: ['cdn.mxpnl.com'],
	oneDollarStats: ['assets.onedollarstats.com'],
	openaiPixel: ['bzrcdn.openai.com'],
	optimizelyWeb: ['cdn.optimizely.com'],
	pardotTracking: ['pi.pardot.com'],
	pinterestTag: ['s.pinimg.com'],
	plausibleAnalytics: ['plausible.io'],
	posthog: ['eu-assets.i.posthog.com', 'us-assets.i.posthog.com'],
	promptwatch: ['ingest.promptwatch.com'],
	rb2b: ['ddwl4m2hdecbv.cloudfront.net'],
	redditPixel: ['www.redditstatic.com'],
	rudderstack: ['cdn.rudderlabs.com'],
	rybbitAnalytics: ['app.rybbit.io'],
	segment: ['cdn.segment.com'],
	snapchatPixel: ['sc-static.net'],
	statableAnalytics: ['statable.com'],
	theTradeDeskPixel: ['js.adsrvr.org'],
	tiktokPixel: ['analytics.tiktok.com'],
	umamiAnalytics: ['cloud.umami.is'],
	vector: ['cdn.vector.co'],
	vercelAnalytics: ['va.vercel-scripts.com'],
	wisepops: ['wisepops.net'],
	xPixel: ['static.ads-twitter.com'],
};

/**
 * The manifest runtime level of each integration above level 2: the lowest
 * level that runs the features its manifest uses. Every other integration
 * is level 2, since each manifest carries `globals`, which is level 2.
 */
const vendorLevels: Partial<Record<BuiltInScriptIntegrationKey, number>> = {};

/**
 * Values that cover an option: each enum value, both booleans, the example
 * ID or number, and an object with every field set.
 */
const sampleValues = function sampleValues(
	spec: Exclude<RemoteOptionSpec, { kind: 'object' }>
): RemoteOptionValue[] {
	switch (spec.kind) {
		case 'id':
		case 'hostname':
		case 'number': {
			return [spec.example];
		}
		case 'enum': {
			return [...spec.values];
		}
		case 'boolean': {
			return [true, false];
		}
		case 'idList': {
			return [[spec.example]];
		}
		case 'map': {
			return spec.values.map((value) => ({ [spec.keyExample]: value }));
		}
		default: {
			throw new Error('unknown option kind');
		}
	}
};

/**
 * Every combination of each option's sample values. An object option's
 * samples are the combinations of its fields.
 */
const sampleObjects = function sampleObjects(
	specs: Readonly<Record<string, RemoteOptionSpec>>
): Options[] {
	let samples: Options[] = [{}];
	for (const [name, spec] of Object.entries(specs)) {
		const values =
			spec.kind === 'object' ? sampleObjects(spec.fields) : sampleValues(spec);
		samples = samples.flatMap((sample) =>
			values.map((value) => ({ ...sample, [name]: value }))
		);
	}
	return samples;
};

/** Options with only the required values set. */
const requiredOnly = function requiredOnly(
	specs: Readonly<Record<string, RemoteOptionSpec>>
): Options {
	return Object.fromEntries(
		Object.entries(specs).flatMap(([name, spec]) => {
			const value = sampleObjects({ [name]: spec })[0]?.[name];
			return 'required' in spec && spec.required && value !== undefined
				? [[name, value]]
				: [];
		})
	);
};

const sampleOptions = function sampleOptions(
	integration: RemoteIntegration
): Options[] {
	return [
		...sampleObjects(integration.options),
		requiredOnly(integration.options),
	];
};

/** `options` with each missing enum and boolean set to its default. */
const withDefaults = function withDefaults(
	integration: RemoteIntegration,
	options: Options
): Options {
	const defaults = Object.fromEntries(
		Object.entries(integration.options).flatMap(([name, spec]) =>
			spec.kind === 'enum' || spec.kind === 'boolean'
				? [[name, spec.default]]
				: []
		)
	);
	return { ...defaults, ...options };
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

/**
 * The script a browser builds for `options` saved for `key`: the server
 * validates them (filling remote defaults) and resolves the manifest, the
 * manifest crosses the wire as JSON, and the SDK parses it.
 */
const remoteScript = function remoteScript(
	key: string,
	options: Options
): Script {
	const validated = validateRemoteOptions(key, options);
	if (!validated.ok) {
		throw new Error(validated.issues.join('; '));
	}
	const wire: unknown = JSON.parse(
		JSON.stringify(remoteIntegrations[key]?.resolveRemote(validated.options))
	);
	const parsed = parseResolvedManifest(wire);
	if (!parsed.ok) {
		throw new Error(`${key}: ${parsed.reason}`);
	}
	return resolvedManifestToScript(parsed.manifest);
};

describe('remoteIntegrations', () => {
	it('lists each integration under its registry key', () => {
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
		// The SDK runs what it receives only once it passes its own check.
		expect(parseResolvedManifest(JSON.parse(JSON.stringify(manifest)))).toEqual(
			{
				manifest: expect.anything(),
				ok: true,
			}
		);
	});

	it.each(cases)(
		'%s %s carries requires only above level 1',
		(key, _label, options) => {
			const manifest = remoteIntegrations[key]?.resolveRemote(
				options
			) as NonNullable<ReturnType<RemoteIntegration['resolveRemote']>>;
			const level = manifestLevel(manifest);

			expect(level).toBeGreaterThanOrEqual(1);
			expect(level).toBeLessThanOrEqual(MANIFEST_RUNTIME_LEVEL);
			// A level 1 manifest must parse in an SDK from before levels.
			expect(Object.hasOwn(manifest, 'requires')).toBe(level > 1);
			expect(manifest.requires).toBe(level > 1 ? level : undefined);
		}
	);

	it.each(cases)('%s %s needs its listed level', (key, _label, options) => {
		const manifest = remoteIntegrations[key]?.resolveRemote(
			options
		) as NonNullable<ReturnType<RemoteIntegration['resolveRemote']>>;

		expect(manifestLevel(manifest)).toBe(
			vendorLevels[key as BuiltInScriptIntegrationKey] ?? 2
		);
	});

	it('reads a manifest stamped for a later level as that level', () => {
		const manifest = remoteIntegrations.metaPixel?.resolveRemote({
			pixelId: '123',
		});

		expect(manifestLevel({ ...manifest, requires: 3 } as never)).toBe(3);
		// `globals` is level 2, so a manifest that carries it never reads lower.
		expect(manifestLevel({ ...manifest, requires: 1 } as never)).toBe(2);
	});

	it.each(cases)(
		'%s %s declares every root it uses and no platform global',
		(key, _label, options) => {
			const manifest = remoteIntegrations[key]?.resolveRemote(
				options
			) as NonNullable<ReturnType<RemoteIntegration['resolveRemote']>>;

			expect(manifest.requires).toBe(2);
			expect(manifest.globals).toEqual(manifestRoots(manifest));
			expect(
				manifest.globals.filter((name) => !isDeclarableGlobal(name))
			).toEqual([]);
		}
	);

	it('reads a manifest that uses a level 2 feature as level 2', () => {
		const manifest = remoteIntegrations.metaPixel?.resolveRemote({
			pixelId: '123',
		}) as NonNullable<ReturnType<RemoteIntegration['resolveRemote']>>;

		expect(manifestLevel({ ...manifest, target: 'body' })).toBe(2);
		expect(
			manifestLevel({
				...manifest,
				onDisposeSteps: [{ id: 'addon', type: 'removeScript' }],
			})
		).toBe(2);
		expect(manifestLevel({ ...manifest, requires: 3, target: 'body' })).toBe(3);
	});

	it('reads a manifest that uses a level 3 feature, nested or not, as level 3', () => {
		const manifest = remoteIntegrations.metaPixel?.resolveRemote({
			pixelId: '123',
		}) as NonNullable<ReturnType<RemoteIntegration['resolveRemote']>>;

		expect(
			manifestLevel({
				...manifest,
				onLoadGrantedSteps: [
					{ then: [], type: 'if', when: { documentReady: true } },
				],
			})
		).toBe(3);
		expect(
			manifestLevel({
				...manifest,
				onLoadGrantedSteps: [
					{
						global: 'fbq',
						then: [{ name: 'ready', type: 'setFlag', value: true }],
						type: 'callGlobal',
					},
				],
			})
		).toBe(3);
	});

	it.each(cases)(
		'%s %s builds the same script as the npm helper',
		(key, _label, options) => {
			// A site passes the options as they are; it gets no remote default.
			const fromNpm = npmHelper(key)(npmInput(key, options));
			const fromRemote = remoteScript(key, options);

			expect(withoutFunctions(fromRemote)).toEqual(withoutFunctions(fromNpm));
			const shared =
				sharedRegistrationCallbacks[key as BuiltInScriptIntegrationKey] ?? [];
			const own = (script: Script) =>
				functionNames(script).filter((name) => !shared.includes(name));
			expect(own(fromRemote)).toEqual(own(fromNpm));
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
			const integration = remoteIntegrations[key] as RemoteIntegration;

			expect(validateRemoteOptions(key, options), key).toEqual({
				ok: true,
				options: withDefaults(integration, options),
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

	it('rejects a missing required value', () => {
		for (const integration of Object.values(remoteIntegrations)) {
			const [sample] = sampleOptions(integration);
			for (const [name, spec] of Object.entries(integration.options)) {
				if (!('required' in spec) || !spec.required) {
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
				const { example } = spec;
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

	it('rejects an ID that is not a string', () => {
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
