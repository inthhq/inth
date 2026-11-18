/**
 * Browser storage the IAB addon writes: its authority receipt in
 * localStorage, and the TC and AC strings under the same name as a cookie
 * and a localStorage entry. Core clears them without loading the addon.
 *
 * @public
 */
export const IAB_STORAGE_KEYS = {
	/**
	 * Google Additional Consent string. Named after the `addtl_consent` URL
	 * parameter Google defines for the same value.
	 */
	additionalConsent: 'addtl_consent',
	authority: 'inth-iab-authority-v1',
	/** TC string, under the name the TCF spec gives the cookie. */
	tcString: 'euconsent-v2',
} as const;
