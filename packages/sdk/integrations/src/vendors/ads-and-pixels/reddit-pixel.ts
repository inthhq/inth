import type { Script } from '@inth/sdk/engine';

import { resolvedManifestToScript } from '../../engine/runtime';
import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { buildQueuePixelInstall } from '../_shared/install-builders';
import { readId, skipMissingId } from '../_shared/required-id';
import { withScriptUrl } from '../_shared/script-url';

/**
 * Reddit Pixel standard conversion event names.
 *
 * @see {@link https://business.reddithelp.com/s/article/supported-conversion-events | Reddit supported conversion events}
 */
export type RedditPixelEventName =
	| 'PageVisit'
	| 'ViewContent'
	| 'Search'
	| 'AddToCart'
	| 'AddToWishlist'
	| 'Purchase'
	| 'Lead'
	| 'SignUp';

/**
 * Controls Reddit Pixel automatic advanced matching signals.
 *
 * @see {@link https://business.reddithelp.com/s/article/reddit-pixel | Reddit Pixel setup}
 */
export interface RedditPixelAdvancedMatchingOptions {
	/** Automatically scan page content for email addresses. */
	email?: boolean;

	/** Automatically scan page content for phone numbers. */
	phone_number?: boolean;
}

/**
 * Reddit Pixel initialization options.
 *
 * @see {@link https://business.reddithelp.com/s/article/reddit-pixel | Reddit Pixel setup}
 * @see {@link https://business.reddithelp.com/s/article/Limited-Data-Use | Reddit Limited Data Use}
 */
export interface RedditPixelInitOptions {
	/**
	 * Opt the user out of Reddit Pixel tracking.
	 *
	 * Reddit sends this as `opt_out=1` on pixel requests.
	 */
	optOut?: boolean;

	/**
	 * Disable Reddit first-party cookies during initialization.
	 */
	disableFirstPartyCookies?: boolean;

	/** Email address or SHA-256 email hash for attribution matching. */
	email?: string;

	/** Phone number or SHA-256 phone hash for attribution matching. */
	phoneNumber?: string;

	/** External user identifier or SHA-256 hash for attribution matching. */
	externalId?: string;

	/** Android Advertising ID or SHA-256 hash. */
	aaid?: string;

	/** iOS Identifier for Advertisers or SHA-256 hash. */
	idfa?: string;

	/** Automatic advanced matching controls. */
	aam?: RedditPixelAdvancedMatchingOptions;

	/**
	 * Data processing mode, including Reddit Limited Data Use values.
	 *
	 * @see {@link https://business.reddithelp.com/s/article/Limited-Data-Use | Reddit Limited Data Use}
	 */
	dpm?: string | string[];

	/**
	 * Data processing country code.
	 *
	 * @see {@link https://business.reddithelp.com/s/article/Limited-Data-Use | Reddit Limited Data Use}
	 */
	dpcc?: string;

	/**
	 * Data processing region code.
	 *
	 * @see {@link https://business.reddithelp.com/s/article/Limited-Data-Use | Reddit Limited Data Use}
	 */
	dprc?: string;

	/** Integration partner name. */
	partner?: string;

	/** Integration partner version. */
	partner_version?: string;

	/** Source integration name reported to Reddit. */
	integration?: 'reddit' | 'gtm' | (string & Record<never, never>);

	/** Enable Reddit Pixel debug logging. */
	debug?: boolean;

	/**
	 * Send monetary `value` metadata as `valueDecimal`.
	 *
	 * @default true
	 */
	useDecimalCurrencyValues?: boolean;

	[key: string]: unknown;
}

/**
 * Metadata supported by Reddit Pixel conversion events.
 *
 * @see {@link https://business.reddithelp.com/s/article/about-event-metadata | Reddit event metadata}
 * @see {@link https://business.reddithelp.com/s/article/manual-conversion-events-with-the-reddit-pixel | Reddit manual conversion events}
 */
export interface RedditPixelEventMetadata {
	itemCount?: number | string;
	value?: number | string;
	valueDecimal?: number | string;
	currency?: string;
	transactionId?: string;
	customEventName?: string;
	products?:
		| string
		| {
				id?: string | number;
				name?: string;
				category?: string;
				quantity?: number | string;
				itemPrice?: number | string;
		  }[];
	/**
	 * Conversion ID used to deduplicate Pixel events against Conversions API
	 * events.
	 *
	 * @see {@link https://business.reddithelp.com/s/article/event-deduplication | Reddit event deduplication}
	 */
	conversionId?: string;
	[key: string]: unknown;
}

interface RedditPixelFunction {
	(command: 'init', pixelId: string, options?: RedditPixelInitOptions): void;
	(command: 'enableFirstPartyCookies' | 'disableFirstPartyCookies'): void;
	(
		command: 'track',
		eventName: RedditPixelEventName | (string & Record<never, never>),
		properties?: RedditPixelEventMetadata
	): void;
	(command: string, ...args: unknown[]): void;
}

declare global {
	interface Window {
		rdt?: RedditPixelFunction & {
			callQueue?: unknown[][];
			sendEvent?: (...args: unknown[]) => void;
		};
	}
}

/**
 * Reddit Pixel vendor manifest.
 */
