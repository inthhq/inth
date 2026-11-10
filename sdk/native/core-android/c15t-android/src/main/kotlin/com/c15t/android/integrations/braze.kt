package com.c15t.android.integrations

import com.c15t.core.ConsentCore
import com.c15t.core.model.ConsentCategory

/**
 * Keep the Braze SDK enabled only while one category allows it, and record
 * Google's DMA consent on the Braze user.
 *
 * While [category] is denied or pending, the helper calls [disableSdk]. When it is
 * granted, it calls [enableSdk] and then [setGoogleAdsConsent]. Set Braze's
 * `$google_ad_user_data` and `$google_ad_personalization` custom attributes there,
 * as Booleans, from `adUserData` and `adPersonalization`. Braze forwards them to
 * Google in Audience Sync. Marketing grants both, and is the default category, as
 * for the web's email and messaging helpers. The helper adds no Braze dependency.
 *
 * On withdrawal from a running state, the helper records the denied attributes
 * before disabling, so Audience Sync stops treating the user as consented. It never
 * writes attributes to a Braze user that was not running under consent. After
 * `changeUser`, call [sync] to record the attributes on the new user.
 *
 * Callbacks run synchronously on the publishing thread, serialized per helper.
 * Retain the helper for the SDK's lifetime and [close] it during teardown.
 *
 * @param core The same installed native core used by the consent UI.
 * @param category Optional category that lets Braze run. Defaults to marketing.
 * @param enableSdk Call `Braze.enableSdk`.
 * @param disableSdk Call `Braze.disableSdk`.
 * @param setGoogleAdsConsent Set the two custom attributes on the current user.
 * @param onError Report automatic vendor-update failures without throwing. Explicit
 * construction, sync and close failures still throw to their caller.
 * @throws IllegalArgumentException If category is necessary.
 */
class BrazeIntegration(
	core: ConsentCore,
	category: ConsentCategory = ConsentCategory.MARKETING,
	enableSdk: () -> Unit,
	disableSdk: () -> Unit,
	setGoogleAdsConsent: (GoogleAdsConsent) -> Unit,
	onError: (Exception) -> Unit,
) : AutoCloseable {
	private val binding = ConsentBinding(core, category, onError, trackingAndAds(category)) { previous, (tracking, ads), current ->
		if (tracking) {
			if (previous?.first != true) enableSdk()
			// A withdrawal during enable is applied next.
			val (stillTracking, now) = current()
			if (stillTracking) setGoogleAdsConsent(now)
		} else {
			if (previous?.first == true) setGoogleAdsConsent(ads)
			disableSdk()
		}
	}

	/** Reapply current consent, for example after `changeUser`. No-op after close. */
	fun sync() = binding.sync()

	/** Stop observing and disable Braze. Safe to call more than once. */
	override fun close() = binding.close()
}
