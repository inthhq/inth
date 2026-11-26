import type { Script } from '@inth/sdk/engine';

import { resolvedManifestToScript } from '../../engine/runtime';
import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { readId, skipMissingId, skipScript } from '../_shared/required-id';

declare global {
	interface Window {
		adobeDataLayer?: unknown[];
		_satellite?: Record<string, unknown>;
	}
}

interface AdobeAnalyticsManifestOptions {
	async: boolean;
	/**
	 * Load the embed from Adobe's host, built from the embed IDs. Otherwise the
	 * npm helper's `scriptUrl` fills the step.
	 */
	adobeHosted: boolean;
	seedAdobeDataLayer: boolean;
}

const getAdobeAnalyticsScriptUrlProblem =
	function getAdobeAnalyticsScriptUrlProblem(
		scriptUrl: string
	): string | undefined {
		let parsed: URL;
		try {
			parsed = new URL(scriptUrl);
		} catch {
			return 'adobeAnalytics: invalid scriptUrl - must be a valid https URL from your Adobe Data Collection embed code';
		}

		if (parsed.protocol !== 'https:') {
			return 'adobeAnalytics: invalid scriptUrl - must use https: from your Adobe Data Collection embed code';
		}

		return undefined;
	};

const createAdobeAnalyticsManifest = function createAdobeAnalyticsManifest(
	options: AdobeAnalyticsManifestOptions
): VendorManifest {
	const install: VendorManifest['install'] = [];

	if (options.seedAdobeDataLayer) {
		install.push({
			ifUndefined: true,
			name: 'adobeDataLayer',
			type: 'setGlobal',
			value: [],
		});
	}

	if (options.adobeHosted) {
		install.push({
			async: options.async,
			src: 'https://assets.adobedtm.com/{{companyId}}/{{propertyId}}/launch-{{environmentId}}.min.js',
			type: 'loadScript',
		});
	} else {
		install.push({
			async: options.async,
			// oxlint-disable-next-line integrations/fixed-script-host -- npm-only: the site's own embed URL, which may be self-hosted
			src: '{{scriptUrl}}',
			type: 'loadScript',
		});
	}

	return {
		...vendorManifestContract,
		category: 'measurement',
		install,
		vendor: 'adobe-analytics',
		vendorDetails: {
			legalName: 'Adobe Inc.',
			name: 'Adobe Analytics',
			privacyPolicyUrl: 'https://www.adobe.com/privacy/policy.html',
		},
	};
};

/**
 * Adobe Analytics vendor manifest.
 *
 * Loads the Adobe Experience Platform Data Collection Tags embed script for a
 * specific property environment. Adobe does not provide a generic public
 * loader; each customer copies their own environment URL from Data Collection,
 * commonly hosted at `https://assets.adobedtm.com/.../launch-*.min.js`.
 */
export const adobeAnalyticsManifest = createAdobeAnalyticsManifest({
	adobeHosted: true,
	async: true,
	seedAdobeDataLayer: true,
});

const skippedAdobeAnalyticsScript = {
	category: 'measurement',
	manifest: adobeAnalyticsManifest,
} as const;

/**
 * The IDs in an Adobe-hosted Tags embed URL:
 * `https://assets.adobedtm.com/{companyId}/{propertyId}/launch-{environmentId}.min.js`.
 */
export interface AdobeAnalyticsEmbedIds {
	/** The first path segment of the embed URL. */
	companyId: string;
	/** The second path segment of the embed URL. */
	propertyId: string;
	/**
	 * The part between `launch-` and `.min.js`, including a `-development` or
	 * `-staging` suffix.
	 */
	environmentId: string;
}

/** The embed URL from the site's own Adobe Tags embed code. */
export interface AdobeAnalyticsEmbedUrl {
	/**
	 * Adobe Experience Platform Data Collection web property embed URL.
	 *
	 * This must be the full `https:` URL from your Adobe Tags environment embed
	 * code, commonly shaped like
	 * `https://assets.adobedtm.com/{org}/{property}/launch-{env}.min.js`.
	 * Self-hosted Launch/Tags embeds are supported as long as they use `https:`.
	 */
	scriptUrl: string;
}

/**
 * Adobe Analytics options: the embed URL, or the IDs of an Adobe-hosted
 * embed. When both are set, `scriptUrl` wins.
 */
export type AdobeAnalyticsOptions = AdobeAnalyticsLoadOptions &
	(AdobeAnalyticsEmbedUrl | AdobeAnalyticsEmbedIds);

/** How the Adobe Tags library loads. */
export interface AdobeAnalyticsLoadOptions {
	/**
	 * Load the Adobe Tags library asynchronously.
	 *
	 * Adobe recommends asynchronous deployment for most web properties. Set this
	 * to `false` only for legacy synchronous setups that require ordered blocking
	 * behavior.
	 * @default true
	 */
	async?: boolean;

