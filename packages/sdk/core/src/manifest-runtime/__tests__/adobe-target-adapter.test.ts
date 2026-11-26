/**
 * @vitest-environment jsdom
 *
 * The Adobe Target adapter as a manifest from the Inth server names it.
 */
import { afterEach, describe, expect, it } from 'vite-plus/test';

import type { ScriptCallbackInfo } from '../../libs/script-loader/types';
import { importAdapter } from '../adapters/index';
import * as runtime from '../index';

const options = (overrides: Record<string, unknown> = {}) => ({
	datastreamId: 'datastream-id',
	orgId: 'ORG@AdobeOrg',
	...overrides,
});

const manifest = (adapterOptions: unknown = options()) => ({
	adapter: { id: 'adobe-target', options: adapterOptions },
	afterLoadSteps: [],
	bootstrapSteps: [],
	category: 'experience',
	globals: [],
	kind: 'inth.vendor-manifest',
	loadScript: {
		async: true,
		src: 'https://cdn1.adoberesources.net/alloy/2.30.0/alloy.min.js',
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
	vendor: 'adobe-target',
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

afterEach(() => {
	Reflect.deleteProperty(window, 'alloy');
	Reflect.deleteProperty(window, '__alloyNS');
});

describe('the Adobe Target adapter', () => {
	it.each([
		[
			options({ edgeDomain: 'evil.example' }),
			'it has the unknown option edgeDomain',
		],
		[
			options({ datastreamId: 'a/b' }),
			'its datastreamId is not a datastream ID',
		],
		[options({ orgId: 'ORG' }), 'its orgId is not an Adobe organization ID'],
		[options({ orgId: 7 }), 'its orgId is not an Adobe organization ID'],
	])('refuses %j', async (value, reason) => {
		const sdk = await adapted();

		expect(sdk.parseResolvedManifest(manifest(value))).toEqual({
			ok: false,
			reason: `its adobe-target adapter options are wrong: ${reason}`,
		});
	});

	it("installs Alloy's queue stub only once Target is allowed", async () => {
		const sdk = await adapted();
		const parsed = sdk.parseResolvedManifest(manifest());
		if (!parsed.ok) {
			throw new Error(parsed.reason);
		}
		const script = sdk.resolvedManifestToScript(parsed.manifest);
		const info = (hasConsent: boolean) =>
			({ hasConsent, id: 'adobe-target' }) as unknown as ScriptCallbackInfo;

		expect(script.serverStart).toBeUndefined();
		script.onBeforeLoad?.(info(false));
		expect('alloy' in window).toBe(false);
		script.onBeforeLoad?.(info(true));
		expect(typeof (window as { alloy?: unknown }).alloy).toBe('function');
		expect((window as { __alloyNS?: string[] }).__alloyNS).toEqual(['alloy']);
	});
});
