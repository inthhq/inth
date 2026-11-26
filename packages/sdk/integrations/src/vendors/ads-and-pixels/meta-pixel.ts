import type { Script } from '@inth/sdk/engine';

import { resolvedManifestToScript } from '../../engine/runtime';
import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { buildQueuePixelInstall } from '../_shared/install-builders';
import { readId, skipMissingId } from '../_shared/required-id';
import { resolveScriptUrl } from '../_shared/script-url';

export interface FbqContent {
	id: string | number;
	quantity: number;
	[key: string]: unknown;
}

export interface FbqBaseEventParams {
	content_category?: string;
	content_ids?: (string | number)[];
	content_name?: string;
	content_type?: 'product' | 'product_group';
	contents?: FbqContent[];
	currency?: string;
	delivery_category?: 'in_store' | 'curbside' | 'home_delivery';
	num_items?: number;
	predicted_ltv?: number;
	search_string?: string;
	status?: boolean;
	value?: number;
}

export type FbqCustomParams = Record<string, unknown>;
type WithCustomParams<TParams> = TParams & FbqCustomParams;

type AddPaymentInfoParams = WithCustomParams<
	Pick<FbqBaseEventParams, 'content_ids' | 'contents' | 'currency' | 'value'>
>;
type AddToCartParams = WithCustomParams<
	Pick<
		FbqBaseEventParams,
		'content_ids' | 'content_type' | 'contents' | 'currency' | 'value'
	>
>;
type AddToWishlistParams = WithCustomParams<
	Pick<FbqBaseEventParams, 'content_ids' | 'contents' | 'currency' | 'value'>
>;
type CompleteRegistrationParams = WithCustomParams<
	Pick<FbqBaseEventParams, 'currency' | 'value' | 'status'>
>;
type InitiateCheckoutParams = WithCustomParams<
	Pick<
		FbqBaseEventParams,
		'content_ids' | 'contents' | 'currency' | 'num_items' | 'value'
	>
>;
type LeadParams = WithCustomParams<
	Pick<FbqBaseEventParams, 'currency' | 'value'>
>;
type PageViewParams = FbqCustomParams;

type SearchParams = WithCustomParams<
	Pick<
		FbqBaseEventParams,
		| 'content_ids'
		| 'content_type'
		| 'contents'
		| 'currency'
		| 'search_string'
		| 'value'
	>
>;
type StartTrialParams = WithCustomParams<
	Pick<FbqBaseEventParams, 'currency' | 'predicted_ltv' | 'value'>
>;
type SubscribeParams = WithCustomParams<
	Pick<FbqBaseEventParams, 'currency' | 'predicted_ltv' | 'value'>
>;
type ViewContentParams = WithCustomParams<
	Pick<
		FbqBaseEventParams,
		'content_ids' | 'content_type' | 'contents' | 'currency' | 'value'
	>
>;

/** Meta requires `currency` and `value` on `Purchase`. */
type PurchaseParams = WithCustomParams<
	Pick<
		FbqBaseEventParams,
		'content_ids' | 'content_type' | 'contents' | 'num_items'
	> &
		Required<Pick<FbqBaseEventParams, 'currency' | 'value'>>
>;

/** Meta lists no specific properties for these events. */
type ContactParams = WithCustomParams<FbqBaseEventParams>;
type CustomizeProductParams = WithCustomParams<FbqBaseEventParams>;
type DonateParams = WithCustomParams<FbqBaseEventParams>;
type FindLocationParams = WithCustomParams<FbqBaseEventParams>;
type ScheduleParams = WithCustomParams<FbqBaseEventParams>;
type SubmitApplicationParams = WithCustomParams<FbqBaseEventParams>;

export interface StandardEventParams {
	AddPaymentInfo: AddPaymentInfoParams;
	AddToCart: AddToCartParams;
	AddToWishlist: AddToWishlistParams;
	CompleteRegistration: CompleteRegistrationParams;
	Contact: ContactParams;
	CustomizeProduct: CustomizeProductParams;
	Donate: DonateParams;
	FindLocation: FindLocationParams;
	InitiateCheckout: InitiateCheckoutParams;
	Lead: LeadParams;
	PageView: PageViewParams;
	Purchase: PurchaseParams;
	Schedule: ScheduleParams;
	Search: SearchParams;
	StartTrial: StartTrialParams;
	SubmitApplication: SubmitApplicationParams;
	Subscribe: SubscribeParams;
	ViewContent: ViewContentParams;
}

