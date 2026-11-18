package com.inth.android.integrations

import com.inth.core.ConsentCore
import com.inth.core.model.ConsentCategory

/**
 * Keep the Adjust SDK enabled only while one category allows it, and send
 * third-party sharing with Google's DMA options.
 *
 * In [trackThirdPartySharing], build `AdjustThirdPartySharing(adUserData)` and add
 * the `google_dma` granular options: `eea` (yours to supply, since Inth's policy
 * model is not a legal jurisdiction flag), `ad_personalization` and
 * `ad_user_data`, each `"1"` or `"0"`. Then pass it to
 * `Adjust.trackThirdPartySharing`. Marketing grants both types, as on the web.
 *
 * While [category] is denied or pending, the helper calls [disable]. Adjust sends
 * nothing while disabled and keeps that state across launches. When the category
 * is granted, it calls [enable] once per grant and then sends third-party sharing,
 * because Adjust ignores calls made while disabled. A consent change while Adjust
 * runs sends third-party sharing again. Connect it before `Adjust.initSdk`; Adjust
 * holds both calls until initialization. The helper adds no Adjust dependency.
 *
 * Callbacks run synchronously on the publishing thread, serialized per helper.
 * Retain the helper for the SDK's lifetime and [close] it during teardown.
 *
 * @param core The same installed native core used by the consent UI.
 * @param category Optional category that lets Adjust run. Defaults to marketing.
 * @param enable Call `Adjust.enable`.
 * @param disable Call `Adjust.disable`.
 * @param trackThirdPartySharing Send the consent with `Adjust.trackThirdPartySharing`.
 * @param onError Report automatic vendor-update failures without throwing. Explicit
 * construction, sync and close failures still throw to their caller.
 * @throws IllegalArgumentException If category is necessary.
 */
class AdjustIntegration(
	core: ConsentCore,
	category: ConsentCategory = ConsentCategory.MARKETING,
	enable: () -> Unit,
	disable: () -> Unit,
	trackThirdPartySharing: (GoogleAdsConsent) -> Unit,
	onError: (Exception) -> Unit,
) : AutoCloseable {
	private val binding = ConsentBinding(core, category, onError, trackingAndAds(category)) { previous, (tracking), current ->
		if (tracking) {
			if (previous?.first != true) enable()
			// A withdrawal during enable is applied next, without sharing.
			val (stillTracking, ads) = current()
			if (stillTracking) trackThirdPartySharing(ads)
		} else {
			disable()
		}
	}

	/** Reapply current consent after the app resets Adjust. No-op after close. */
	fun sync() = binding.sync()

	/** Stop observing and disable Adjust. Safe to call more than once. */
	override fun close() = binding.close()
}
