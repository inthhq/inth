package com.inth.android.integrations

import com.inth.core.ConsentCore
import com.inth.core.model.ConsentCategory

/**
 * Keep Amplitude Analytics opt-out in sync with one native category.
 *
 * Initialize Amplitude with `optOut = true`, then pass a call that sets
 * `amplitude.optOut` on the same instance. Pending, denied and closed states opt
 * out. Amplitude drops events while opted out. This helper adds no Amplitude
 * dependency and does not configure session replay or other Amplitude products.
 *
 * Callbacks run synchronously on the publishing thread, serialized per helper.
 * Retain the helper for the SDK's lifetime and [close] it during teardown.
 *
 * @param core The same installed native core used by the consent UI.
 * @param category Optional category controlling tracking. Defaults to measurement.
 * @param setOptOut Set Amplitude's `optOut`.
 * @param onError Report automatic vendor-update failures without throwing. Explicit
 * construction, sync and close failures still throw to their caller.
 * @throws IllegalArgumentException If category is necessary.
 */
class AmplitudeIntegration(
	core: ConsentCore,
	category: ConsentCategory = ConsentCategory.MEASUREMENT,
	setOptOut: (Boolean) -> Unit,
	onError: (Exception) -> Unit,
) : AutoCloseable {
	private val binding = AnalyticsConsentBinding(core, category, onError) { allowed, stillAllowed ->
		setOptOut(!(allowed && stillAllowed()))
	}

	/** Reapply current consent after the app resets Amplitude. No-op after close. */
	fun sync() = binding.sync()

	/** Stop observing and opt out. Safe to call more than once. */
	override fun close() = binding.close()
}