export type StandardEventName = keyof StandardEventParams;

export interface MetaPixelEventOptions {
	/**
	 * Event ID used to deduplicate browser events against Conversions API events.
	 *
	 * @see https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events
	 */
	eventID?: string;
	[key: string]: unknown;
}

export interface MetaPixelDataProcessingOptions {
	/**
	 * Data processing flags sent to Meta before `init`.
	 *
	 * Use `['LDU']` to enable Limited Data Use, or `[]` to explicitly disable it.
	 */
	options: 'LDU'[] | [];

	/**
	 * Meta country code. Use `0` to let Meta geolocate the event or `1` for USA.
	 */
	country?: number;

	/**
	 * Meta state code. Use `0` to let Meta geolocate the event.
	 *
	 * @example `1000` for California
	 */
	state?: number;
}

declare global {
	interface Window {
		fbq: {
			(
				command: 'dataProcessingOptions',
				options: MetaPixelDataProcessingOptions['options'],
				country?: number,
				state?: number
			): void;
			(
				command: 'init',
				pixelId: string,
				options?: Record<string, unknown>
			): void;
			(
				command: 'track',
				eventName: StandardEventName,
				params?: StandardEventParams[StandardEventName],
				options?: MetaPixelEventOptions
			): void;
			(
				command: 'trackCustom',
				eventName: string,
				params?: FbqCustomParams,
				options?: MetaPixelEventOptions
			): void;
			(
				command: 'trackSingle',
				pixelId: string,
				eventName: StandardEventName,
				params?: StandardEventParams[StandardEventName],
				options?: MetaPixelEventOptions
			): void;
			(
				command: 'trackSingleCustom',
				pixelId: string,
				eventName: string,
				params?: FbqCustomParams,
				options?: MetaPixelEventOptions
			): void;
			(command: 'consent', action: 'grant' | 'revoke'): void;
			(...args: unknown[]): void;
		};
		_fbq: Window['fbq'];
	}
}

/**
 * Meta Pixel vendor manifest. Consent changes go through Meta's
 * `fbq('consent', 'grant'|'revoke')` API.
 */
export const metaPixelManifest = {
	...vendorManifestContract,
	bootstrap: [
		{
			aliases: ['_fbq'],
			dispatchProperty: 'callMethod',
			ifUndefined: true,

			name: 'fbq',
			properties: {
				loaded: true,
				version: '2.0',
			},
			queue: {
				property: 'queue',
			},
			selfReferences: ['push'],
			type: 'defineStubFunction',
		},
	],
	category: 'marketing',
	install: [
		{
			args: ['consent', 'grant'],

			global: 'fbq',
			type: 'callGlobal',
		},
		{
			args: ['init', '{{pixelId}}'],

			global: 'fbq',
			type: 'callGlobal',
		},
		{
			args: ['track', 'PageView'],

			global: 'fbq',
			type: 'callGlobal',
		},
		{
			async: true,

			// oxlint-disable-next-line integrations/fixed-script-host -- pending conversion: the site's scriptSrc option can set the whole URL
			src: '{{scriptSrc}}',
			type: 'loadScript',
		},
	],
	onConsentDenied: [
		{
			args: ['consent', 'revoke'],

			global: 'fbq',
			type: 'callGlobal',
		},
	],
	onConsentGranted: [
		{
			args: ['consent', 'grant'],

			global: 'fbq',
			type: 'callGlobal',
		},
	],
	persistAfterConsentRevoked: true,
	vendor: 'meta-pixel',
	vendorDetails: {
		homepageUrl: 'https://www.facebook.com/business/tools/meta-pixel',
		name: 'Meta Pixel',
		privacyPolicyUrl: 'https://www.facebook.com/privacy/policy/',
	},
} as const satisfies VendorManifest;

