import type { AllConsentNames } from '../protocol/consent-vocabulary.model';

/**
 * Every Google Consent Mode v2 consent type, in Google's documented order.
 *
 * Mirrors `GOOGLE_CONSENT_TYPES` in `@inth/integrations`.
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

/** One Google Consent Mode v2 consent type. */
export type GoogleConsentType = (typeof GOOGLE_CONSENT_TYPES)[number];

/**
 * The Inth category that grants each Google Consent Mode v2 type.
 *
 * The same mapping the web's gtag.js and Google Tag Manager helpers use.
 * `src/integrations/__tests__/google-consent-mode.model.test.ts` checks it against
 * `packages/native-protocol/google-consent-mode/consent-mode-v2.json`, which is
 * generated from the web module, as are the Swift and Kotlin copies.
 */
export const GOOGLE_CONSENT_MODE_CATEGORIES: Readonly<
	Record<GoogleConsentType, AllConsentNames>
> = {
	ad_personalization: 'marketing',
	ad_storage: 'marketing',
	ad_user_data: 'marketing',
	analytics_storage: 'measurement',
	functionality_storage: 'functionality',
	personalization_storage: 'experience',
	security_storage: 'necessary',
};

/** Whether each Google Consent Mode v2 type is granted. */
export type GoogleConsentModeState = Readonly<
	Record<GoogleConsentType, boolean>
>;

/**
 * Resolve every Google Consent Mode v2 type from Inth consent.
 *
 * A type is granted when the category that grants it is allowed. Pass
 * `client.isAllowed` to read the native core, so a pending policy denies every
 * optional type.
 *
 * @param isAllowed - Whether an Inth category is allowed.
 * @returns `true` or `false` for each of the seven types.
 * @example
 * ```ts
 * const consent = resolveGoogleConsentMode(getConsentClient().isAllowed);
 * if (consent.ad_storage) loadAds();
 * ```
 */
export const resolveGoogleConsentMode = (
	isAllowed: (category: AllConsentNames) => boolean
): GoogleConsentModeState => {
	const state = {} as Record<GoogleConsentType, boolean>;
	for (const type of GOOGLE_CONSENT_TYPES) {
		state[type] = isAllowed(GOOGLE_CONSENT_MODE_CATEGORIES[type]);
	}
	return state;
};

/**
 * The three Consent Mode v2 advertising types, for vendor helpers that forward
 * Google's EEA consent signals. All three follow marketing, as on the web.
 */
export interface GoogleAdsConsent {
	/** `ad_storage`: advertising identifiers and storage on the device. */
	readonly adStorage: boolean;
	/** `ad_user_data`: sending user data to Google for advertising. */
	readonly adUserData: boolean;
	/** `ad_personalization`: personalized advertising. */
	readonly adPersonalization: boolean;
}

/**
 * Resolve the advertising types from Inth consent.
 *
 * @param isAllowed - Whether an Inth category is allowed.
 * @returns The three advertising types, each granted (`true`) or denied.
 */
export const resolveGoogleAdsConsent = (
	isAllowed: (category: AllConsentNames) => boolean
): GoogleAdsConsent => {
	const consent = resolveGoogleConsentMode(isAllowed);
	return {
		adPersonalization: consent.ad_personalization,
		adStorage: consent.ad_storage,
		adUserData: consent.ad_user_data,
	};
};
