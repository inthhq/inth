import type { Script } from '@inth/sdk/engine';
import { amazonAdsScript } from '@inth/sdk/manifest-runtime/adapters/amazon-ads';
import type {
	AmazonAdsAdapterOptions,
	AmazonAdsConsent,
	AmazonAdsFunction,
} from '@inth/sdk/manifest-runtime/adapters/amazon-ads';

import { resolvedManifestToScript } from '../../engine/runtime';
import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { readId, skipMissingId } from '../_shared/required-id';
import { createScriptReuse } from '../_shared/reuse-script';
import {
	resolveScriptUrl,
	trimToUndefined,
	withScriptUrl,
} from '../_shared/script-url';

export type {
	AmazonAdsConsent,
	AmazonAdsFunction,
	AmazonAdsQueueEntry,
} from '@inth/sdk/manifest-runtime/adapters/amazon-ads';

declare global {
	interface Window {
		amzn?: AmazonAdsFunction;
		amznConsent?: (consent: AmazonAdsConsent) => void;
	}
}

/** Options for the Amazon Ads tag. */
export interface AmazonAdsTagOptions {
	/** Tag ID from the Amazon Ads console. */
	tagId: string;
	/** Region of the Amazon advertising account. @default 'NA' */
	region?: 'NA' | 'EU';
	/** Send one PageView after the tag is initialized. @default true */
	trackPageView?: boolean;
	/** Attributes passed to the initial PageView event. */
	pageViewAttributes?: Record<string, unknown>;
	/**
	 * Actual visitor country, as a two-letter ISO 3166-1 code.
	 * Enables the optional ACS helper. Omit when the country is unknown.
	 */
	countryCode?: string;
	/** Visitor IP address forwarded to ACS only when countryCode is supplied. */
	ipAddress?: string;
	/** Existing IAB GPP string forwarded to ACS. Inth does not create it. */
	gpp?: string;
	/** Override the main amzn.js URL. */
	scriptUrl?: string;
	/** Override the optional amzn-consent.js URL. */
	consentScriptUrl?: string;
}

/**
 * Amazon Ads metadata and main loader. The Amazon Ads adapter in `@inth/sdk`
 * runs Amazon's timestamped queue under consent.
 *
 * @see https://github.com/amzn/ads-pao-amznjs-gtm-template
 * @see https://advertising.amazon.com/legal/product-terms
 */
export const amazonAdsTagManifest = {
	...vendorManifestContract,
	category: 'marketing',
	install: [
		{
			async: true,
			src: 'https://c.amazon-adsystem.com/aat/amzn.js',
			type: 'loadScript',
		},
	],
	observeConsentBeforeLoad: true,
	persistAfterConsentRevoked: true,
	vendor: 'amazon-ads',
	vendorDetails: {
		homepageUrl: 'https://advertising.amazon.com/',
		legalName: 'Amazon Advertising LLC',
		name: 'Amazon Ads',
		privacyPolicyUrl:
			'https://www.amazon.com/gp/help/customer/display.html?nodeId=GX7NJQ4ZB8MHFRNJ',
	},
} as const satisfies VendorManifest;

/**
 * The manifest for Amazon Ads: amzn.js from Amazon's host, and the Amazon
 * Ads adapter with the tag it adds. The npm helper and the Inth server both
 * build it here.
 */
export const resolveAmazonAdsTagManifest =
	function resolveAmazonAdsTagManifest({
		region,
		tagId,
		trackPageView,
	}: Pick<
		AmazonAdsTagOptions,
		'region' | 'tagId' | 'trackPageView'
	>): ResolvedManifest {
		const options: AmazonAdsAdapterOptions = {
			region: region ?? 'NA',
			tagId,
			trackPageView: trackPageView !== false,
		};
		return {
			...getCompiledManifest(amazonAdsTagManifest, {}),
			adapter: { id: 'amazon-ads', options: { ...options } },
			requires: 4,
		};
	};

/**
 * What the Inth server may set for Amazon Ads. The visitor's country, IP
 * address and GPP string are per-visitor values, PageView attributes take
 * free keys, and the script URLs are the site's own: all npm-only.
 * Marked pure so a bundler drops it from an npm bundle that never reads it.
 */
export const remote =
	/* @__PURE__ */
	defineRemote(
		'amazonAdsTag',
		{
			region: {
				default: 'NA',
				kind: 'enum',
				label: 'Region of the Amazon advertising account',
				values: ['NA', 'EU'],
			},
			tagId: {
				example: '00000000-0000-0000-0000-000000000000',
				kind: 'id',
				label: 'Tag ID',
				pattern:
					'^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$',
				required: true,
			},
			trackPageView: {
				default: true,
				kind: 'boolean',
				label: 'Send a PageView once the tag starts',
			},
		},
		resolveAmazonAdsTagManifest
	);

const createAmazonAdsTag = (options: AmazonAdsTagOptions): Script => {
	const { adapter, ...manifest } = resolveAmazonAdsTagManifest(options);
	return amazonAdsScript(
		// The site's own amzn.js URL is npm-only.
		withScriptUrl(resolvedManifestToScript(manifest), options.scriptUrl),
		adapter?.options as unknown as AmazonAdsAdapterOptions,
		{
			consentScriptUrl: resolveScriptUrl(
				options.consentScriptUrl,
				'https://c.amazon-adsystem.com/aat/amzn-consent.js'
			),
			countryCode: trimToUndefined(options.countryCode)?.toUpperCase(),
			gpp: options.gpp,
			ipAddress: options.ipAddress,
			pageViewAttributes: options.pageViewAttributes,
		}
	);
};

const reuseAmazonAdsTag = createScriptReuse<AmazonAdsTagOptions>();

/**
 * Loads Amazon Ads after marketing consent, with optional Amazon Consent Signal.
 *
 * @returns A marketing-gated script retaining its loaders after revocation.
 * @remarks Blank tag IDs log an error and return a script that never loads.
 * ACS requires the visitor's actual country. Both ACS permissions follow the
 * script's consent gate. Denial forwards withdrawal, but Amazon supplies no
 * documented shutdown command. Reload after revocation to stop the runtime.
 * Distinct active ACS configurations preserve permission while any is granted.
 * Removing the last permitted ACS configuration forwards denial.
 * @example
 * ```ts
 * amazonAdsTag({ tagId: 'YOUR_TAG_ID', region: 'EU', countryCode: 'DE' });
 * ```
 */
export const amazonAdsTag = (options: AmazonAdsTagOptions): Script => {
	const tagId = readId(options?.tagId);
	if (tagId === undefined) {
		return skipMissingId('amazonAdsTag', 'tagId', {
			category: 'marketing',
			manifest: amazonAdsTagManifest,
		});
	}
	return reuseAmazonAdsTag({ ...options, tagId }, createAmazonAdsTag);
};
