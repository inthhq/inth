package com.inth.android.integrations

import com.inth.core.ConsentCore
import com.inth.core.model.ConsentCategory

/**
 * Keep Google Mobile Ads (AdMob) privacy settings in sync with native consent.
 *
 * Sends the three Consent Mode advertising types, which marketing grants, as on
 * the web. Map them in [setConsent]: when [GoogleAdsConsent.adStorage] is denied,
 * write `gad_has_consent_for_cookies = 0` to the default SharedPreferences, which
 * turns on limited ads; remove the key when it is granted. When
 * [GoogleAdsConsent.adPersonalization] or [GoogleAdsConsent.adUserData] is
 * denied, set the request configuration's publisher privacy personalization
 * state to `DISABLED` and write `gad_rdp = 1`; set `ENABLED` and remove the key
 * when both are granted. The helper adds no Google Mobile Ads dependency.
 *
 * In the EEA, UK and Switzerland, Google serves personalized or non-personalized
 * ads only with a TC string from a Google-certified CMP. These settings do not
 * replace that. Under an IAB policy, the native core writes the `IABTCF_` keys
 * Google reads.
 *
 * Callbacks run synchronously on the publishing thread, serialized per helper.
 * Retain the helper for the SDK's lifetime and [close] it during teardown.
 *
 * @param core The same installed native core used by the consent UI.
 * @param setConsent Apply the advertising types to Google Mobile Ads.
 * @param onError Report automatic vendor-update failures without throwing. Explicit
 * construction, sync and close failures still throw to their caller.
 */
class AdMobIntegration(
	core: ConsentCore,
	setConsent: (GoogleAdsConsent) -> Unit,
	onError: (Exception) -> Unit,
) : AutoCloseable {
	private val binding = ConsentBinding(core, ConsentCategory.MARKETING, onError, { googleAds(it) }) { _, consent, _ ->
		setConsent(consent)
	}

	/** Reapply current consent after the app resets the SDK's settings. No-op after close. */
	fun sync() = binding.sync()

	/** Stop observing and deny every advertising type. Safe to call more than once. */
	override fun close() = binding.close()
}
