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
		__cfBeacon?: {
			spa?: boolean;
			token: string;
		};
	}
}

/**
 * Cloudflare Web Analytics vendor manifest.
 *
 * Serializes Cloudflare's beacon config into the `data-cf-beacon` attribute.
 * Cloudflare Web Analytics is cookieless, so the script is consent-gated on
 * `measurement` and unloaded when consent is revoked.
 */
export const cloudflareWebAnalyticsManifest = {
	...vendorManifestContract,
	category: 'measurement',
	install: [
		{
			attributes: {
				'data-cf-beacon': '{{beaconConfig}}',
			},

			defer: true,
			src: 'https://static.cloudflareinsights.com/beacon.min.js',
			type: 'loadScript',
		},
	],
	vendor: 'cloudflare-web-analytics',
	vendorDetails: {
		homepageUrl: 'https://www.cloudflare.com/web-analytics/',
		legalName: 'Cloudflare, Inc.',
		name: 'Cloudflare Web Analytics',
		privacyPolicyUrl: 'https://www.cloudflare.com/privacypolicy/',
	},
} as const satisfies VendorManifest;

export interface CloudflareWebAnalyticsOptions {
	/**
	 * Your Cloudflare Web Analytics token.
	 */
	token: string;

	/**
	 * Enable Cloudflare's SPA route tracking.
	 * @default true
	 */
	spa?: boolean;

	/**
	 * Custom loader URL.
	 * @default 'https://static.cloudflareinsights.com/beacon.min.js'
	 */
	scriptUrl?: string;
}

/**
 * Builds the serializable manifest behind {@link cloudflareWebAnalytics}.
 */
export const resolveCloudflareWebAnalyticsManifest =
	function resolveCloudflareWebAnalyticsManifest({
		token,
		spa = true,
	}: Omit<CloudflareWebAnalyticsOptions, 'scriptUrl'>): ResolvedManifest {
		return getCompiledManifest(cloudflareWebAnalyticsManifest, {
			beaconConfig: JSON.stringify({ spa, token }),
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
		'cloudflareWebAnalytics',
		{
			spa: {
				default: true,
				kind: 'boolean',
				label: 'Track single-page app navigation',
			},
			token: {
				example: '0123456789abcdef0123456789abcdef',
				kind: 'id',
				label: 'Site token',
				pattern: '^[0-9a-f]{32}$',
				required: true,
			},
		},
		resolveCloudflareWebAnalyticsManifest
	);

/**
 * Creates a Cloudflare Web Analytics script.
 *
 * @see https://developers.cloudflare.com/analytics/web-analytics/get-started/
 *
 * @remarks When `token` is missing or blank, the
 *   helper logs `cloudflareWebAnalytics: missing or invalid token` with
 *   `console.error` and returns a script that never loads.
 *
 * @example
 * ```ts
 * import { cloudflareWebAnalytics } from '@inth/integrations/cloudflare-web-analytics';
 *
 * cloudflareWebAnalytics({
 *   token: 'abc123...',
 *   spa: true,
 * });
 * ```
 */
export const cloudflareWebAnalytics = function cloudflareWebAnalytics(
	options: CloudflareWebAnalyticsOptions
): Script {
	const token = readId(options.token);
	if (token === undefined) {
		return skipMissingId('cloudflareWebAnalytics', 'token', {
			category: 'measurement',
			manifest: cloudflareWebAnalyticsManifest,
		});
	}

	return withScriptUrl(
		resolvedManifestToScript(
			resolveCloudflareWebAnalyticsManifest({ spa: options.spa, token })
		),
		options.scriptUrl
	);
};
