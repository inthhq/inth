import type { AllConsentNames } from '../protocol/vocabulary';

/**
 * Every Google Consent Mode v2 consent type, in Google's documented order.
 *
 * Mirrors `GOOGLE_CONSENT_TYPES` in `@c15t/integrations`.
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
 * The c15t category that grants each Google Consent Mode v2 type.
 *
 * The same mapping the web's gtag.js and Google Tag Manager helpers use.
 * `src/integrations/__tests__/google-consent-mode.test.ts` checks it against
 * `native/protocol/google-consent-mode/consent-mode-v2.json`, which is
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
 * Resolve every Google Consent Mode v2 type from c15t consent.
 *
 * A type is granted when the category that grants it is allowed. Pass
 * `client.isAllowed` to read the native core, so a pending policy denies every
 * optional type.
 *
 * @param isAllowed - Whether a c15t category is allowed.
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
