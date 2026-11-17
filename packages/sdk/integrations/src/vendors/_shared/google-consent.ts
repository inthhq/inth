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

/** One Google Consent Mode v2 consent type. */
export type GoogleConsentType = (typeof GOOGLE_CONSENT_TYPES)[number];

/**
 * Default c15t consent category mapping for Google Consent Mode v2.
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
 *
 * @example
 * ```ts
 * const manifest = {
 * 	consentMapping: GOOGLE_CONSENT_MODE_V2_DEFAULT_MAPPING,
 * };
 * ```
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
 * Applies an optional Google consent mapping override to a manifest.
 *
 * @param manifest - Vendor manifest that already contains the default consent
 * mapping.
 * @param consentMapping - Optional caller-provided mapping from c15t consent
 * categories to Google consent types.
 * @returns The original manifest when no override is provided, or a shallow
 * copy with the override mapping when one is provided.
 *
 * @example
 * ```ts
 * const customMapping: Record<string, string[]> = {
 * 	marketing: ['ad_storage'],
 * };
 * const mapped = withOptionalConsentMapping<TManifest>(
 * 	manifest,
 * 	customMapping
 * );
 * ```
 *
 * @example
 * ```ts
 * const unchanged = withOptionalConsentMapping<TManifest>(
 * 	manifest,
 * 	undefined
 * );
 * ```
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
