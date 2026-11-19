import type { ManifestStep } from '../../types';

/**
 * The gtag.js snippet: a `{{dataLayer}}` queue and a `{{gtag}}` function
 * that pushes onto it, each defined only when the page has none. A
 * manifest that uses it passes `dataLayer` and `gtag`, the global names.
 */
export const GTAG_BOOTSTRAP: ManifestStep[] = [
	{
		ifUndefined: true,
		name: '{{dataLayer}}',
		type: 'setGlobal',
		value: [],
	},
	{
		ifUndefined: true,
		name: '{{gtag}}',
		queue: '{{dataLayer}}',
		type: 'defineQueueFunction',
	},
];

/**
 * Every Google Consent Mode v2 consent type, in Google's documented order.
 *
 * @remarks
 * Each type appears exactly once in {@link GOOGLE_CONSENT_MODE_V2_DEFAULT_MAPPING}.
 */
export const GOOGLE_CONSENT_TYPES = [
	'ad_storage',
	'ad_user_data',
	'ad_personalization',
	'analytics_storage',
	'functionality_storage',
	'personalization_storage',
	'security_storage',
] as const;

export type GoogleConsentType = (typeof GOOGLE_CONSENT_TYPES)[number];

/**
 * Default Inth consent category mapping for Google Consent Mode v2.
 *
 * @remarks
 * Shared by direct gtag.js and Google Tag Manager integrations so both emit the
 * same Google storage consent defaults unless a caller provides an override.
 *
 * This is the one source of the mapping. The Swift, Kotlin and React Native
 * helpers are tested against `packages/native-protocol/google-consent-mode/`, which
 * `scripts/generate-google-consent-mode-fixture.ts` writes from this object.
 * After a change here, regenerate the fixture and update the mobile copies,
 * or their tests fail.
 */
export const GOOGLE_CONSENT_MODE_V2_DEFAULT_MAPPING: Record<string, string[]> =
	{
		experience: ['personalization_storage'],
		functionality: ['functionality_storage'],
		marketing: ['ad_storage', 'ad_user_data', 'ad_personalization'],
		measurement: ['analytics_storage'],
		necessary: ['security_storage'],
	};

/**
 * Replaces a manifest's default Google consent mapping with the caller's
 * mapping from Inth consent categories to Google consent types, if one is given.
 */
export const withOptionalConsentMapping = function withOptionalConsentMapping<
	TManifest extends {
		consentMapping?: Record<string, string[]>;
	},
>(
	manifest: TManifest,
	consentMapping: Record<string, string[]> | undefined
): TManifest {
	if (consentMapping === undefined) {
		return manifest;
	}

	return {
		...manifest,
		consentMapping,
	};
};