export interface MetaPixelOptions {
	/**
	 * Your Meta Pixel ID
	 * @example `123456789012345`
	 */
	pixelId: string;

	/** Optional payload passed as the third argument to `fbq('init', ...)`. */
	initOptions?: Record<string, unknown>;

	/**
	 * Queue the default `PageView` event during setup.
	 *
	 * @default true
	 */
	trackPageView?: boolean;

	/**
	 * Optional Meta data processing options, such as Limited Data Use.
	 *
	 * When provided, Inth queues `fbq('dataProcessingOptions', ...)` before
	 * `fbq('init', ...)`.
	 */
	dataProcessingOptions?: MetaPixelDataProcessingOptions;

	/** Meta Pixel loader URL. */
	scriptSrc?: string;
}

const getMetaPixelDataProcessingArgs = function getMetaPixelDataProcessingArgs({
	options,
	country,
	state,
}: MetaPixelDataProcessingOptions): unknown[] {
	const args: unknown[] = ['dataProcessingOptions', options];

	if (country !== undefined || state !== undefined) {
		args.push(country ?? 0, state ?? 0);
	}

	return args;
};

const getMetaPixelPageViewStep = function getMetaPixelPageViewStep(
	trackPageView: boolean
): { args: unknown[] } | undefined {
	if (trackPageView) {
		return {
			args: ['track', 'PageView'],
		};
	}

	return undefined;
};

const buildMetaPixelInstall = function buildMetaPixelInstall({
	hasInitOptions,
	trackPageView,
	dataProcessingOptions,
}: {
	hasInitOptions: boolean;
	trackPageView: boolean;
	dataProcessingOptions?: MetaPixelDataProcessingOptions;
}): VendorManifest['install'] {
	const initArgs: unknown[] = ['init', '{{pixelId}}'];

	if (hasInitOptions) {
		initArgs.push('{{initOptions}}');
	}

	const install = buildQueuePixelInstall({
		global: 'fbq',
		initArgs,
		scriptPlaceholder: '{{scriptSrc}}',
		trackStep: getMetaPixelPageViewStep(trackPageView),
	});

	if (dataProcessingOptions !== undefined) {
		install.unshift({
			args: getMetaPixelDataProcessingArgs(dataProcessingOptions),
			global: 'fbq',
			type: 'callGlobal',
		});
	}

	install.unshift({
		args: ['consent', 'grant'],
		global: 'fbq',
		type: 'callGlobal',
	});

	return install;
};

/**
 * Builds the serializable manifest behind {@link metaPixel}. `pixelId` must
 * already be a trimmed, non-empty pixel ID.
 */