	/**
	 * Seed the Adobe Client Data Layer queue before the Tags library loads.
	 *
	 * When enabled, Inth creates `window.adobeDataLayer = []` only when the
	 * global is still undefined. This matches Adobe Client Data Layer's default
	 * object name and is harmless for properties that do not use the extension.
	 * @default true
	 */
	seedAdobeDataLayer?: boolean;
}

/**
 * Builds the serializable manifest behind {@link adobeAnalytics} for an
 * Adobe-hosted embed. The IDs must already be trimmed and non-empty.
 */
export const resolveAdobeAnalyticsManifest =
	function resolveAdobeAnalyticsManifest({
		companyId,
		propertyId,
		environmentId,
		async = true,
		seedAdobeDataLayer = true,
	}: AdobeAnalyticsEmbedIds & AdobeAnalyticsLoadOptions): ResolvedManifest {
		return getCompiledManifest(
			createAdobeAnalyticsManifest({
				adobeHosted: true,
				async,
				seedAdobeDataLayer,
			}),
			{ companyId, environmentId, propertyId }
		);
	};

/**
 * What the Inth server may set for this vendor. The npm helper calls the same
 * resolver; its other options stay npm-only. Marked pure so a bundler drops
 * it from an npm bundle that never reads it.
 */
export const remote =
	/* @__PURE__ */
	defineRemote(
		'adobeAnalytics',
		{
			async: {
				default: true,
				kind: 'boolean',
				label: 'Load asynchronously',
			},
			companyId: {
				example: 'a7d65461e54e',
				kind: 'id',
				label: 'Company ID',
				pattern: '^[A-Za-z0-9]+$',
				required: true,
			},
			environmentId: {
				example: 'f3a2b1c0d9e8',
				kind: 'id',
				label: 'Environment ID',
				pattern: '^[A-Za-z0-9]+(?:-(?:development|staging))?$',
				required: true,
			},
			propertyId: {
				example: '01d650ac6ffb',
				kind: 'id',
				label: 'Property ID',
				pattern: '^[A-Za-z0-9]+$',
				required: true,
			},
			seedAdobeDataLayer: {
				default: true,
				kind: 'boolean',
				label: 'Create the Adobe Client Data Layer',
			},
		},
		resolveAdobeAnalyticsManifest
	);

/** The embed IDs, trimmed, or undefined when one is missing or blank. */
const readEmbedIds = function readEmbedIds(
	options: AdobeAnalyticsOptions
): AdobeAnalyticsEmbedIds | undefined {
	if (!('companyId' in options)) {
		return undefined;
	}
	const companyId = readId(options.companyId);
	const propertyId = readId(options.propertyId);
	const environmentId = readId(options.environmentId);
	return companyId && propertyId && environmentId
		? { companyId, environmentId, propertyId }
		: undefined;
};

/**
 * Creates an Adobe Analytics script.
 *
 * @see https://experienceleague.adobe.com/en/docs/experience-platform/tags/publish/environments/environments
 * @see https://experienceleague.adobe.com/en/docs/experience-platform/tags/extensions/client/client-data-layer/overview
 *
 * @remarks
 * When `scriptUrl` is missing, blank, invalid, or not `https:`, the helper
 * logs the problem with `console.error` and returns a script that never
 * loads. Copy the full web property embed URL from Adobe Data Collection and
 * pass it as `scriptUrl`.
 *
 * Adobe Analytics is commonly deployed through Adobe Experience Platform Data
 * Collection Tags (formerly Launch). The loaded property may in turn load Adobe
 * Analytics, Web SDK, or other extensions and rules, so configure those Adobe
 * rules to respect your consent model too.
 *
 * @example
 * ```ts
 * import { adobeAnalytics } from '@inth/integrations/adobe-analytics';
 *
 * adobeAnalytics({
 *   scriptUrl:
 *     'https://assets.adobedtm.com/YOUR_ORG/YOUR_PROPERTY/launch-production.min.js',
 * });
 * ```
 */
export const adobeAnalytics = function adobeAnalytics(
	options: AdobeAnalyticsOptions
): Script {
	const async = options.async ?? true;
	const seedAdobeDataLayer = options.seedAdobeDataLayer ?? true;
	const scriptUrl =
		'scriptUrl' in options ? readId(options.scriptUrl) : undefined;
	if (scriptUrl === undefined) {
		const ids = readEmbedIds(options);
		if (ids === undefined) {
			return skipMissingId(
				'adobeAnalytics',
				'scriptUrl',
				skippedAdobeAnalyticsScript
			);
		}
		return resolvedManifestToScript(
			resolveAdobeAnalyticsManifest({ ...ids, async, seedAdobeDataLayer })
		);
	}

	const problem = getAdobeAnalyticsScriptUrlProblem(scriptUrl);
	if (problem !== undefined) {
		return skipScript(problem, skippedAdobeAnalyticsScript);
	}

	return resolvedManifestToScript(
		getCompiledManifest(
			createAdobeAnalyticsManifest({
				adobeHosted: false,
				async,
				seedAdobeDataLayer,
			}),
			{ scriptUrl }
		)
	);
};
