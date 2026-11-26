import type { Script } from '@inth/sdk/engine';

import { resolvedManifestToScript } from '../../engine/runtime';
import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { booleanDataAttribute } from '../_shared/attributes';
import { readId, skipMissingId } from '../_shared/required-id';
import {
	joinUrlPath,
	trimToUndefined,
	withScriptUrl,
} from '../_shared/script-url';

declare global {
	interface Window {
		rybbit?: {
			clearUserId: () => void;
			event: (name: string, properties?: Record<string, unknown>) => void;
			getUserId: () => string | null;
			identify: (userId: string) => void;
			pageview: () => void;
		};
	}
}

/**
 * Rybbit Analytics vendor manifest.
 *
 * Rybbit reads its configuration from script data attributes at load time.
 */
export const rybbitAnalyticsManifest = {
	...vendorManifestContract,
	category: 'measurement',
	install: [
		{
			attributes: {
				'data-api-key': '{{apiKey}}',

				'data-auto-track-pageview': '{{autoTrackPageview}}',
				'data-debounce': '{{debounce}}',
				'data-mask-patterns': '{{maskPatterns}}',
				'data-session-replay': '{{sessionReplay}}',
				'data-site-id': '{{siteId}}',
				'data-skip-patterns': '{{skipPatterns}}',
				'data-track-errors': '{{trackErrors}}',
				'data-track-outbound': '{{trackOutbound}}',
				'data-track-query': '{{trackQuery}}',
				'data-track-spa': '{{trackSpa}}',
				'data-web-vitals': '{{webVitals}}',
			},

			defer: true,
			src: 'https://app.rybbit.io/api/script.js',
			type: 'loadScript',
		},
	],
	vendor: 'rybbit-analytics',
	vendorDetails: {
		homepageUrl: 'https://rybbit.com/',
		name: 'Rybbit',
		privacyPolicyUrl: 'https://rybbit.com/privacy',
	},
} as const satisfies VendorManifest;

export interface RybbitAnalyticsOptions {
	/** Your Rybbit site ID. */
	siteId: string | number;
	/** Automatically track pageviews. */
	autoTrackPageview?: boolean;
	/** Enable SPA route tracking. */
	trackSpa?: boolean;
	/** Include query parameters in tracked URLs. */
	trackQuery?: boolean;
	/** Track outbound link clicks. */
	trackOutbound?: boolean;
	/** Track JavaScript errors. */
	trackErrors?: boolean;
	/** Enable session replay. */
	sessionReplay?: boolean;
	/** Enable Web Vitals tracking. */
	webVitals?: boolean;
	/** URL patterns to skip from tracking. */
	skipPatterns?: string[];
	/** URL patterns to mask in tracked data. */
	maskPatterns?: string[];
	/** Debounce interval for pageview tracking. */
	debounce?: number;
	/** API key for authenticated tracking. */
	apiKey?: string;
	/** Override the analytics host URL. */
	analyticsHost?: string;
	/** Custom loader URL. */
	scriptUrl?: string;
}

/**
 * Builds the serializable manifest behind {@link rybbitAnalytics}.
 * `analyticsHost`, `apiKey`, the pattern lists and `debounce` stay npm-only.
 */
export const resolveRybbitAnalyticsManifest =
	function resolveRybbitAnalyticsManifest({
		siteId,
		autoTrackPageview,
		trackSpa,
		trackQuery,
		trackOutbound,
		trackErrors,
		sessionReplay,
		webVitals,
		skipPatterns,
		maskPatterns,
		debounce,
		apiKey,
	}: Omit<
		RybbitAnalyticsOptions,
		'scriptUrl' | 'analyticsHost'
	>): ResolvedManifest {
		return getCompiledManifest(rybbitAnalyticsManifest, {
			apiKey,
			autoTrackPageview: booleanDataAttribute(autoTrackPageview),
			debounce: debounce === undefined ? undefined : String(debounce),
			maskPatterns: maskPatterns ? JSON.stringify(maskPatterns) : undefined,
			sessionReplay: booleanDataAttribute(sessionReplay),
			siteId: String(siteId),
			skipPatterns: skipPatterns ? JSON.stringify(skipPatterns) : undefined,
			trackErrors: booleanDataAttribute(trackErrors),
			trackOutbound: booleanDataAttribute(trackOutbound),
			trackQuery: booleanDataAttribute(trackQuery),
			trackSpa: booleanDataAttribute(trackSpa),
			webVitals: booleanDataAttribute(webVitals),
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
		'rybbitAnalytics',
		// Session replay, error tracking and Web Vitals are left to the site
		// settings in Rybbit's own dashboard, which its script fetches: the
		// npm helper writes no attribute for them unless a site sets one, and
		// a remote default would override those settings on every page.
		{
			siteId: {
				example: '123',
				kind: 'id',
				label: 'Site ID',
				pattern: '^[A-Za-z0-9-]+$',
				required: true,
			},
		},
		resolveRybbitAnalyticsManifest
	);

/**
 * Creates a Rybbit Analytics script.
 *
 * @remarks When `siteId` is missing or blank, the helper logs
 *   `rybbitAnalytics: missing or invalid siteId` with `console.error` and
 *   returns a script that never loads.
 */
export const rybbitAnalytics = function rybbitAnalytics({
	scriptUrl,
	analyticsHost,
	...options
}: RybbitAnalyticsOptions): Script {
	const siteId = readId(options.siteId);
	if (siteId === undefined) {
		return skipMissingId('rybbitAnalytics', 'siteId', {
			category: 'measurement',
			manifest: rybbitAnalyticsManifest,
		});
	}

	// A self-hosted Rybbit serves its script from `analyticsHost`, unless
	// `scriptUrl` names it directly.
	return withScriptUrl(
		resolvedManifestToScript(
			resolveRybbitAnalyticsManifest({ ...options, siteId })
		),
		trimToUndefined(scriptUrl) ??
			(analyticsHost ? joinUrlPath(analyticsHost, 'script.js') : undefined)
	);
};
