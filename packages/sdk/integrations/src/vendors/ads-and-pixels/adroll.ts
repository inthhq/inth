import type { Script } from '@inth/sdk/engine';

import { resolvedManifestToScript } from '../../engine/runtime';
import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { readId, skipMissingId } from '../_shared/required-id';
import { withScriptUrl } from '../_shared/script-url';

type AdrollMethod = 'setProperties' | 'identify' | 'track';
type AdrollQueue = unknown[] &
	Partial<Record<AdrollMethod, (...args: unknown[]) => void>> & {
		f?: string[];
	};
declare global {
	interface Window {
		adroll?: AdrollQueue;
		adroll_adv_id?: string;
		adroll_pix_id?: string;
		adroll_version?: string;
		__adroll_loaded?: boolean;
	}
}

const ADROLL_METHODS = ['setProperties', 'identify', 'track'];

/**
 * AdRoll v2 account-specific loader, with the official snippet's account
 * globals and call queue set up before it loads.
 */
export const adrollPixelManifest = {
	...vendorManifestContract,
	category: 'marketing',
	install: [
		{
			ifUndefined: false,
			name: 'adroll_adv_id',
			type: 'setGlobal',
			value: '{{advertiserId}}',
		},
		{
			ifUndefined: false,
			name: 'adroll_pix_id',
			type: 'setGlobal',
			value: '{{pixelId}}',
		},
		{
			ifUndefined: false,
			name: 'adroll_version',
			type: 'setGlobal',
			value: '2.0',
		},
		{
			ifUndefined: false,
			name: '__adroll_loaded',
			type: 'setGlobal',
			value: true,
		},
		{ name: 'adroll', type: 'setGlobal', value: [] },
		{
			path: ['adroll', 'f'],
			type: 'setGlobalPath',
			value: ADROLL_METHODS,
		},
		{
			methods: ADROLL_METHODS,
			preserveExisting: true,
			// AdRoll replays the second tuple member with Function.apply.
			queueFormat: 'nameAndArguments',
			target: 'adroll',
			type: 'defineQueueMethods',
		},
		{
			args: ['pageView'],
			global: 'adroll',
			method: 'track',
			type: 'callGlobal',
		},
		{
			async: true,
			src: 'https://s.adroll.com/j/{{advertiserPath}}/roundtrip.js',
			type: 'loadScript',
		},
	],
	persistAfterConsentRevoked: true,
	vendor: 'adroll',
	vendorDetails: {
		homepageUrl: 'https://www.adroll.com/',
		legalName: 'NextRoll, Inc.',
		name: 'AdRoll',
		privacyPolicyUrl: 'https://www.nextroll.com/privacy',
	},
} as const satisfies VendorManifest;

/** Public account IDs from the generated AdRoll v2 snippet. */
export interface AdrollPixelOptions {
	/** Account advertiser ID, also used in the loader path. */
	advertiserId: string;
	/** Pixel ID from the generated snippet. */
	pixelId: string;
	/** Override URL for the account-specific v2 loader. */
	scriptUrl?: string;
}

/**
 * Builds the serializable manifest behind {@link adrollPixel}. Both IDs
 * must already be trimmed and non-empty.
 */
export const resolveAdrollPixelManifest = function resolveAdrollPixelManifest({
	advertiserId,
	pixelId,
}: Omit<AdrollPixelOptions, 'scriptUrl'>): ResolvedManifest {
	return getCompiledManifest(adrollPixelManifest, {
		advertiserId,
		advertiserPath: encodeURIComponent(advertiserId),
		pixelId,
	});
};

/**
 * What the Inth server may set for this vendor. The npm helper calls the same
 * resolver; `scriptUrl` stays npm-only. Marked pure so a bundler drops it
 * from an npm bundle that never reads it.
 */
export const remote =
	/* @__PURE__ */
	defineRemote(
		'adrollPixel',
		{
			advertiserId: {
				example: 'ABCDEFGHIJ1234567890KL',
				kind: 'id',
				label: 'Advertiser ID',
				pattern: '^[A-Za-z0-9]+$',
				required: true,
			},
			pixelId: {
				example: 'MNOPQRSTUV0987654321WX',
				kind: 'id',
				label: 'Pixel ID',
				pattern: '^[A-Za-z0-9]+$',
				required: true,
			},
		},
		resolveAdrollPixelManifest
	);

/**
 * Loads AdRoll v2 only after marketing consent and queues the initial page view.
 * @returns A gated script, or a skipped script for missing IDs.
 * @remarks Keep reload on revocation enabled. AdRoll has no documented stop API.
 * @example adrollPixel({ advertiserId: 'ADVERTISER_ID', pixelId: 'PIXEL_ID' });
 * @see https://help.adroll.com/hc/en-us/articles/360040116252
 */
export const adrollPixel = function adrollPixel(
	options: AdrollPixelOptions
): Script {
	const advertiserId = readId(options?.advertiserId);
	if (advertiserId === undefined) {
		return skipMissingId('adrollPixel', 'advertiserId', {
			category: 'marketing',
			manifest: adrollPixelManifest,
		});
	}
	const pixelId = readId(options.pixelId);
	if (pixelId === undefined) {
		return skipMissingId('adrollPixel', 'pixelId', {
			category: 'marketing',
			manifest: adrollPixelManifest,
		});
	}
	return withScriptUrl(
		resolvedManifestToScript(
			resolveAdrollPixelManifest({ advertiserId, pixelId })
		),
		options.scriptUrl
	);
};
