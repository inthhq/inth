/**
 * @vitest-environment jsdom
 *
 * The Cloudflare Zaraz adapter as a manifest from the Inth server names it.
 */
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import type { ScriptCallbackInfo } from '../../libs/script-loader/types';
import { importAdapter } from '../adapters/index';
import * as runtime from '../index';

const options = (overrides: Record<string, unknown> = {}) => ({
	hideBuiltInModal: true,
	purposes: { marketing: ['ads'] },
	sendQueuedEvents: true,
	...overrides,
});

const manifest = (adapterOptions: unknown = options()) => ({
	adapter: { id: 'cloudflare-zaraz', options: adapterOptions },
	afterLoadSteps: [],
	alwaysLoad: true,
	bootstrapSteps: [],
	category: 'necessary',
	globals: [],
	kind: 'inth.vendor-manifest',
	onBeforeLoadDeniedSteps: [],
	onBeforeLoadGrantedSteps: [],
	onConsentChangeSteps: [],
	onConsentDeniedSteps: [],
	onConsentGrantedSteps: [],
	onLoadDeniedSteps: [],
	onLoadGrantedSteps: [],
	requires: 4,
	schemaVersion: 1,
	setupSteps: [],
	vendor: 'cloudflare-zaraz',
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
	vi.unstubAllGlobals();
});

describe('the Cloudflare Zaraz adapter', () => {
	it.each([
		[options({ onReady: true }), 'it has the unknown option onReady'],
		[
			options({ hideBuiltInModal: 'yes' }),
			'its hideBuiltInModal or sendQueuedEvents is not a boolean',
		],
		[
			options({ purposes: { advertising: ['ads'] } }),
			'its purposes is not a list of purpose IDs per category',
		],
		[
			options({ purposes: { marketing: 'ads' } }),
			'its purposes is not a list of purpose IDs per category',
		],
		[
			options({ purposes: {} }),
			'Map at least one Zaraz purpose to an Inth category.',
		],
		[
			options({ purposes: { marketing: ['ads'], measurement: ['ads'] } }),
			"Zaraz purpose 'ads' is mapped more than once.",
		],
	])('refuses %j', async (value, reason) => {
		const sdk = await adapted();

		expect(sdk.parseResolvedManifest(manifest(value))).toEqual({
			ok: false,
			reason: `its cloudflare-zaraz adapter options are wrong: ${reason}`,
		});
	});

	it('loads nothing and denies the purposes it does not map', async () => {
		const sdk = await adapted();
		const parsed = sdk.parseResolvedManifest(manifest());
		if (!parsed.ok) {
			throw new Error(parsed.reason);
		}
		const script = sdk.resolvedManifestToScript(parsed.manifest);
		let permissions: Record<string, boolean> = { ads: false, other: true };
		const sendQueuedEvents = vi.fn();
		vi.stubGlobal('zaraz', {
			consent: {
				APIReady: true,
				getAll: () => ({ ...permissions }),
				sendQueuedEvents,
				set: (next: Record<string, boolean>) => {
					permissions = { ...permissions, ...next };
				},
			},
		});

		expect(script.callbackOnly).toBe(true);
		expect(script.src).toBeUndefined();
		script.onLoad?.({
			consents: { marketing: true },
			hasConsent: true,
			id: 'cloudflare-zaraz',
		} as unknown as ScriptCallbackInfo);
		expect(permissions).toEqual({ ads: true, other: false });
		expect(sendQueuedEvents).toHaveBeenCalledOnce();
	});
});
