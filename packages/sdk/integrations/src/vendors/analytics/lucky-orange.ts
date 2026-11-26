import type { Script } from '@inth/sdk/engine';
import { luckyOrangeScript } from '@inth/sdk/manifest-runtime/adapters/lucky-orange';
import type {
	LuckyOrangeApi,
	LuckyOrangeQueue,
} from '@inth/sdk/manifest-runtime/adapters/lucky-orange';

import { resolvedManifestToScript } from '../../engine/runtime';
import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { readId, skipMissingId } from '../_shared/required-id';
import { createScriptReuse } from '../_shared/reuse-script';
import { withScriptUrl } from '../_shared/script-url';

export type {
	LuckyOrangeApi,
	LuckyOrangeQueue,
} from '@inth/sdk/manifest-runtime/adapters/lucky-orange';

declare global {
	interface Window {
		LOQ?: LuckyOrangeQueue;
		LO?: LuckyOrangeApi;
	}
}

/**
 * Lucky Orange loader, gated even when dashboard consent is enabled. The
 * Lucky Orange adapter in `@inth/sdk` sets its privacy consent.
 */
export const luckyOrangeManifest = {
	...vendorManifestContract,
	category: 'measurement',
	install: [
		{
			async: true,
			defer: true,
			src: 'https://tools.luckyorange.com/core/lo.js?site-id={{siteId}}',
			type: 'loadScript',
		},
	],
	persistAfterConsentRevoked: true,
	vendor: 'lucky-orange',
	vendorDetails: {
		homepageUrl: 'https://www.luckyorange.com/',
		legalName: 'Lucky Orange LLC',
		name: 'Lucky Orange',
		privacyPolicyUrl: 'https://www.luckyorange.com/legal/privacy-policy',
	},
} as const satisfies VendorManifest;

export interface LuckyOrangeOptions {
	/** Site ID supplied by Lucky Orange. */
	siteId: string;
	/** Consent condition required before loading. @default 'measurement' */
	category?: Script['category'];
	/** Exact loader URL. Proxies must preserve Lucky Orange's site-ID discovery. */
	scriptUrl?: string;
}

/**
 * The manifest for a Lucky Orange site: its loader, and the Lucky Orange
 * adapter, which takes no options. The npm helper and the Inth server both
 * build it here. `siteId` must already be trimmed and non-empty.
 */
export const resolveLuckyOrangeManifest = function resolveLuckyOrangeManifest({
	siteId,
}: Pick<LuckyOrangeOptions, 'siteId'>): ResolvedManifest {
	return {
		...getCompiledManifest(luckyOrangeManifest, {
			siteId: encodeURIComponent(siteId),
		}),
		adapter: { id: 'lucky-orange', options: {} },
		requires: 4,
	};
};

/**
 * What the Inth server may set for Lucky Orange: the site ID. The category
 * and a loader URL of the site's own stay npm-only.
 * Marked pure so a bundler drops it from an npm bundle that never reads it.
 */
export const remote =
	/* @__PURE__ */
	defineRemote(
		'luckyOrange',
		{
			siteId: {
				example: 'a1b2c3d4',
				kind: 'id',
				label: 'Site ID',
				pattern: '^[A-Za-z0-9_-]{1,64}$',
				required: true,
			},
		},
		resolveLuckyOrangeManifest
	);

const reuseLuckyOrange = createScriptReuse<LuckyOrangeOptions>();

const createLuckyOrange = function createLuckyOrange(
	options: LuckyOrangeOptions
): Script {
	const { adapter: _adapter, ...manifest } =
		resolveLuckyOrangeManifest(options);
	return luckyOrangeScript({
		...withScriptUrl(resolvedManifestToScript(manifest), options.scriptUrl),
		category: options.category ?? 'measurement',
	});
};

/**
 * Enables Lucky Orange privacy consent only after its privacy module is ready.
 * Reports privacy initialization failures with `console.error`.
 * Enable Require Consent in the Lucky Orange dashboard. Keep Inth's reload on
 * revocation enabled; false consent is not verified to stop every recording path.
 * @param options - Lucky Orange site and loader configuration.
 * @returns A gated script, or an inactive script for a missing site ID.
 * @example luckyOrange({ siteId: 'YOUR_SITE_ID' });
 * @see https://developers.luckyorange.com/libraries/browser/privacy-tools
 */
export const luckyOrange = function luckyOrange(
	options: LuckyOrangeOptions
): Script {
	const siteId = readId(options?.siteId);
	if (!siteId) {
		return skipMissingId('luckyOrange', 'siteId', {
			category: options?.category ?? 'measurement',
			manifest: luckyOrangeManifest,
		});
	}
	return reuseLuckyOrange({ ...options, siteId }, createLuckyOrange);
};
