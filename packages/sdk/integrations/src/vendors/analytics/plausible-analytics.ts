import type { Script } from '@inth/sdk/engine';

import { resolvedManifestToScript } from '../../engine/runtime';
import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { readId, skipScript } from '../_shared/required-id';
import { withScriptUrl } from '../_shared/script-url';

export type PlausibleExtension =
	| 'hash'
	| 'outbound-links'
	| 'file-downloads'
	| 'tagged-events'
	| 'revenue'
	| 'pageview-props'
	| 'compat'
	| 'local'
	| 'manual';

export interface PlausibleInitOptions {
	customProperties?: Record<string, unknown>;
	endpoint?: string;
	fileDownloads?: {
		fileExtensions?: string[];
	};
	hashBasedRouting?: boolean;
	autoCapturePageviews?: boolean;
	captureOnLocalhost?: boolean;
}

declare global {
	interface Window {
		plausible?: ((...args: unknown[]) => void) & {
			o?: PlausibleInitOptions;
			q?: unknown[][];
		};
	}
}

const buildPlausibleScriptFile = function buildPlausibleScriptFile(
	options: PlausibleAnalyticsOptions
): string {
	if (options.scriptId) {
		return `pa-${options.scriptId}`;
	}

	if (options.extension) {
		let extensions: string;
		if (Array.isArray(options.extension)) {
			extensions = options.extension.join('.');
		} else {
			extensions = options.extension;
		}

		return `script.${extensions}`;
	}

	return 'script';
};

const buildPlausibleInitOptions = function buildPlausibleInitOptions(
	options: PlausibleAnalyticsOptions
): PlausibleInitOptions {
	const initOptions: PlausibleInitOptions = {};

	if (options.customProperties) {
		initOptions.customProperties = options.customProperties;
	}

	if (options.endpoint) {
		initOptions.endpoint = options.endpoint;
	}

	if (options.fileDownloads) {
		initOptions.fileDownloads = options.fileDownloads;
	}

	// Plausible's defaults (no hash routing, automatic pageviews) are left
	// out, so passing one builds the same call as leaving it unset.
	if (options.hashBasedRouting === true) {
		initOptions.hashBasedRouting = true;
	}

	if (options.autoCapturePageviews === false) {
		initOptions.autoCapturePageviews = false;
	}

	if (options.captureOnLocalhost !== undefined) {
		initOptions.captureOnLocalhost = options.captureOnLocalhost;
	}

	return initOptions;
};

/**
 * Plausible Analytics vendor manifest.
 *
 * Seeds a small queue stub so early `window.plausible(...)` calls can be
 * buffered before the real tracker loads. Plausible is cookieless and only
 * tracks page views, so the script is gated on `measurement` consent and is
 * unloaded when consent is revoked.
 */
export const plausibleAnalyticsManifest = {
	...vendorManifestContract,
	bootstrap: [
		{
			ifUndefined: true,

			name: 'plausible',
			properties: {
				o: '{{initOptions}}',
			},
			queue: {
				property: 'q',
			},
			queueFormat: 'array',
			type: 'defineStubFunction',
		},
	],
	category: 'measurement',
	install: [
		{
			attributes: {
				'data-api': '{{apiAttribute}}',

				'data-domain': '{{domain}}',
			},

			defer: true,
			src: 'https://plausible.io/js/{{scriptFile}}.js',
			type: 'loadScript',
		},
	],
	vendor: 'plausible-analytics',
	vendorDetails: {
		homepageUrl: 'https://plausible.io/',
		legalName: 'Plausible Insights OÜ',
		name: 'Plausible Analytics',
		privacyPolicyUrl: 'https://plausible.io/privacy',
	},
} as const satisfies VendorManifest;

export interface PlausibleAnalyticsOptions {
	/**
	 * Unique Plausible script ID for the new script format.
	 */
	scriptId?: string;

	/**
	 * Legacy domain-based site identifier.
	 */
	domain?: string;

	/**
	 * Legacy script extensions.
	 */
	extension?: PlausibleExtension | PlausibleExtension[];

	/**
	 * Properties tracked with each pageview.
	 */
	customProperties?: Record<string, unknown>;

	/**
	 * Custom tracking endpoint.
	 */
	endpoint?: string;

	/**
	 * File download tracking configuration.
	 */
	fileDownloads?: {
		fileExtensions?: string[];
	};

	/**
	 * Enable hash-based routing support.
	 */
	hashBasedRouting?: boolean;

	/**
	 * Disable automatic pageview capture when set to `false`.
	 */
	autoCapturePageviews?: boolean;

	/**
	 * Enable tracking on localhost.
	 */
	captureOnLocalhost?: boolean;

	/**
	 * Custom loader URL.
	 */
	scriptUrl?: string;
}

/**
 * Builds the serializable manifest behind {@link plausibleAnalytics}. Takes
 * `scriptId` and `domain` already trimmed, with at least one set. `scriptId`
 * wins and drops the `domain` and `endpoint` attributes.
 */
export const resolvePlausibleAnalyticsManifest =
	function resolvePlausibleAnalyticsManifest(
		options: Omit<PlausibleAnalyticsOptions, 'scriptUrl'>
	): ResolvedManifest {
		const { scriptId } = options;
		return getCompiledManifest(plausibleAnalyticsManifest, {
			apiAttribute: scriptId ? undefined : options.endpoint,
			domain: scriptId ? undefined : options.domain,
			initOptions: buildPlausibleInitOptions(options),
			scriptFile: buildPlausibleScriptFile(options),
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
		'plausibleAnalytics',
		{
			autoCapturePageviews: {
				default: true,
				kind: 'boolean',
				label: 'Track page views',
			},
			hashBasedRouting: {
				default: false,
				kind: 'boolean',
				label: 'Hash-based routing',
			},
			scriptId: {
				example: 'AbC123xYz',
				kind: 'id',
				label: 'Script ID',
				pattern: '^[A-Za-z0-9_-]+$',
				required: true,
			},
		},
		resolvePlausibleAnalyticsManifest
	);

/**
 * Creates a Plausible Analytics script.
 *
 * Models Plausible's queue bootstrap and loader attributes as an Inth-managed
 * script. Supports both the new `scriptId`-based loader and the legacy
 * `domain` + extension-based loader.
 *
 * @see https://plausible.io/docs/script-extensions
 *
 * @remarks When neither `scriptId` nor `domain` is set, the helper logs
 *   `plausibleAnalytics: missing scriptId or domain` with `console.error`
 *   and returns a script that never loads.
 *
 * @example
 * ```ts
 * import { plausibleAnalytics } from '@inth/integrations/plausible-analytics';
 *
 * plausibleAnalytics({
 *   domain: 'example.com',
 *   extension: ['file-downloads', 'outbound-links'],
 * });
 * ```
 */
export const plausibleAnalytics = function plausibleAnalytics({
	scriptUrl,
	...options
}: PlausibleAnalyticsOptions): Script {
	const scriptId = readId(options.scriptId);
	const domain = readId(options.domain);
	if (!scriptId && !domain) {
		return skipScript('plausibleAnalytics: missing scriptId or domain', {
			category: 'measurement',
			manifest: plausibleAnalyticsManifest,
		});
	}

	return withScriptUrl(
		resolvedManifestToScript(
			resolvePlausibleAnalyticsManifest({ ...options, domain, scriptId })
		),
		scriptUrl
	);
};
