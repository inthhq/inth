import type { Script } from '@inth/sdk/engine';

import { resolvedManifestToScript } from '../../engine/runtime';
import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { buildQueuePixelInstall } from '../_shared/install-builders';
import { readId, skipMissingId } from '../_shared/required-id';
import { withScriptUrl } from '../_shared/script-url';

export type SnapchatPixelEventName =
	| 'PAGE_VIEW'
	| 'VIEW_CONTENT'
	| 'ADD_CART'
	| 'PURCHASE'
	| 'SIGN_UP'
	| 'SAVE'
	| 'START_CHECKOUT'
	| 'APP_OPEN'
	| 'ADD_BILLING'
	| 'SEARCH'
	| 'SUBSCRIBE'
	| 'AD_CLICK'
	| 'AD_VIEW'
	| 'COMPLETE_TUTORIAL'
	| 'LEVEL_COMPLETE'
	| 'INVITE'
	| 'LOGIN'
	| 'SHARE'
	| 'RESERVE'
	| 'ACHIEVEMENT_UNLOCKED'
	| 'ADD_TO_WISHLIST'
	| 'SPENT_CREDITS'
	| 'RATE'
	| 'START_TRIAL'
	| 'LIST_VIEW';

export interface SnapchatPixelEventProperties {
	/** Total monetary value for commerce events such as `PURCHASE`. */
	price?: number;

	/**
	 * Event identifier used to deduplicate browser Pixel events against
	 * server-side Conversions API events.
	 */
	client_dedup_id?: string;

	/** ISO 4217 currency code, for example `USD`. */
	currency?: string;

	/** Transaction/order identifier for purchase events. */
	transaction_id?: string;

	/** Product, SKU, or content identifiers associated with the event. */
	item_ids?: string[];

	/** Product or content category associated with the event. */
	item_category?: string;

	/** Free-form description for the event. */
	description?: string;

	/** Query text for `SEARCH` events. */
	search_string?: string;

	/** Number of items represented by the event. */
	number_items?: number;

	/** Whether payment information was available, represented as `0` or `1`. */
	payment_info_available?: 0 | 1;

	/** Signup method for `SIGN_UP` events. */
	sign_up_method?: string;

	/** Whether the action succeeded, represented as `0` or `1`. */
	success?: 0 | 1;

	/** Brand names associated with the event contents. */
	brands?: string[];

	/** Fulfillment method for commerce events. */
	delivery_method?: 'in_store' | 'curbside' | 'delivery';

	/** Customer lifecycle status associated with the event. */
	customer_status?: 'new' | 'returning' | 'reactivated';

	/** Optional custom tag for event segmentation in Snapchat. */
	event_tag?: string;

	[key: string]: unknown;
}

interface SnapchatPixelFunction {
	(
		command: 'track',
		eventName: SnapchatPixelEventName | (string & Record<never, never>),
		properties?: SnapchatPixelEventProperties
	): void;
	(command: 'init', pixelId: string, config?: Record<string, unknown>): void;
	(command: string, ...args: unknown[]): void;
}

declare global {
	interface Window {
		snaptr?: SnapchatPixelFunction & {
			handleRequest?: (...args: unknown[]) => void;
			loaded?: boolean;
			push?: Window['snaptr'];
			queue?: unknown[][];
			version?: string;
		};
		_snaptr?: Window['snaptr'];
	}
}

/**
 * Snapchat Pixel vendor manifest.
 */
export const snapchatPixelManifest = {
	...vendorManifestContract,
	bootstrap: [
		{
			aliases: ['_snaptr'],
			dispatchProperty: 'handleRequest',
			ifUndefined: true,

			name: 'snaptr',
			properties: {
				loaded: true,
				version: '1.0',
			},
			queue: {
				property: 'queue',
			},
			queueFormat: 'array',
			selfReferences: ['push'],
			type: 'defineStubFunction',
		},
	],
	category: 'marketing',
	install: [
		{
			args: ['init', '{{pixelId}}'],

			global: 'snaptr',
			type: 'callGlobal',
		},
		{
			args: ['track', 'PAGE_VIEW'],

			global: 'snaptr',
			type: 'callGlobal',
		},
		{
			async: true,
			src: 'https://sc-static.net/scevent.min.js',
			type: 'loadScript',
		},
	],
	vendor: 'snapchat-pixel',
	vendorDetails: {
		homepageUrl: 'https://forbusiness.snapchat.com/',
		legalName: 'Snap Inc.',
		name: 'Snap Pixel',
		privacyPolicyUrl: 'https://values.snap.com/privacy/privacy-policy',
	},
} as const satisfies VendorManifest;

export interface SnapchatPixelOptions {
	/**
	 * Your Snapchat Pixel ID.
	 * @example `123456789012345`
	 */
	pixelId: string;

