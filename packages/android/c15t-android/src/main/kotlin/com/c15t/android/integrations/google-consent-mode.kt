package com.c15t.android.integrations

import com.c15t.core.ConsentCore
import com.c15t.core.model.ConsentCategory

/**
 * A Google Consent Mode v2 consent type and the c15t category that grants it.
 *
 * The mapping is the web's (`@c15t/integrations`). `GoogleConsentModeTest` checks
 * it against `native/protocol/google-consent-mode/consent-mode-v2.json`, which is
 * generated from the web module, so a change on the web fails here until this
 * copy follows.
 *
 * @property key The type's name in Google's APIs, such as `ad_storage`.
 * @property category The c15t category that grants this type.
 */
enum class GoogleConsentType(val key: String, val category: ConsentCategory) {
	AD_STORAGE("ad_storage", ConsentCategory.MARKETING),
	AD_USER_DATA("ad_user_data", ConsentCategory.MARKETING),
	AD_PERSONALIZATION("ad_personalization", ConsentCategory.MARKETING),
	ANALYTICS_STORAGE("analytics_storage", ConsentCategory.MEASUREMENT),
	FUNCTIONALITY_STORAGE("functionality_storage", ConsentCategory.FUNCTIONALITY),
	PERSONALIZATION_STORAGE("personalization_storage", ConsentCategory.EXPERIENCE),
	SECURITY_STORAGE("security_storage", ConsentCategory.NECESSARY),
}

/**
 * Google Consent Mode v2 state from c15t consent, for vendor helpers and app code.
 *
 * A type is granted when the category that grants it is allowed. A pending policy
 * denies every optional category, so it denies every type except `security_storage`.
 */
object GoogleConsentMode {
	/** Each c15t category and the types it grants. */
	val mapping: Map<ConsentCategory, List<GoogleConsentType>> =
		GoogleConsentType.entries.groupBy { it.category }

	/**
	 * Resolve every type from a category reader.
	 *
	 * @param isAllowed Whether a c15t category is allowed.
	 * @return Every [GoogleConsentType], granted (`true`) or denied (`false`).
	 */
	fun consent(isAllowed: (ConsentCategory) -> Boolean): Map<GoogleConsentType, Boolean> =
		GoogleConsentType.entries.associateWith { isAllowed(it.category) }

	/**
	 * Resolve every type from the core's current consent.
	 *
	 * @param core The installed native core.
	 * @return Every [GoogleConsentType], granted (`true`) or denied (`false`).
	 */
	fun consent(core: ConsentCore): Map<GoogleConsentType, Boolean> = consent(core::isAllowed)
}

/**
 * The three Consent Mode v2 advertising types, for vendor helpers that forward
 * Google's EEA consent signals. All three follow marketing, as on the web. See
 * [GoogleConsentMode].
 *
 * @property adStorage `ad_storage`: advertising identifiers and storage on the device.
 * @property adUserData `ad_user_data`: sending user data to Google for advertising.
 * @property adPersonalization `ad_personalization`: personalized advertising.
 */
data class GoogleAdsConsent(
	val adStorage: Boolean,
	val adUserData: Boolean,
	val adPersonalization: Boolean,
)

/** Read the advertising types from [GoogleConsentMode] through a category reader. */
internal fun googleAds(isAllowed: (ConsentCategory) -> Boolean): GoogleAdsConsent {
	val consent = GoogleConsentMode.consent(isAllowed)
	return GoogleAdsConsent(
		adStorage = consent[GoogleConsentType.AD_STORAGE] == true,
		adUserData = consent[GoogleConsentType.AD_USER_DATA] == true,
		adPersonalization = consent[GoogleConsentType.AD_PERSONALIZATION] == true,
	)
}

/**
 * Read whether [category] allows the vendor to run, with the advertising types.
 *
 * @throws IllegalArgumentException If category is necessary.
 */
internal fun trackingAndAds(category: ConsentCategory): ((ConsentCategory) -> Boolean) -> Pair<Boolean, GoogleAdsConsent> {
	require(category.optional) { "Vendor integrations require an optional consent category." }
	return { isAllowed -> isAllowed(category) to googleAds(isAllowed) }
}
