import type { Script } from '@inth/sdk/engine';

import { resolvedManifestToScript } from '../../engine/runtime';
import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { booleanDataAttribute, listDataAttribute } from '../_shared/attributes';
import { readId, skipMissingId } from '../_shared/required-id';
import { withScriptUrl } from '../_shared/script-url';

declare global {
	interface Window {
		umami?: {
			identify: (sessionData?: Record<string, unknown> | string) => void;
			track: {
				(payload?: Record<string, unknown>): void;
				(eventName: string, eventData?: Record<string, unknown>): void;
			};
		};
	}
}

/**
 * Umami Analytics vendor manifest.
 *
 * Configures Umami entirely through script `data-*` attributes. Umami is a
 * cookieless analytics product, so the script is consent-gated on
 * `measurement` and unloaded when consent is revoked.
 */
export const umamiAnalyticsManifest = {
	...vendorManifestContract,
	category: 'measurement',
	install: [
		{
			attributes: {
				'data-auto-track': '{{autoTrackAttribute}}',
				'data-before-send': '{{beforeSend}}',

				'data-domains': '{{domains}}',
				'data-host-url': '{{hostUrl}}',
				'data-tag': '{{tag}}',
				'data-website-id': '{{websiteId}}',
			},

			defer: true,
			src: 'https://cloud.umami.is/script.js',
			type: 'loadScript',
		},
	],
	vendor: 'umami-analytics',
	vendorDetails: {
		homepageUrl: 'https://umami.is/',
		legalName: 'Umami Software, Inc.',
		name: 'Umami',
		privacyPolicyUrl: 'https://umami.is/privacy',
	},
} as const satisfies VendorManifest;

export interface UmamiAnalyticsOptions {
	/**
	 * Your Umami website ID.
	 */
	websiteId: string;

	/**
	 * Override the host that receives analytics events.
	 */
	hostUrl?: string;

	/**
	 * Disable automatic tracking when set to `false`.
	 */
	autoTrack?: boolean;

	/**
	 * Restrict tracking to specific domains. An array is joined into the
	 * comma-separated `data-domains` list Umami reads.
	 */
	domains?: string[] | string;

	/**
	 * Attach a tag to tracked events.
	 */
	tag?: string;

	/**
	 * Optional global hook name used for Umami's `data-before-send` attribute.
	 *
	 * Callback functions are intentionally not supported here because the Inth
	 * manifest runtime cannot serialize custom JavaScript functions.
	 */
	beforeSend?: string;

	/**
	 * Custom loader URL.
	 * @default 'https://cloud.umami.is/script.js'
	 */
	scriptUrl?: string;
}

/**
 * Builds the serializable manifest behind {@link umamiAnalytics}. `hostUrl`,
 * `tag` and `beforeSend` stay npm-only.
 */
export const resolveUmamiAnalyticsManifest =
	function resolveUmamiAnalyticsManifest({
		websiteId,
		hostUrl,
		autoTrack,
		domains,
		tag,
		beforeSend,
	}: Omit<UmamiAnalyticsOptions, 'scriptUrl'>): ResolvedManifest {
		return getCompiledManifest(umamiAnalyticsManifest, {
			autoTrackAttribute: booleanDataAttribute(autoTrack, true),
			beforeSend,
			domains: listDataAttribute(domains),
			hostUrl,
			tag,
			websiteId,
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
		'umamiAnalytics',
		{
			autoTrack: {
				default: true,
				kind: 'boolean',
				label: 'Track page views and events',
			},
			domains: {
				example: 'example.com',
				kind: 'idList',
				label: 'Only track on these domains',
				maxItems: 20,
				pattern: '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$',
				required: false,
			},
			websiteId: {
				example: '94db1cb1-74f4-4a40-ad6c-962362670409',
				kind: 'id',
				label: 'Website ID',
				pattern:
					'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
				required: true,
			},
		},
		resolveUmamiAnalyticsManifest
	);

/**
 * Creates an Umami Analytics script.
 *
 * @see https://umami.is/docs/tracker-config
 *
 * @remarks When `websiteId` is missing or blank, the helper logs
 *   `umamiAnalytics: missing or invalid websiteId` with `console.error` and
 *   returns a script that never loads.
 *
 * @example
 * ```ts
 * import { umamiAnalytics } from '@inth/integrations/umami-analytics';
 *
 * umamiAnalytics({
 *   websiteId: 'site-abc-123',
 *   domains: ['example.com', 'www.example.com'],
 * });
 * ```
 */
export const umamiAnalytics = function umamiAnalytics({
	scriptUrl,
	...options
}: UmamiAnalyticsOptions): Script {
	const websiteId = readId(options.websiteId);
	if (websiteId === undefined) {
		return skipMissingId('umamiAnalytics', 'websiteId', {
			category: 'measurement',
			manifest: umamiAnalyticsManifest,
		});
	}

	return withScriptUrl(
		resolvedManifestToScript(
			resolveUmamiAnalyticsManifest({ ...options, websiteId })
		),
		scriptUrl
	);
};