	/** Optional init payload passed to `snaptr('init', ...)`. */
	initOptions?: Record<string, unknown>;

	/**
	 * Queue the default `PAGE_VIEW` event during setup.
	 * @default true
	 */
	trackPageView?: boolean;

	/** Snapchat Pixel loader URL. */
	scriptUrl?: string;
}

/**
 * Builds the serializable manifest behind {@link snapchatPixel}. `pixelId`
 * must already be a trimmed, non-empty pixel ID.
 */
export const resolveSnapchatPixelManifest =
	function resolveSnapchatPixelManifest({
		pixelId,
		initOptions,
		trackPageView = true,
	}: Omit<SnapchatPixelOptions, 'scriptUrl'>): ResolvedManifest {
		const initArgs: unknown[] = ['init', '{{pixelId}}'];
		if (initOptions !== undefined) {
			initArgs.push('{{initOptions}}');
		}

		let trackStep: { args: unknown[] } | undefined;

		if (trackPageView) {
			trackStep = {
				args: ['track', 'PAGE_VIEW'],
			};
		}

		const install = buildQueuePixelInstall({
			global: 'snaptr',
			initArgs,
			loadScript: {
				async: true,
				src: 'https://sc-static.net/scevent.min.js',
				type: 'loadScript',
			},
			trackStep,
		});

		const manifest = {
			...snapchatPixelManifest,
			install,
		} as const satisfies VendorManifest;

		return getCompiledManifest(manifest, { initOptions, pixelId });
	};

/**
 * What the Inth server may set for this vendor. The npm helper calls the same
 * resolver; its other options stay npm-only. Marked pure so a bundler drops
 * it from an npm bundle that never reads it.
 */
export const remote =
	/* @__PURE__ */
	defineRemote(
		'snapchatPixel',
		{
			pixelId: {
				example: '0b5d6a3e-2f1c-4e8a-9d7b-1a2b3c4d5e6f',
				kind: 'id',
				label: 'Pixel ID',
				pattern:
					'^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$',
				required: true,
			},
			trackPageView: {
				default: true,
				kind: 'boolean',
				label: 'Track page views',
			},
		},
		resolveSnapchatPixelManifest
	);

/**
 * Creates a Snapchat Pixel script.
 *
 * @param options.pixelId - Snapchat Pixel ID used in `snaptr('init', ...)`.
 *   Expected format is a numeric string (commonly 15 digits), for example
 *   `'123456789012345'`. This value is required and should come directly from
 *   Snapchat Ads Manager.
 * @param options.initOptions - Optional object passed as the third argument to
 *   `snaptr('init', pixelId, initOptions)`, for advanced initialization values.
 *   Example: `{ user_email: 'user@example.com', user_phone_number: '+15551234567' }`.
 * @remarks When `pixelId` is missing or blank, the
 *   helper logs `snapchatPixel: missing or invalid pixelId` with
 *   `console.error` and returns a script that never loads.
 *
 * Edge cases:
 * - Non-numeric or malformed `pixelId` values may initialize incorrectly in
 *   Snapchat even if local script construction succeeds.
 *
 * @example
 * ```ts
 * const script = snapchatPixel({
 * 	pixelId: '123456789012345',
 * 	initOptions: {
 * 		user_email: 'user@example.com',
 * 		user_phone_number: '+15551234567',
 * 	},
 * 	trackPageView: false,
 * });
 * ```
 */
export const snapchatPixel = function snapchatPixel({
	scriptUrl,
	...options
}: SnapchatPixelOptions): Script {
	const normalizedPixelId = readId(options.pixelId);
	if (normalizedPixelId === undefined) {
		return skipMissingId('snapchatPixel', 'pixelId', {
			category: 'marketing',
			manifest: snapchatPixelManifest,
		});
	}

	return withScriptUrl(
		resolvedManifestToScript(
			resolveSnapchatPixelManifest({ ...options, pixelId: normalizedPixelId })
		),
		scriptUrl
	);
};

/**
 * Tracks a Snapchat Pixel event.
 *
 * @param properties - Optional event properties, including
 *   `client_dedup_id` for Pixel plus Conversions API deduplication.
 *
 * @example
 * ```ts
 * snapchatPixelEvent('PURCHASE', {
 * 	price: 99,
 * 	currency: 'USD',
 * 	transaction_id: 'order-123',
 * 	client_dedup_id: 'event-123',
 * });
 * ```
 */
export const snapchatPixelEvent = (
	eventName: SnapchatPixelEventName | (string & Record<never, never>),
	properties?: SnapchatPixelEventProperties
) => {
	if (typeof window === 'undefined' || typeof window.snaptr !== 'function') {
		return;
	}

	window.snaptr('track', eventName, properties);
};
