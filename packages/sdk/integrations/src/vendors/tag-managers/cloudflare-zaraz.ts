import type { AllConsentNames, Script } from '@inth/sdk/engine';
import { cloudflareZarazScript } from '@inth/sdk/manifest-runtime/adapters/cloudflare-zaraz';
import type { CloudflareZarazAdapterOptions } from '@inth/sdk/manifest-runtime/adapters/cloudflare-zaraz';

import { resolvedManifestToScript } from '../../engine/runtime';
import { defineRemote } from '../../remote-define';
import type { RemoteOptionValues } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';

export type { ZarazConsentApi } from '@inth/sdk/manifest-runtime/adapters/cloudflare-zaraz';

export interface CloudflareZarazOptions {
	/** Map Inth categories to purpose IDs from the Zaraz dashboard. */
	purposes: Partial<Record<AllConsentNames, readonly string[]>>;
	/** Hide the currently visible Zaraz modal. Disable auto-display in Zaraz too. @default true */
	hideBuiltInModal?: boolean;
	/** Replay Zaraz's queued pageview events after a denied purpose becomes allowed. @default true */
	sendQueuedEvents?: boolean;
	/**
	 * Called once after the first successful synchronization. With automatic
	 * pageviews disabled in Zaraz, send the initial Pageview from this callback.
	 */
	onReady?: () => void;
	/** Called when synchronization fails. Retried on the next consent update or readiness event. */
	onError?: (error: unknown) => void;
}

/**
 * Zaraz runs from Cloudflare's edge, so the manifest loads nothing. The
 * Cloudflare Zaraz adapter in `@inth/sdk` keeps Zaraz's purposes in step
 * with Inth consent. Like the manifest helpers, the vendor slug lets
 * visitors turn Zaraz off inside a granted category.
 */
export const cloudflareZarazManifest = {
	...vendorManifestContract,
	alwaysLoad: true,
	category: 'necessary',
	install: [],
	vendor: 'cloudflare-zaraz',
	vendorDetails: {
		homepageUrl: 'https://developers.cloudflare.com/zaraz/',
		legalName: 'Cloudflare, Inc.',
		name: 'Cloudflare Zaraz',
		privacyPolicyUrl: 'https://www.cloudflare.com/privacypolicy/',
	},
} as const satisfies VendorManifest;

/**
 * The manifest for Zaraz: no script, and the Cloudflare Zaraz adapter with
 * the purpose mapping. The npm helper and the Inth server both build it
 * here.
 */
export const resolveCloudflareZarazManifest =
	function resolveCloudflareZarazManifest({
		hideBuiltInModal,
		purposes,
		sendQueuedEvents,
	}: Omit<CloudflareZarazOptions, 'onError' | 'onReady'>): ResolvedManifest {
		const options: CloudflareZarazAdapterOptions = {
			hideBuiltInModal: hideBuiltInModal !== false,
			purposes: Object.fromEntries(
				Object.entries(purposes).map(([category, ids]) => [
					category,
					[...(ids ?? [])],
				])
			),
			sendQueuedEvents: sendQueuedEvents !== false,
		};
		return {
			...getCompiledManifest(cloudflareZarazManifest, {}),
			adapter: {
				id: 'cloudflare-zaraz',
				options: options as unknown as NonNullable<
					ResolvedManifest['adapter']
				>['options'],
			},
			requires: 4,
		};
	};

const cloudflareZarazRemoteOptions = {
	hideBuiltInModal: {
		default: true,
		kind: 'boolean',
		label: 'Hide the Zaraz consent modal',
	},
	purposes: {
		keyExample: 'aBcD',
		keyPattern: '^[A-Za-z0-9_-]{1,64}$',
		kind: 'map',
		label: 'Zaraz purpose IDs and the Inth category each follows',
		maxEntries: 50,
		required: true,
		values: [
			'necessary',
			'functionality',
			'experience',
			'measurement',
			'marketing',
		],
	},
	sendQueuedEvents: {
		default: true,
		kind: 'boolean',
		label: "Replay Zaraz's queued events after a purpose is allowed",
	},
} as const;

/** The manifest for options a dashboard set: purpose IDs to categories. */
const resolveCloudflareZarazRemote = ({
	purposes,
	...options
}: RemoteOptionValues<
	typeof cloudflareZarazRemoteOptions
>): ResolvedManifest => {
	const byCategory: Partial<Record<AllConsentNames, string[]>> = {};
	for (const [purpose, category] of Object.entries(purposes)) {
		(byCategory[category] ??= []).push(purpose);
	}
	return resolveCloudflareZarazManifest({ ...options, purposes: byCategory });
};

/**
 * What the Inth server may set for Zaraz: the purpose mapping, keyed by
 * Zaraz purpose ID, and the two switches. `onReady` and `onError` are the
 * site's own functions, so npm-only. Marked pure so a bundler drops it
 * from an npm bundle that never reads it.
 */
export const remote =
	/* @__PURE__ */
	defineRemote(
		'cloudflareZaraz',
		cloudflareZarazRemoteOptions,
		resolveCloudflareZarazRemote
	);

/**
 * Synchronize Inth effective permissions with externally loaded Zaraz tools.
 * Does not load Zaraz or configure tools. Unmapped Zaraz purposes are denied.
 * The script's vendor slug is `cloudflare-zaraz`; while a visitor has that
 * vendor turned off, every purpose mapped to an optional category is denied.
 * Disable automatic pageviews and send the first Pageview from onReady to avoid
 * running tools with a stale Zaraz consent cookie before synchronization.
 *
 * @returns A callback-only script for the existing Inth script loader.
 * @throws {Error} If the mapping is empty, contains blank IDs, or maps an ID twice.
 * @example
 * ```ts
 * cloudflareZaraz({ purposes: { measurement: ['analytics-purpose'] } });
 * ```
 */
export const cloudflareZaraz = (options: CloudflareZarazOptions): Script => {
	const { adapter, ...manifest } = resolveCloudflareZarazManifest(options);
	return cloudflareZarazScript(
		resolvedManifestToScript(manifest),
		adapter?.options as unknown as CloudflareZarazAdapterOptions,
		{
			// oxlint-disable-next-line integrations/no-vendor-callbacks -- npm-only: passes the site's onError function to the adapter, not a script callback
			onError: options.onError,
			onReady: options.onReady,
		}
	);
};
