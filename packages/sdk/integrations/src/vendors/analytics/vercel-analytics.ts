import type { Script } from '@inth/sdk/engine';

import { resolvedManifestToScript } from '../../engine/runtime';
import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { withScriptUrl } from '../_shared/script-url';

export type VercelAnalyticsMode = 'auto' | 'development' | 'production';

declare global {
	interface Window {
		va?: (event: string, properties?: unknown) => void;
		vaq?: [string, unknown?][];
		vam?: 'development' | 'production';
	}
}

/**
 * Vercel Analytics vendor manifest.
 *
 * Seeds Vercel's event queue before loading the tracker bundle.
 */
export const vercelAnalyticsManifest = {
	...vendorManifestContract,
	bootstrap: [
		{
			ifUndefined: true,

			name: 'vaq',
			type: 'setGlobal',
			value: [],
		},
		{
			ifUndefined: true,

			name: 'va',
			queue: {
				global: 'vaq',
			},
			queueFormat: 'array',
			type: 'defineStubFunction',
		},
	],
	category: 'measurement',
	install: [
		{
			attributes: {
				'data-disable-auto-track': '{{disableAutoTrackAttribute}}',
				'data-dsn': '{{dsn}}',
				'data-endpoint': '{{endpoint}}',

				'data-sdkn': 'inth',
			},

			defer: true,
			src: 'https://va.vercel-scripts.com/v1/{{scriptFile}}',
			type: 'loadScript',
		},
	],
	vendor: 'vercel-analytics',
	vendorDetails: {
		homepageUrl: 'https://vercel.com/products/web-analytics',
		legalName: 'Vercel Inc.',
		name: 'Vercel Web Analytics',
		privacyPolicyUrl: 'https://vercel.com/legal/privacy-notice',
	},
} as const satisfies VendorManifest;

export interface VercelAnalyticsOptions {
	/** Project DSN for self-hosted or non-Vercel deployments. */
	dsn?: string;
	/** Disable automatic pageview tracking. */
	disableAutoTrack?: boolean;
	/** Preferred script mode. */
	mode?: VercelAnalyticsMode;
	/** Load Vercel's debug bundle when set to `true`. */
	debug?: boolean;
	/** Custom ingestion endpoint. */
	endpoint?: string;
	/** Custom loader URL. */
	scriptUrl?: string;
}

/**
 * Builds the serializable manifest behind {@link vercelAnalytics}. `mode`
 * and `endpoint` stay npm-only.
 */
export const resolveVercelAnalyticsManifest =
	function resolveVercelAnalyticsManifest({
		dsn,
		disableAutoTrack,
		mode,
		debug,
		endpoint,
	}: Omit<VercelAnalyticsOptions, 'scriptUrl'>): ResolvedManifest {
		let disableAutoTrackAttribute: string | undefined;
		if (disableAutoTrack) {
			disableAutoTrackAttribute = '1';
		}

		return getCompiledManifest(vercelAnalyticsManifest, {
			disableAutoTrackAttribute,
			dsn,
			endpoint,
			scriptFile:
				mode === 'development' || debug ? 'script.debug.js' : 'script.js',
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
		'vercelAnalytics',
		{
			debug: {
				default: false,
				kind: 'boolean',
				label: 'Load the debug bundle',
			},
			disableAutoTrack: {
				default: false,
				kind: 'boolean',
				label: 'Turn off automatic page views',
			},
			dsn: {
				example: 'prj_AbC123dEf456',
				kind: 'id',
				label: 'Project DSN',
				pattern: '^[A-Za-z0-9_-]+$',
				required: false,
			},
		},
		resolveVercelAnalyticsManifest
	);

/**
 * Creates a Vercel Analytics script.
 */
export const vercelAnalytics = function vercelAnalytics({
	scriptUrl,
	...options
}: VercelAnalyticsOptions = {}): Script {
	return withScriptUrl(
		resolvedManifestToScript(resolveVercelAnalyticsManifest(options)),
		scriptUrl
	);
};
