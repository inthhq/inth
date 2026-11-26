import type { Script } from '@inth/sdk/engine';

import { resolvedManifestToScript } from '../../engine/runtime';
import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { booleanDataAttribute } from '../_shared/attributes';
import { readId, skipMissingId } from '../_shared/required-id';
import { withScriptUrl } from '../_shared/script-url';

declare global {
	interface Window {
		fathom?: {
			blockTrackingForMe: () => void;
			enableTrackingForMe: () => void;
			trackEvent: (
				eventName: string,
				opts?: {
					_value?: number;
				}
			) => void;
			trackGoal: (goalId: string, cents: number) => void;
			trackPageview: (opts?: { url: string; referrer?: string }) => void;
		};
	}
}

/**
 * Fathom Analytics vendor manifest.
 *
 * Configures Fathom via script `data-*` attributes. Fathom is a cookieless
 * analytics product, so the script is consent-gated on `measurement` and
 * unloaded when consent is revoked.
 */
export const fathomAnalyticsManifest = {
	...vendorManifestContract,
	category: 'measurement',
	install: [
		{
			attributes: {
				'data-auto': '{{autoAttribute}}',
				'data-canonical': '{{canonicalAttribute}}',
				'data-honor-dnt': '{{honorDntAttribute}}',

				'data-site': '{{site}}',
				'data-spa': '{{spa}}',
			},

			defer: true,
			src: 'https://cdn.usefathom.com/script.js',
			type: 'loadScript',
		},
	],
	vendor: 'fathom-analytics',
	vendorDetails: {
		homepageUrl: 'https://usefathom.com/',
		legalName: 'Conva Ventures Inc.',
		name: 'Fathom Analytics',
		privacyPolicyUrl: 'https://usefathom.com/legal/privacy',
	},
} as const satisfies VendorManifest;

export interface FathomAnalyticsOptions {
	/**
	 * Your Fathom Analytics site ID.
	 */
	site: string;

	/**
	 * The SPA tracking mode. When undefined, SPA auto-routing is disabled and
	 * the `data-spa` attribute is omitted.
	 */
	spa?: 'auto' | 'history' | 'hash';

	/**
	 * Automatically track page views.
	 */
	auto?: boolean;

	/**
	 * Enable canonical URL tracking.
	 */
	canonical?: boolean;

	/**
	 * Honor Do Not Track requests.
	 */
	honorDnt?: boolean;

	/**
	 * Custom loader URL.
	 * @default 'https://cdn.usefathom.com/script.js'
	 */
	scriptUrl?: string;
}

/**
 * Builds the serializable manifest behind {@link fathomAnalytics}.
 */
export const resolveFathomAnalyticsManifest =
	function resolveFathomAnalyticsManifest({
		site,
		spa,
		auto,
		canonical,
		honorDnt,
	}: Omit<FathomAnalyticsOptions, 'scriptUrl'>): ResolvedManifest {
		return getCompiledManifest(fathomAnalyticsManifest, {
			autoAttribute: booleanDataAttribute(auto),
			canonicalAttribute: booleanDataAttribute(canonical),
			honorDntAttribute: booleanDataAttribute(honorDnt),
			site,
			spa,
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
		'fathomAnalytics',
		{
			auto: { default: true, kind: 'boolean', label: 'Track page views' },
			canonical: {
				default: true,
				kind: 'boolean',
				label: 'Use the canonical URL',
			},
			honorDnt: {
				default: false,
				kind: 'boolean',
				label: 'Honor Do Not Track',
			},
			site: {
				example: 'ABCDEFGH',
				kind: 'id',
				label: 'Site ID',
				pattern: '^[A-Z0-9]+$',
				required: true,
			},
			spa: {
				default: 'auto',
				kind: 'enum',
				label: 'Single-page app mode',
				values: ['auto', 'history', 'hash'],
			},
		},
		resolveFathomAnalyticsManifest
	);

/**
 * Creates a Fathom Analytics script.
 *
 * @see https://usefathom.com/docs/script/script-settings
 *
 * @remarks When `site` is missing or blank, the
 *   helper logs `fathomAnalytics: missing or invalid site` with
 *   `console.error` and returns a script that never loads.
 *
 * @example
 * ```ts
 * import { fathomAnalytics } from '@inth/integrations/fathom-analytics';
 *
 * fathomAnalytics({
 *   site: 'SITE123',
 *   spa: 'history',
 *   canonical: true,
 * });
 * ```
 */
export const fathomAnalytics = function fathomAnalytics(
	options: FathomAnalyticsOptions
): Script {
	const site = readId(options.site);
	if (site === undefined) {
		return skipMissingId('fathomAnalytics', 'site', {
			category: 'measurement',
			manifest: fathomAnalyticsManifest,
		});
	}

	return withScriptUrl(
		resolvedManifestToScript(
			resolveFathomAnalyticsManifest({ ...options, site })
		),
		options.scriptUrl
	);
};
