import type { Script } from '@inth/sdk/engine';

import { resolvedManifestToScript } from '../../engine/runtime';
import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { readId, skipMissingId } from '../_shared/required-id';
import { trimToUndefined, withScriptUrl } from '../_shared/script-url';

declare global {
	interface Window {
		statable?: {
			t: (eventName: string, props?: Record<string, unknown>) => void;
		};
	}
}

/** Statable's attribute-based loader, gated on measurement consent. */
export const statableAnalyticsManifest = {
	...vendorManifestContract,
	category: 'measurement',
	install: [
		{
			attributes: {
				'data-id': '{{siteId}}',
				'data-tracking-api': '{{trackingApi}}',
			},
			defer: true,
			src: 'https://statable.com/js/{{siteId}}/s.js',
			type: 'loadScript',
		},
	],
	vendor: 'statable-analytics',
	vendorDetails: {
		homepageUrl: 'https://statable.com/',
		legalName: 'Key Arg B.V.',
		name: 'Statable',
		privacyPolicyUrl: 'https://statable.com/privacy',
	},
} as const satisfies VendorManifest;

export interface StatableAnalyticsOptions {
	/** Positive integer site ID from the Statable dashboard. */
	siteId: string | number;
	/**
	 * Custom loader URL. The `{siteId}` placeholder is replaced with the site ID.
	 * @default 'https://statable.com/js/{siteId}/s.js'
	 */
	scriptUrl?: string;
	/**
	 * Complete ingestion endpoint, forwarded as `data-tracking-api`.
	 * By default Statable posts to `/api/event` on the loader's origin.
	 */
	trackingApi?: string;
}

/**
 * Builds the serializable manifest behind {@link statableAnalytics}. `siteId`
 * must already be a positive safe integer. `trackingApi` stays npm-only.
 */
export const resolveStatableAnalyticsManifest =
	function resolveStatableAnalyticsManifest({
		siteId,
		trackingApi,
	}: Omit<StatableAnalyticsOptions, 'scriptUrl'>): ResolvedManifest {
		return getCompiledManifest(statableAnalyticsManifest, {
			siteId: String(siteId),
			trackingApi: trimToUndefined(trackingApi),
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
		'statableAnalytics',
		{
			siteId: {
				example: '12345',
				kind: 'id',
				label: 'Site ID',
				pattern: '^[1-9][0-9]{0,14}$',
				required: true,
			},
		},
		resolveStatableAnalyticsManifest
	);

/**
 * Creates a Statable loader that waits for measurement consent.
 *
 * Statable initializes its own `window.statable` event API. This helper leaves
 * that global absent before the tracker loads; early events are not queued.
 * Keep Inth's default reload on revocation to stop the running tracker.
 *
 * @param options - Statable site ID and optional loader and ingestion URLs.
 * @returns The consent-gated script, or a disabled script for an invalid ID.
 * @remarks A missing, blank or invalid site ID logs
 * `statableAnalytics: missing or invalid siteId` and never loads the tracker.
 * @example
 * statableAnalytics({ siteId: '12345' });
 * @see https://statable.com/docs/
 */
export const statableAnalytics = function statableAnalytics(
	options: StatableAnalyticsOptions
): Script {
	const siteId = readId(options?.siteId);
	if (
		siteId === undefined ||
		!/^[1-9]\d*$/u.test(siteId) ||
		!Number.isSafeInteger(Number(siteId))
	) {
		return skipMissingId('statableAnalytics', 'siteId', {
			category: 'measurement',
			manifest: statableAnalyticsManifest,
		});
	}

	return withScriptUrl(
		resolvedManifestToScript(
			resolveStatableAnalyticsManifest({
				siteId,
				trackingApi: options.trackingApi,
			})
		),
		trimToUndefined(options.scriptUrl)?.replaceAll('{siteId}', siteId)
	);
};
