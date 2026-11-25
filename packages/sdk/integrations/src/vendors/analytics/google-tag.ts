import type { AllConsentNames, Script } from '@inth/sdk/engine';

import { resolvedManifestToScript } from '../../engine/runtime';
import { getCompiledManifest } from '../../resolve';
import { runtimeDateValue, vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import {
	GOOGLE_CONSENT_MODE_V2_DEFAULT_MAPPING,
	GTAG_BOOTSTRAP,
	withOptionalConsentMapping,
} from '../_shared/google-consent';
import { readId, skipMissingId } from '../_shared/required-id';

declare global {
	interface Window {
		dataLayer: unknown[];
		gtag: (...args: unknown[]) => void;
	}
}

/**
 * Google Tag (gtag.js) vendor manifest.
 *
 * Similar to GTM but for direct Google product integration (Analytics, Ads, Floodlight).
 * Uses the same Consent Mode v2 mapping.
 */
export const gtagManifest = {
	...vendorManifestContract,
	alwaysLoad: true,
	bootstrap: GTAG_BOOTSTRAP,
	category: '{{category}}',
	consentMapping: GOOGLE_CONSENT_MODE_V2_DEFAULT_MAPPING,
	consentSignal: 'gtag',
	install: [
		{
			args: ['js', runtimeDateValue],

			global: 'gtag',
			type: 'callGlobal',
		},
		{
			args: ['config', '{{id}}'],

			global: 'gtag',
			type: 'callGlobal',
		},
		{
			async: true,

			src: 'https://www.googletagmanager.com/gtag/js?id={{id}}',
			type: 'loadScript',
		},
	],
	persistAfterConsentRevoked: true,
	vendor: 'gtag',
	vendorDetails: {
		homepageUrl: 'https://developers.google.com/tag-platform/gtagjs',
		legalName: 'Google LLC',
		name: 'Google Tag',
		privacyPolicyUrl: 'https://policies.google.com/privacy',
	},
} as const satisfies VendorManifest;

/** Google Tag manifest for `loadMode: 'after-consent'`. */
const gtagAfterConsentManifest = {
	...gtagManifest,
	alwaysLoad: undefined,
} as const satisfies VendorManifest;

/**
 * When the `gtag` helper requests `gtag/js` from Google.
 *
 * - `always`: on every page, before a choice. Consent Mode signals tell
 *   Google what the visitor allowed.
 * - `after-consent`: only once the helper's `category` is allowed.
 */
export type GtagLoadMode = 'always' | 'after-consent';

export interface GtagOptions {
	/** Parameters forwarded to gtag config. */
	config?: Record<string, unknown>;
	/**
	 * Your gtag id
	 * @example `G-XXXXXXX`
	 */
	id: string;

	/**
	 * The consent category to use for the gtag script. This is typically marketing (Ads & Floodlight) or measurement (Analytics)
	 *
	 * With `loadMode: 'after-consent'`, `gtag/js` waits for this category.
	 * @example 'marketing'
	 */
	category: AllConsentNames;

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
	 * When Inth loads `gtag/js`.
	 *
	 * - `always`: load on every page, before the visitor chooses. The helper
	 *   sends `gtag('consent', 'default', ...)` with the current permissions
	 *   before `config`, then `gtag('consent', 'update', ...)` on every change.
	 *   `category` does not delay loading.
	 * - `after-consent`: make no request to Google and create no `dataLayer`
	 *   until `category` is allowed. The script then loads once, with a
	 *   `consent` `default` command that reflects the current permissions sent
	 *   before `config`, and `update` commands on later changes. Google gets no
	 *   cookieless pings from visitors whose `category` is denied, so Consent
	 *   Mode cannot model their conversions.
	 *
	 * `after-consent` waits for `category` to be allowed, not for a recorded
	 * choice. Under an `opt-out` or `none` policy, optional categories are
	 * allowed before a choice, so the script loads on the first page.
	 * `necessary` is always allowed, so pair this mode with `measurement` or
	 * `marketing`.
	 *
	 * After a withdrawal Inth reloads the page by default. With
	 * `reloadOnConsentRevoked: false`, the loaded tag stays on the page and
	 * receives an `update` that denies the withdrawn types.
	 *
	 * @default 'always'
	 */
	loadMode?: GtagLoadMode;

	/**
	 * Deprecated script-level overrides preserved for backwards compatibility.
	 *
	 * Prefer manifest-backed options instead of this generic override bag.
	 * @deprecated
	 */
	script?: Partial<Script>;
}

/**
 * Builds the serializable manifest behind {@link gtag}. `id` must already be
 * a trimmed, non-empty tag ID.
 */
export const resolveGtagManifest = function resolveGtagManifest({
	id,
	config,
	category,
	consentMapping,
	loadMode = 'always',
}: Omit<GtagOptions, 'script'>): ResolvedManifest {
	const loadModeManifest =
		loadMode === 'after-consent' ? gtagAfterConsentManifest : gtagManifest;
	const base =
		config === undefined
			? loadModeManifest
			: {
					...loadModeManifest,
					install: loadModeManifest.install.map((step) =>
						step.type === 'callGlobal' && step.args[0] === 'config'
							? { ...step, args: ['config', '{{id}}', '{{config}}'] }
							: step
					),
				};

	return getCompiledManifest(withOptionalConsentMapping(base, consentMapping), {
		category,
		config,
		dataLayer: 'dataLayer',
		gtag: 'gtag',
		id,
	});
};

/**
 * Creates a Google Tag (gtag.js) script.
 * Allows you to send data website to linked Google products like Analytics, Ads & Floodlight.
 *
 * By default the script loads before a choice and passes Google Consent Mode
 * v2 signals. Set `loadMode: 'after-consent'` to keep every request to Google
 * waiting until `category` is allowed.
 *
 * @remarks When `id` is missing or blank, the
 *   helper logs `gtag: missing or invalid id` with
 *   `console.error` and returns a script that never loads.
 *
 * @example
 * ```ts
 * gtag({
 * 	id: 'G-XXXXXXXXXX',
 * 	category: 'measurement',
 * 	loadMode: 'after-consent',
 * });
 * ```
 */
export const gtag = function gtag({ script, ...options }: GtagOptions): Script {
	const normalizedId = readId(options.id);
	if (normalizedId === undefined) {
		return skipMissingId('gtag', 'id', {
			category: options.category,
			manifest: gtagManifest,
		});
	}

	const resolved = resolvedManifestToScript(
		resolveGtagManifest({ ...options, id: normalizedId })
	);

	if (!script) {
		return resolved;
	}

	return {
		...resolved,
		...script,
		attributes: {
			...(resolved.attributes ?? {}),
			...(script.attributes ?? {}),
		},
	};
};
