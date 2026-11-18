package com.inth.android.integrations

import com.inth.core.ConsentCore
import com.inth.core.model.ConsentCategory

/**
 * The Branch consumer protection attribution level [BranchIntegration] sets.
 * Map each to Branch's `Defines.BranchAttributionLevel` of the same name.
 */
enum class BranchAttribution {
	/** Marketing is granted: advertising and device identifiers. */
	FULL,

	/** Only measurement is granted: device identifiers, no advertising frameworks. */
	MINIMAL,

	/** Neither is granted: deterministic deep linking only. */
	NONE,
}

/**
 * Keep Branch's attribution level and Google DMA parameters in sync with consent.
 *
 * Marketing sets [BranchAttribution.FULL]. Measurement alone sets
 * [BranchAttribution.MINIMAL], Branch's analytics-only level. Anything else,
 * including pending consent, sets [BranchAttribution.NONE], which keeps deep links
 * working. In [setDMAParamsForEEA], call Branch's method of the same name with
 * your own EEA flag, since Inth's policy model is not a legal jurisdiction flag,
 * then `adPersonalization` and `adUserData`. Marketing grants both, as on the web.
 * The helper adds no Branch dependency.
 *
 * When lowering the level, both calls run even if the first throws, and the
 * failure is reported.
 *
 * Connect before Branch initializes its session so the first request carries the
 * level. Callbacks run synchronously on the publishing thread, serialized per
 * helper. Retain the helper for the SDK's lifetime and [close] it during teardown.
 *
 * @param core The same installed native core used by the consent UI.
 * @param setConsumerProtectionAttributionLevel Call Branch's method of the same name.
 * @param setDMAParamsForEEA Call Branch's method of the same name.
 * @param onError Report automatic vendor-update failures without throwing. Explicit
 * construction, sync and close failures still throw to their caller.
 */
class BranchIntegration(
	core: ConsentCore,
	setConsumerProtectionAttributionLevel: (BranchAttribution) -> Unit,
	setDMAParamsForEEA: (GoogleAdsConsent) -> Unit,
	onError: (Exception) -> Unit,
) : AutoCloseable {
	private val binding = ConsentBinding(core, ConsentCategory.MARKETING, onError, read = { isAllowed ->
		val level = when {
			isAllowed(ConsentCategory.MARKETING) -> BranchAttribution.FULL
			isAllowed(ConsentCategory.MEASUREMENT) -> BranchAttribution.MINIMAL
			else -> BranchAttribution.NONE
		}
		level to googleAds(isAllowed)
	}) { _, (level, ads), current ->
		// Lower the level before sending denials; send grants before raising it.
		if (level == BranchAttribution.FULL) {
			setDMAParamsForEEA(ads)
			setConsumerProtectionAttributionLevel(current().first)
		} else {
			runAll({ setConsumerProtectionAttributionLevel(level) }, { setDMAParamsForEEA(ads) })
		}
	}

	/** Reapply current consent after the app changes Branch's settings. No-op after close. */
	fun sync() = binding.sync()

	/** Stop observing and set [BranchAttribution.NONE]. Safe to call more than once. */
	override fun close() = binding.close()
}
