import type { AllConsentNames, HasCondition, Script } from '@inth/sdk/engine';

import { resolvedManifestToScript } from '../../engine/runtime';
import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { runtimeTimestampValue, vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import {
	GOOGLE_CONSENT_MODE_V2_DEFAULT_MAPPING,
	GTAG_BOOTSTRAP,
	withOptionalConsentMapping,
} from '../_shared/google-consent';
import { loadModeOption } from '../_shared/remote-options';
import { readId, skipMissingId } from '../_shared/required-id';

/**
 * Google Tag Manager vendor manifest. `dataLayer` and `gtag` name the
 * container's queue and its gtag function, and `layerQuery` is the `&l=`
 * query `gtm.js` needs for a queue not named `dataLayer`. The container
 * element names its queue in `data-inth-layer`.
 */
export const googleTagManagerManifest = {
	...vendorManifestContract,
	alwaysLoad: true,
	bootstrap: GTAG_BOOTSTRAP,
	category: 'necessary',
	consentMapping: GOOGLE_CONSENT_MODE_V2_DEFAULT_MAPPING,
	consentSignal: 'gtag',
	consentSignalTarget: '{{gtag}}',
	install: [
		{
			queue: '{{dataLayer}}',
			type: 'pushToQueue',
			value: {
				event: 'gtm.js',

				'gtm.start': runtimeTimestampValue,
			},
		},
		{
			async: true,
			attributes: { 'data-inth-layer': '{{dataLayer}}' },

			src: 'https://www.googletagmanager.com/gtm.js?id={{id}}{{layerQuery}}',
			type: 'loadScript',
		},
	],
	onConsentChange: [
		{
			args: ['event', '{{updateEventName}}'],

			global: '{{gtag}}',
			type: 'callGlobal',
		},
	],
	vendor: 'google-tag-manager',
	vendorDetails: {
		homepageUrl: 'https://marketingplatform.google.com/about/tag-manager/',
		legalName: 'Google LLC',
		name: 'Google Tag Manager',
		privacyPolicyUrl: 'https://policies.google.com/privacy',
	},
} as const satisfies VendorManifest;

/**
 * When the `googleTagManager` helper requests `gtm.js` from Google.
 *
 * - `always`: on every page, before a choice. Consent Mode signals tell
 *   Google what the visitor allowed.
 * - `after-consent`: only once the helper's `category` is allowed.
 */
export type GoogleTagManagerLoadMode = 'always' | 'after-consent';

/**
 * Google Tag Manager manifest for `loadMode: 'after-consent'`.
 *
 * A container usually holds measurement tags, such as Google Analytics, and
 * marketing tags, such as Google Ads. Loading it once either is allowed lets
 * each tag run for a visitor who allowed only its purpose, while Consent Mode
 * keeps Google tags from using the purpose that is still denied.
 *
 * Removing gtm.js does not stop a running container. Keeping the element
 * lets a later grant reuse it instead of starting a second container.
 */
const googleTagManagerAfterConsentManifest = {
	...googleTagManagerManifest,
	alwaysLoad: undefined,
	category: { or: ['measurement', 'marketing'] },
	persistAfterConsentRevoked: true,
} as const satisfies VendorManifest;

export interface GoogleTagManagerOptions {
	/** Container queue name. Defaults to dataLayer. */
	dataLayer?: string;
	/**
	 * Your Google Tag Manager container ID. Begins with 'GTM-'.
	 * @example `GTM-1234XXX`
	 */
	id: string;

	/**
	 * Custom event name fired after consent updates.
	 * Can be used as a trigger in GTM to load scripts once consent is updated.
	 *
	 * @default 'consent-update'
	 */
	updateEventName?: string;

	/**
	 * Custom mapping from Inth consent categories to Google Consent Mode v2 types.
	 * Overrides the default mapping when provided.
	 *
	 * @default
	 * ```ts
	 * {
	 *   necessary: ['security_storage'],
	 *   functionality: ['functionality_storage'],
	 *   measurement: ['analytics_storage'],
	 *   marketing: ['ad_storage', 'ad_user_data', 'ad_personalization'],
	 *   experience: ['personalization_storage'],
	 * }
	 * ```
	 */
	consentMapping?: Record<string, string[]>;

	/**
	 * When Inth loads `gtm.js`.
	 *
	 * - `always`: load on every page, before the visitor chooses. The helper
	 *   sends `gtag('consent', 'default', ...)` with the current permissions
	 *   before the container starts, then `gtag('consent', 'update', ...)` and
	 *   the `updateEventName` event on every change.
	 * - `after-consent`: make no request to Google and create no `dataLayer`
	 *   until `category` is allowed. The container then loads once, with a
	 *   `consent` `default` command that reflects the current permissions sent
	 *   before the `gtm.js` start event. Later changes send `update` and the
	 *   `updateEventName` event. Google gets no cookieless pings from visitors
	 *   whose `category` is denied, so Consent Mode cannot model their
	 *   conversions.
	 *
	 * `after-consent` waits for `category` to be allowed, not for a recorded
	 * choice. Under an `opt-out` or `none` policy, optional categories are
	 * allowed before a choice, so the container loads on the first page.
	 *
	 * After a withdrawal Inth reloads the page by default. With
	 * `reloadOnConsentRevoked: false`, the loaded container stays on the page
	 * and receives an `update` that denies the withdrawn types.
	 *
	 * @default 'always'
	 */
	loadMode?: GoogleTagManagerLoadMode;

	/**
	 * Consent condition for the container script.
	 *
	 * With `loadMode: 'always'` it sets the permission that callbacks receive
	 * and does not delay loading. With `loadMode: 'after-consent'` the container
	 * loads once it holds. The default for that mode loads the container when
	 * the visitor allows measurement or marketing, because a container usually
	 * holds tags for both. Google tags inside it still follow the Consent Mode
	 * signals for each type; other tags need consent checks in the container.
	 * Use `'measurement'` for a container that holds only analytics tags.
	 *
	 * @default `'necessary'` with `loadMode: 'always'`, and
	 * `{ or: ['measurement', 'marketing'] }` with `loadMode: 'after-consent'`
	 */
	category?: HasCondition<AllConsentNames>;
}

/**
 * Builds the serializable manifest behind {@link googleTagManager}. `id`
 * must already be a trimmed, non-empty container ID.
 */
export const resolveGoogleTagManagerManifest =
	function resolveGoogleTagManagerManifest({
		id,
		dataLayer = 'dataLayer',
		updateEventName,
		consentMapping,
		loadMode = 'always',
		category,
	}: GoogleTagManagerOptions): ResolvedManifest {
		const loadModeManifest =
			loadMode === 'after-consent'
				? googleTagManagerAfterConsentManifest
				: googleTagManagerManifest;
		const manifest =
			category === undefined
				? loadModeManifest
				: { ...loadModeManifest, category };
		const custom = dataLayer !== 'dataLayer';

		return getCompiledManifest(
			withOptionalConsentMapping(manifest, consentMapping),
			{
				dataLayer,
				gtag: custom ? `${dataLayer}Gtag` : 'gtag',
				id,
				layerQuery: custom ? `&l=${encodeURIComponent(dataLayer)}` : '',
				updateEventName: updateEventName ?? 'consent-update',
			}
		);
	};

/**
 * What the Inth server may set for this vendor. The npm helper calls the same
 * resolver; its other options stay npm-only.
 */
export const remote = defineRemote(
	'googleTagManager',
	{
		id: {
			example: 'GTM-ABC1234',
			kind: 'id',
			label: 'Container ID',
			pattern: '^GTM-[A-Z0-9]+$',
			required: true,
		},
		loadMode: loadModeOption,
	},
	resolveGoogleTagManagerManifest
);

/**
 * Creates a Google Tag Manager script.
 * GTM can be used for managing the consent of other scripts via Google Tag Manager consent mode.
 * We recommend using Inth's script loader instead so your script logic is centralised.
 *
 * By default the container loads before a choice and passes Google Consent
 * Mode v2 signals. Set `loadMode: 'after-consent'` to keep every request to
 * Google waiting until `category` is allowed.
 *
 * @remarks When `id` is missing or blank, the
 *   helper logs `googleTagManager: missing or invalid id` with
 *   `console.error` and returns a script that never loads.
 *
 * @example
 * ```ts
 * googleTagManager({ id: 'GTM-XXXXXXX', loadMode: 'after-consent' });
 * ```
 */
export const googleTagManager = function googleTagManager(
	options: GoogleTagManagerOptions
): Script {
	const normalizedId = readId(options.id);
	if (normalizedId === undefined) {
		// Keep the category so it stays in the consent scope while the ID is
		// missing. A copy, so this script's category never changes the
		// manifest's.
		return skipMissingId('googleTagManager', 'id', {
			category:
				options.category ??
				structuredClone(
					(options.loadMode === 'after-consent'
						? googleTagManagerAfterConsentManifest
						: googleTagManagerManifest
					).category
				),
			manifest: googleTagManagerManifest,
		});
	}

	return resolvedManifestToScript(
		resolveGoogleTagManagerManifest({ ...options, id: normalizedId })
	);
};
