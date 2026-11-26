import type { Script } from '@inth/sdk/engine';

import { resolvedManifestToScript } from '../../engine/runtime';
import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { readId, skipMissingId } from '../_shared/required-id';
import { withScriptUrl } from '../_shared/script-url';

declare global {
	interface Window {
		hj?: ((...args: unknown[]) => void) & { q?: unknown[][] };
		_hjSettings?: {
			hjid: number | string;
			hjsv: number;
		};
	}
}

/**
 * Hotjar vendor manifest.
 *
 * Seeds the global Hotjar settings object and queue stub before loading
 * the vendor bundle.
 */
export const hotjarManifest = {
	...vendorManifestContract,
	category: 'measurement',
	install: [
		{
			ifUndefined: true,

			name: '_hjSettings',
			type: 'setGlobal',
			value: {
				hjid: '{{siteId}}',
				hjsv: '{{version}}',
			},
		},
		{
			ifUndefined: true,

			name: 'hj',
			queue: {
				property: 'q',
			},
			queueFormat: 'array',
			type: 'defineStubFunction',
		},
		{
			async: true,

			src: 'https://static.hotjar.com/c/hotjar-{{siteId}}.js?sv={{version}}',
			type: 'loadScript',
		},
	],
	vendor: 'hotjar',
	vendorDetails: {
		homepageUrl: 'https://contentsquare.com/hotjar/',
		name: 'Hotjar',
		privacyPolicyUrl: 'https://contentsquare.com/privacy-policy/',
	},
} as const satisfies VendorManifest;

export interface HotjarOptions {
	/**
	 * Your Hotjar site ID.
	 * @example `1234567`
	 */
	siteId: number | string;

	/**
	 * Hotjar script version.
	 * @default 6
	 */
	version?: number;

	/** Hotjar loader URL. */
	scriptUrl?: string;
}

/**
 * Builds the serializable manifest behind {@link hotjar}.
 */
export const resolveHotjarManifest = function resolveHotjarManifest({
	siteId,
	version = 6,
}: Omit<HotjarOptions, 'scriptUrl'>): ResolvedManifest {
	return getCompiledManifest(hotjarManifest, {
		siteId: String(siteId),
		version,
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
		'hotjar',
		{
			siteId: {
				example: '1234567',
				kind: 'id',
				label: 'Site ID',
				pattern: '^[1-9][0-9]*$',
				required: true,
			},
		},
		resolveHotjarManifest
	);

/**
 * Creates a Hotjar script.
 *
 * @remarks When `siteId` is missing, blank, or `0`, the helper logs
 *   `hotjar: missing or invalid siteId` with `console.error` and returns a
 *   script that never loads.
 *
 * @example
 * ```ts
 * import { hotjar } from '@inth/integrations/hotjar';
 *
 * hotjar({ siteId: 1234567 });
 * ```
 */
export const hotjar = function hotjar({
	siteId,
	version = 6,
	scriptUrl,
}: HotjarOptions): Script {
	const normalizedSiteId = readId(siteId);
	if (normalizedSiteId === undefined || normalizedSiteId === '0') {
		return skipMissingId('hotjar', 'siteId', {
			category: 'measurement',
			manifest: hotjarManifest,
		});
	}

	return withScriptUrl(
		resolvedManifestToScript(
			resolveHotjarManifest({ siteId: normalizedSiteId, version })
		),
		scriptUrl
	);
};
