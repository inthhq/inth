import type { Script } from '@inth/sdk/engine';

import { resolvedManifestToScript } from '../../engine/runtime';
import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { readId, skipMissingId } from '../_shared/required-id';
import { withScriptUrl } from '../_shared/script-url';

/**
 * Clearbit vendor manifest.
 *
 * Loads Clearbit's visitor and company enrichment tag from the account-keyed
 * `tags.js` endpoint. Clearbit enrichment can identify visitors and companies,
 * so the default consent category is `marketing` rather than `measurement`.
 */
export const clearbitManifest = {
	...vendorManifestContract,
	category: 'marketing',
	install: [
		{
			attributes: {
				referrerpolicy: 'strict-origin-when-cross-origin',
			},

			src: 'https://tag.clearbitscripts.com/v1/{{keyPath}}/tags.js',
			type: 'loadScript',
		},
	],
	vendor: 'clearbit',
	vendorDetails: {
		homepageUrl: 'https://clearbit.com/',
		legalName: 'HubSpot, Inc.',
		name: 'Clearbit',
		privacyPolicyUrl: 'https://clearbit.com/privacy-policy',
	},
} as const satisfies VendorManifest;

export interface ClearbitOptions {
	/**
	 * Your Clearbit publishable key.
	 */
	publishableKey: string;

	/**
	 * Custom loader URL.
	 * @default `https://tag.clearbitscripts.com/v1/{publishableKey}/tags.js`
	 */
	scriptUrl?: string;
}

/**
 * Builds the serializable manifest behind {@link clearbit}.
 */
export const resolveClearbitManifest = function resolveClearbitManifest({
	publishableKey,
}: Omit<ClearbitOptions, 'scriptUrl'>): ResolvedManifest {
	return getCompiledManifest(clearbitManifest, {
		keyPath: encodeURIComponent(publishableKey),
	});
};

/**
 * What the Inth server may set for this vendor. The npm helper calls the same
 * resolver; its other options stay npm-only. Marked pure so a bundler drops
 * it from an npm bundle that never reads it.
 */
export const remote =
	/* @__PURE__ */
	defineRemote(
		'clearbit',
		{
			publishableKey: {
				example: 'pk_1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d',
				kind: 'id',
				label: 'Publishable key',
				pattern: '^pk_[A-Za-z0-9]+$',
				required: true,
			},
		},
		resolveClearbitManifest
	);

/**
 * Creates a Clearbit enrichment script.
 *
 * @see https://help.clearbit.com/hc/en-us/articles/4420022080783 — installing the Clearbit tag
 *
 * @remarks
 * When `publishableKey` is missing or blank, the helper logs
 * `clearbit: missing or invalid publishableKey` with `console.error` and
 * returns a script that never loads.
 *
 * Clearbit identifies visitors and companies for enrichment and intent use
 * cases. This helper therefore uses the `marketing` consent category by
 * default even though Clearbit is listed with analytics integrations for
 * discovery.
 *
 * @example
 * ```ts
 * import { clearbit } from '@inth/integrations/clearbit';
 *
 * clearbit({
 *   publishableKey: 'YOUR_PUBLISHABLE_KEY',
 * });
 * ```
 */
export const clearbit = function clearbit(options: ClearbitOptions): Script {
	const publishableKey = readId(options.publishableKey);
	if (publishableKey === undefined) {
		return skipMissingId('clearbit', 'publishableKey', {
			category: 'marketing',
			manifest: clearbitManifest,
		});
	}

	return withScriptUrl(
		resolvedManifestToScript(resolveClearbitManifest({ publishableKey })),
		options.scriptUrl
	);
};
