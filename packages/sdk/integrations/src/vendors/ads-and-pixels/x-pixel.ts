import type { Script } from '@inth/sdk/engine';

import { resolvedManifestToScript } from '../../engine/runtime';
import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { readId, skipMissingId } from '../_shared/required-id';
import { withScriptUrl } from '../_shared/script-url';

export interface XPixelContent {
	/**
	 * Type of the content
	 * @example "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Beds"
	 * @see https://www.google.com/basepages/producttype/taxonomy.en-US.txt
	 */
	content_type?: string;
	/**
	 * ID of the content
	 * For product catalog users: please pass SKU
	 * For all other users: Please pass Global Trade Item Number (GTIN) if available, otherwise pass SKU
	 * @example "1234567890"
	 */
	content_id: string;
	/**
	 * Name of a product or service
	 * @example "Cat Bed"
	 */
	content_name?: string;

	/**
	 * Price of a product or service
	 * @example 10.00
	 */
	content_price?: number;
	/**
	 * Quantity of the content
	 * @example 1
	 */
	num_items?: number;
	/**
	 * ID associated with a group of product variants
	 * @example "1234567890"
	 */
	content_group_id?: string;
}
export interface XPixelEvent {
	/**
	 * Total value of the conversion event (ex: $ value of the transaction in case of a purchase, etc.)
	 * @example 10.00
	 */
	value?: number;
	/**
	 * Currency of the conversion event
	 * ISO 4217 code (ex: USD, EUR, JPY, etc.)
	 * @example USD
	 */
	currency?: string;
	/**
	 * Unique identifier for the event that can be used for deduplication purposes
	 * @example tw-xxxx-xxxx
	 */
	conversion_id?: string;
	/**
	 * Search string of the conversion event
	 * @example "search query"
	 */
	search_string?: string;
	/**
	 * Description of the conversion event
	 * @example "purchase"
	 */
	description?: string;
	/**
	 * twclid of the conversion event
	 * The X Pixel already automatically passes twclid from URL or first-party cookie. This parameter can be optionally used to force attribution to a certain ad click.
	 * @example "twclid"
	 */
	twclid?: string;
	/**
	 * Status of the conversion event
	 * Should be set to values like "started" or "completed".
	 * @example "completed"
	 */
	status?: 'started' | 'completed';
	/**
	 * Email address used for user matching.
	 * The X Pixel hashes this value before transmission.
	 * @example "[email protected]"
	 */
	email_address?: string;
	/**
	 * Phone number used for user matching.
	 * Include country code in E.164 format (for example, +11234567890).
	 * The X Pixel hashes this value before transmission.
	 * @example "+11234567890"
	 */
	phone_number?: string;

	/**
	 * Content/products associated with the conversion event
	 * @example [{content_id: 'OT001', content_name: 'bird seed', content_price: 50, num_items: 1}]
	 * @see {@link XPixelContent}
	 */
	contents?: XPixelContent[];
}

declare global {
	interface Window {
		twq?: (event: string, ...args: unknown[]) => void;
	}
}

/**
 * X (Twitter) Pixel vendor manifest. X has no consent API, so the script
 * loads only with consent.
 */
export const xPixelManifest = {
	...vendorManifestContract,
	bootstrap: [
		{
			dispatchProperty: 'exe',
			ifUndefined: true,
			name: 'twq',
			properties: {
				version: '1.1',
			},
			queue: {
				property: 'queue',
			},
			type: 'defineStubFunction',
		},
	],
	category: 'marketing',
	install: [
		{
			args: ['config', '{{pixelId}}'],
			global: 'twq',
			type: 'callGlobal',
		},
		{
			async: true,
			src: 'https://static.ads-twitter.com/uwt.js',
			type: 'loadScript',
		},
	],
	vendor: 'x-pixel',
	vendorDetails: {
		homepageUrl: 'https://business.x.com/',
		name: 'X Pixel',
		privacyPolicyUrl: 'https://x.com/privacy',
	},
} as const satisfies VendorManifest;

export interface XPixelOptions {
	/**
	 * Your X Pixel ID
	 * @example `123456789012345`
	 */
	pixelId: string;

	/** X Pixel loader URL. */
	scriptSrc?: string;
}

/**
 * Builds the serializable manifest behind {@link xPixel}. `pixelId` must
 * already be a trimmed, non-empty pixel ID.
 */
export const resolveXPixelManifest = function resolveXPixelManifest({
	pixelId,
}: Omit<XPixelOptions, 'scriptSrc'>): ResolvedManifest {
	return getCompiledManifest(xPixelManifest, { pixelId });
};

/**
 * What the Inth server may set for this vendor. The npm helper calls the same
 * resolver; its other options stay npm-only. Marked pure so a bundler drops
 * it from an npm bundle that never reads it.
 */
export const remote =
	/* @__PURE__ */
	defineRemote(
		'xPixel',
		{
			pixelId: {
				example: 'o1a2b',
				kind: 'id',
				label: 'Pixel ID',
				pattern: '^[A-Za-z0-9]+$',
				required: true,
			},
		},
		resolveXPixelManifest
	);

/**
 * Creates an X Pixel script.
 * This script loads only when consent is granted.
 * X Pixel does not expose a consent update API, so Inth treats it as a standard consent-gated loader.
 *
 * @remarks When `pixelId` is missing or blank, the
 *   helper logs `xPixel: missing or invalid pixelId` with
 *   `console.error` and returns a script that never loads.
 *
 * @example
 * ```ts
 * const xPixelScript = xPixel({
 *   pixelId: '123456789012345',
 * });
 * ```
 *
 * @see {@link https://business.x.com/en/help/campaign-measurement-and-analytics/conversion-tracking-for-websites} X conversion tracking documentation
 */
export const xPixel = function xPixel({
	pixelId,
	scriptSrc,
}: XPixelOptions): Script {
	const normalizedPixelId = readId(pixelId);
	if (normalizedPixelId === undefined) {
		return skipMissingId('xPixel', 'pixelId', {
			category: 'marketing',
			manifest: xPixelManifest,
		});
	}

	return withScriptUrl(
		resolvedManifestToScript(
			resolveXPixelManifest({ pixelId: normalizedPixelId })
		),
		scriptSrc
	);
};

/**
 * Tracks an X Pixel conversion event.
 *
 * @param eventId - Event ID from X Ads Manager, for example `tw-xxxx-xxxx`.
 *
 * @example
 * ```ts
 * xPixelEvent('tw-xxxx-xxxx', {
 *   value: 200.00,
 *   currency: 'USD',
 *   contents: [
 *     {content_id: 'OT001', content_name: 'bird seed', content_price: 50, num_items: 1},
 *     {content_id: 'OT002', content_name: 'bird cage', content_price: 150, num_items: 1}
 *   ]
 * });
 * ```
 *
 * @see {@link https://business.x.com/en/help/campaign-measurement-and-analytics/conversion-tracking-for-websites#event-types-and-parameters}
 *
 * @remarks
 * Does nothing when `window.twq` is missing, which is the case until
 * marketing consent is granted and the X Pixel is set up. Events sent before
 * then are dropped, not queued.
 */
export const xPixelEvent = (eventId: string, metadata?: XPixelEvent): void => {
	if (typeof window === 'undefined' || typeof window.twq !== 'function') {
		return;
	}

	window.twq('event', eventId, metadata);
};
