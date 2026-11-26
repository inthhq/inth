/**
 * @vitest-environment jsdom
 *
 * The Amazon Ads adapter as a manifest from the Inth server names it.
 */
import { afterEach, describe, expect, it } from 'vite-plus/test';

import type { ScriptCallbackInfo } from '../../libs/script-loader/types';
import { amazonAdsAdapter } from '../adapters/amazon-ads';
import { importAdapter } from '../adapters/index';
import * as runtime from '../index';

const options = (overrides: Record<string, unknown> = {}) => ({
	region: 'EU',
	tagId: '00000000-0000-0000-0000-000000000000',
	trackPageView: true,
	...overrides,
});

const manifest = (adapterOptions: unknown = options()) => ({
	adapter: { id: 'amazon-ads', options: adapterOptions },
	afterLoadSteps: [],
	bootstrapSteps: [],
	category: 'marketing',
	globals: [],
	kind: 'inth.vendor-manifest',
	loadScript: {
		async: true,
		src: 'https://c.amazon-adsystem.com/aat/amzn.js',
		type: 'loadScript',
	},
	observeConsentBeforeLoad: true,
	onBeforeLoadDeniedSteps: [],
	onBeforeLoadGrantedSteps: [],
	onConsentChangeSteps: [],
	onConsentDeniedSteps: [],
	onConsentGrantedSteps: [],
	onLoadDeniedSteps: [],
	onLoadGrantedSteps: [],
	persistAfterConsentRevoked: true,
	requires: 4,
	schemaVersion: 1,
	setupSteps: [],
	vendor: 'amazon-ads',
});

const adapted = async () => {
	const sdk = runtime.withAdapters(
		{
			parseResolvedManifest: runtime.parseResolvedManifest,
			resolvedManifestToScript: runtime.resolvedManifestToScript,
		},
		importAdapter
	);
	await sdk.prepare?.([manifest()]);
	return sdk;
};

const info = (hasConsent: boolean): ScriptCallbackInfo =>
	({
		consents: { marketing: hasConsent },
		elementId: 'inth-amazon',
		hasConsent,
		id: 'amazon-ads',
	}) as unknown as ScriptCallbackInfo;

afterEach(() => {
	Reflect.deleteProperty(window, 'amzn');
});

describe('the Amazon Ads adapter', () => {
	it('runs at level 4', () => {
		expect(runtime.manifestFeatureLevel(manifest() as never)).toBe(4);
	});

	it('accepts the options a dashboard sets', () => {
		expect(amazonAdsAdapter.problem(options())).toBeUndefined();
		expect(
			amazonAdsAdapter.problem(options({ region: 'NA', trackPageView: false }))
		).toBeUndefined();
	});

	it.each([
		[options({ countryCode: 'DE' }), 'it has the unknown option countryCode'],
		[
			options({ scriptUrl: 'https://evil.example/amzn.js' }),
			'it has the unknown option scriptUrl',
		],
		[options({ tagId: 'tag/../x' }), 'its tagId is not a tag ID'],
		[options({ tagId: 42 }), 'its tagId is not a tag ID'],
		[options({ region: 'US' }), 'its region is not NA or EU'],
		[options({ trackPageView: 'yes' }), 'its trackPageView is not a boolean'],
	])('refuses %j', async (value, reason) => {
		const sdk = await adapted();

		expect(sdk.parseResolvedManifest(manifest(value))).toEqual({
			ok: false,
			reason: `its amazon-ads adapter options are wrong: ${reason}`,
		});
	});

	it('queues the tag on a grant and drops it on a revoke before amzn.js runs', async () => {
		const sdk = await adapted();
		const parsed = sdk.parseResolvedManifest(manifest());
		if (!parsed.ok) {
			throw new Error(parsed.reason);
		}
		const script = sdk.resolvedManifestToScript(parsed.manifest);
		const queued = () =>
			((window as { amzn?: { q?: [IArguments, number][] } }).amzn?.q ?? []).map(
				([args]) => Array.from(args)
			);

		expect(script.serverStart).toBeUndefined();
		script.onBeforeLoad?.(info(true));
		expect(queued()).toEqual([
			['setRegion', 'EU'],
			['addTag', '00000000-0000-0000-0000-000000000000'],
			['trackEvent', 'PageView', {}],
		]);

		script.onConsentChange?.(info(false));
		expect(queued()).toEqual([]);
	});
});
