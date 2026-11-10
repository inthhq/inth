package com.c15t.android.integrations

import com.c15t.core.ConsentCore
import com.c15t.core.model.ConsentCategory

/**
 * Keep AppsFlyer running only while one category allows it, and send Google's
 * DMA consent through AppsFlyer's consent API.
 *
 * Map [GoogleAdsConsent] to AppsFlyer's `AppsFlyerConsent` in [setConsentData]:
 * `hasConsentForDataUsage` from `adUserData`, `hasConsentForAdsPersonalization`
 * from `adPersonalization` and `hasConsentForAdStorage` from `adStorage`.
 * `isUserSubjectToGDPR` is yours to supply: c15t's policy model is not a legal
 * jurisdiction flag. Marketing grants all three types, as on the web.
 *
 * Written against AppsFlyer Android SDK 6. SDK 7 starts sessions only from its
 * session-ready listener, which this helper does not coordinate.
 *
 * Do not call AppsFlyer's `start` yourself. While [category] is denied or pending,
 * the helper calls `stop(true)`. When it is granted, it calls `stop(false)` and
 * then [start], which AppsFlyer requires to resume. On withdrawal both denial
 * calls run even if the first throws, and the first failure is reported. A change that keeps
 * [category] granted sends the new consent data without starting again. The
 * helper adds no AppsFlyer dependency.
 *
 * Callbacks run synchronously on the publishing thread, serialized per helper.
 * Retain the helper for the SDK's lifetime and [close] it during teardown.
 *
 * @param core The same installed native core used by the consent UI.
 * @param category Optional category that lets AppsFlyer run. Defaults to marketing.
 * @param setConsentData Pass the consent to `AppsFlyerLib.setConsentData`.
 * @param stop Call `AppsFlyerLib.stop` with the given value.
 * @param start Call `AppsFlyerLib.start`.
 * @param onError Report automatic vendor-update failures without throwing. Explicit
 * construction, sync and close failures still throw to their caller.
 * @throws IllegalArgumentException If category is necessary.
 */
class AppsFlyerIntegration(
	core: ConsentCore,
	category: ConsentCategory = ConsentCategory.MARKETING,
	setConsentData: (GoogleAdsConsent) -> Unit,
	stop: (Boolean) -> Unit,
	start: () -> Unit,
	onError: (Exception) -> Unit,
) : AutoCloseable {
	private val binding = ConsentBinding(core, category, onError, trackingAndAds(category)) { previous, (tracking, ads), current ->
		if (tracking) {
			setConsentData(ads)
			if (previous?.first != true && current().first) {
				stop(false)
				if (current().first) start()
			}
		} else {
			runAll({ stop(true) }, { setConsentData(ads) })
		}
	}

	/** Reapply current consent, starting AppsFlyer again if allowed. No-op after close. */
	fun sync() = binding.sync()

	/** Stop observing and stop AppsFlyer. Safe to call more than once. */
	override fun close() = binding.close()
}