export const resolveMetaPixelManifest = function resolveMetaPixelManifest({
	pixelId,
	initOptions,
	trackPageView = true,
	dataProcessingOptions,
	scriptSrc,
}: MetaPixelOptions): ResolvedManifest {
	const install = buildMetaPixelInstall({
		dataProcessingOptions,
		hasInitOptions: initOptions !== undefined,
		trackPageView,
	});

	const manifest = {
		...metaPixelManifest,
		install,
	} as const satisfies VendorManifest;

	return getCompiledManifest(manifest, {
		initOptions,
		pixelId,
		scriptSrc: resolveScriptUrl(
			scriptSrc,
			'https://connect.facebook.net/en_US/fbevents.js'
		),
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
		'metaPixel',
		{
			pixelId: {
				example: '123456789012345',
				kind: 'id',
				label: 'Pixel ID',
				pattern: '^[0-9]+$',
				required: true,
			},
		},
		resolveMetaPixelManifest
	);

/**
 * Creates a Meta Pixel script.
 *
 * @remarks When `pixelId` is missing or blank, the
 *   helper logs `metaPixel: missing or invalid pixelId` with
 *   `console.error` and returns a script that never loads.
 *
 * @example
 * ```ts
 * const metaPixelScript = metaPixel({
 *   pixelId: '123456789012345',
 * });
 * ```
 *
 * @see {@link https://developers.facebook.com/docs/meta-pixel/get-started} Meta Pixel documentation
 */
export const metaPixel = function metaPixel(options: MetaPixelOptions): Script {
	const normalizedPixelId = readId(options.pixelId);
	if (normalizedPixelId === undefined) {
		return skipMissingId('metaPixel', 'pixelId', {
			category: 'marketing',
			manifest: metaPixelManifest,
		});
	}

	return resolvedManifestToScript(
		resolveMetaPixelManifest({ ...options, pixelId: normalizedPixelId })
	);
};

const callFbq = function callFbq(...args: unknown[]): void {
	if (typeof window === 'undefined' || typeof window.fbq !== 'function') {
		return;
	}

	(window.fbq as (...fbqArgs: unknown[]) => void)(...args);
};

const resolveMetaPixelEventOptions = function resolveMetaPixelEventOptions(
	eventOptions?: MetaPixelEventOptions | string
): MetaPixelEventOptions | undefined {
	if (typeof eventOptions === 'string') {
		return {
			eventID: eventOptions,
		};
	}

	return eventOptions;
};

/**
 * Tracks a Meta Pixel standard event.
 *
 * Calls `fbq('track', ...)`. Does nothing until the pixel is set up after
 * marketing consent; events sent before then are dropped, not queued.
 *
 * @param eventOptions - Event options, or an event ID string.
 *
 * @example
 * ```ts
 * metaPixelEvent('Purchase', { value: 10.0, currency: 'USD' }, 'event-123');
 * ```
 *
 * @see {@link https://developers.facebook.com/docs/meta-pixel/reference} Meta Pixel documentation
 */
export const metaPixelEvent = <TEventName extends StandardEventName>(
	eventName: TEventName,
	params?: StandardEventParams[TEventName],
	eventOptions?: MetaPixelEventOptions | string
): void =>
	callFbq(
		'track',
		eventName,
		params,
		resolveMetaPixelEventOptions(eventOptions)
	);

/**
 * Tracks a Meta Pixel custom event. Does nothing until the pixel is set up
 * after marketing consent; events sent before then are dropped, not queued.
 *
 * @param eventOptions - Event options, or a Conversions API event ID string.
 */
export const metaPixelCustomEvent = (
	eventName: string,
	params?: FbqCustomParams,
	eventOptions?: MetaPixelEventOptions | string
): void =>
	callFbq(
		'trackCustom',
		eventName,
		params,
		resolveMetaPixelEventOptions(eventOptions)
	);

/**
 * Tracks a standard event for a single Meta Pixel ID.
 *
 * Use this when multiple Meta Pixels are initialized on the same page and the
 * event should not fire for every initialized pixel. Does nothing until the
 * pixel is set up after marketing consent; earlier events are dropped.
 *
 * @param eventOptions - Event options, or an event ID string.
 *
 * @example
 * ```ts
 * metaPixelSingleEvent(
 * 	'123456',
 * 	'Purchase',
 * 	{ value: 9.99, currency: 'USD' },
 * 	'event-123'
 * );
 * ```
 */
export const metaPixelSingleEvent = <TEventName extends StandardEventName>(
	pixelId: string,
	eventName: TEventName,
	params?: StandardEventParams[TEventName],
	eventOptions?: MetaPixelEventOptions | string
): void =>
	callFbq(
		'trackSingle',
		pixelId,
		eventName,
		params,
		resolveMetaPixelEventOptions(eventOptions)
	);

/**
 * Tracks a custom event for a single Meta Pixel ID.
 *
 * Use this when multiple Meta Pixels are initialized on the same page and the
 * custom event should not fire for every initialized pixel. Does nothing
 * until the pixel is set up after marketing consent; earlier events are dropped.
 *
 * @param eventOptions - Event options, or an event ID string.
 *
 * @example
 * ```ts
 * metaPixelSingleCustomEvent('123456', 'MyCustomEvent', { foo: 'bar' });
 * ```
 */
export const metaPixelSingleCustomEvent = (
	pixelId: string,
	eventName: string,
	params?: FbqCustomParams,
	eventOptions?: MetaPixelEventOptions | string
): void =>
	callFbq(
		'trackSingleCustom',
		pixelId,
		eventName,
		params,
		resolveMetaPixelEventOptions(eventOptions)
	);