export const redditPixelManifest = {
	...vendorManifestContract,
	bootstrap: [
		{
			dispatchProperty: 'sendEvent',
			ifUndefined: true,

			name: 'rdt',
			queue: {
				property: 'callQueue',
			},
			queueFormat: 'array',
			type: 'defineStubFunction',
		},
	],
	category: 'marketing',
	install: [
		{
			args: ['init', '{{pixelId}}'],

			global: 'rdt',
			type: 'callGlobal',
		},
		{
			args: ['track', 'PageVisit'],

			global: 'rdt',
			type: 'callGlobal',
		},
		{
			async: true,
			src: 'https://www.redditstatic.com/ads/pixel.js',
			type: 'loadScript',
		},
	],
	onConsentDenied: [
		{
			args: ['disableFirstPartyCookies'],

			global: 'rdt',
			type: 'callGlobal',
		},
	],
	onConsentGranted: [
		{
			args: ['enableFirstPartyCookies'],

			global: 'rdt',
			type: 'callGlobal',
		},
	],
	persistAfterConsentRevoked: true,
	vendor: 'reddit-pixel',
	vendorDetails: {
		homepageUrl: 'https://www.business.reddit.com/',
		name: 'Reddit Pixel',
		privacyPolicyUrl: 'https://www.reddit.com/policies/privacy-policy',
	},
} as const satisfies VendorManifest;

export interface RedditPixelOptions {
	/**
	 * Your Reddit Pixel ID.
	 * @example `t2_abcdef`
	 */
	pixelId: string;

	/**
	 * Queue the standard `PageVisit` event during setup.
	 * @default true
	 */
	trackPageVisit?: boolean;

	/**
	 * Optional payload passed as the third argument to `rdt('init', ...)`.
	 */
	initOptions?: RedditPixelInitOptions;

	/**
	 * Disable Reddit first-party cookies during setup.
	 *
	 * This is merged into `initOptions.disableFirstPartyCookies`.
	 */
	disableFirstPartyCookies?: boolean;

	/** Reddit Pixel loader URL. */
	scriptUrl?: string;
}

const getRedditPixelInitOptions = function getRedditPixelInitOptions({
	initOptions,
	disableFirstPartyCookies,
}: {
	initOptions?: RedditPixelInitOptions;
	disableFirstPartyCookies?: boolean;
}): RedditPixelInitOptions | undefined {
	if (disableFirstPartyCookies === undefined) {
		return initOptions;
	}

	return {
		...initOptions,
		disableFirstPartyCookies,
	};
};

/**
 * Builds the serializable manifest behind {@link redditPixel}. `pixelId` must
 * already be a trimmed, non-empty pixel ID.
 */
export const resolveRedditPixelManifest = function resolveRedditPixelManifest({
	pixelId,
	trackPageVisit = true,
	initOptions,
	disableFirstPartyCookies,
}: Omit<RedditPixelOptions, 'scriptUrl'>): ResolvedManifest {
	let trackStep: { args: unknown[] } | undefined;

	if (trackPageVisit) {
		trackStep = {
			args: ['track', 'PageVisit'],
		};
	}

	const resolvedInitOptions = getRedditPixelInitOptions({
		disableFirstPartyCookies,
		initOptions,
	});
	const initArgs: unknown[] = ['init', '{{pixelId}}'];
	if (resolvedInitOptions !== undefined) {
		initArgs.push('{{initOptions}}');
	}

	const install = buildQueuePixelInstall({
		global: 'rdt',
		initArgs,
		loadScript: {
			async: true,
			src: 'https://www.redditstatic.com/ads/pixel.js',
			type: 'loadScript',
		},
		trackStep,
	});

	const manifest = {
		...redditPixelManifest,
		install,
	} as const satisfies VendorManifest;

	return getCompiledManifest(manifest, {
		initOptions: resolvedInitOptions,
		pixelId,
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
		'redditPixel',
		{
			disableFirstPartyCookies: {
				default: false,
				kind: 'boolean',
				label: 'Disable first-party cookies',
			},
			pixelId: {
				example: 'a2_abcdef123456',
				kind: 'id',
				label: 'Pixel ID',
				pattern: '^[A-Za-z0-9_]+$',
				required: true,
			},
			trackPageVisit: {
				default: true,
				kind: 'boolean',
				label: 'Track page visits',
			},
		},
		resolveRedditPixelManifest
	);

/**
 * Creates a Reddit Pixel script.
 *
 * @remarks When `pixelId` is missing or blank, the
 *   helper logs `redditPixel: missing or invalid pixelId` with
 *   `console.error` and returns a script that never loads.
 */
export const redditPixel = function redditPixel({
	scriptUrl,
	...options
}: RedditPixelOptions): Script {
	const normalizedPixelId = readId(options.pixelId);
	if (normalizedPixelId === undefined) {
		return skipMissingId('redditPixel', 'pixelId', {
			category: 'marketing',
			manifest: redditPixelManifest,
		});
	}

	return withScriptUrl(
		resolvedManifestToScript(
			resolveRedditPixelManifest({ ...options, pixelId: normalizedPixelId })
		),
		scriptUrl
	);
};

/**
 * Tracks a Reddit Pixel event.
 *
 * @param metadata - Optional event metadata, including `conversionId` for
 * Pixel plus Conversions API deduplication.
 */
export const redditPixelEvent = (
	eventName: RedditPixelEventName | (string & Record<never, never>),
	metadata?: RedditPixelEventMetadata
) => {
	if (typeof window === 'undefined' || typeof window.rdt !== 'function') {
		return;
	}

	window.rdt('track', eventName, metadata);
};
